#!/usr/bin/env bash
# site.sh — the same file in every landing-page repo
#   (ww_landing_v2, B19LP, impala-site, supernova-site).
# Everything that differs between the sites lives in site.env next to this file.
#
#   ./site.sh build           build the site into dist/
#   ./site.sh serve           build, then open it on http://localhost:8000
#   ./site.sh preview         publish a copy hidden from Google on http://<server>:PREVIEW_PORT/
#   ./site.sh deploy [--yes]  publish to production (https://DOMAIN); asks first unless --yes
#   ./site.sh rollback        put the previous production files back
#   ./site.sh status          what is running on the server for this site
#
# Server: Hetzner 2.28.230.117 (override: HETZNER_HOST=user@host ./site.sh …).
# Written for the bash 3.2 that ships with macOS; the remote parts run on the server's bash.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")" && pwd)"
cd "$ROOT"
# shellcheck source=/dev/null
. ./site.env

HOST="${HETZNER_HOST:-root@2.28.230.117}"
SERVER_IP="${HOST#*@}"
EDGE=ww-landing                         # nginx container that owns ports 80/443 and HTTPS
EDGE_CONF=/opt/ww_landing/nginx.conf    # its config (bind-mounted single file)
ACME_ROOT=/opt/ww_landing/dist          # where it serves /.well-known/acme-challenge/ from
KIND="${KIND:-container}"
PREVIEW_NAME="${PREVIEW_NAME:-$NAME-preview}"
MEDIA_DIRS="${MEDIA_DIRS:-}"
NO_MEDIA=(--exclude '*.mp3' --exclude '*.flac' --exclude '*.wav')

say() { printf '\n==> %s\n' "$*"; }
die() { printf '!! %s\n' "$*" >&2; exit 1; }

# Run a bash script (stdin) on the server with the named shell variables passed along.
remote() {
  local assign="" v
  for v in "$@"; do assign="$assign $v=$(printf %q "${!v}")"; done
  ssh -o BatchMode=yes "$HOST" "$assign bash -s"
}

# ---------------------------------------------------------------- build

build() {   # $1 = production | preview
  local env="$1"
  say "Building $NAME ($env) into dist/"
  mkdir -p dist
  if [ -n "${PUBLIC:-}" ]; then
    # static files, hard-linked to the originals (no extra disk space for the audio)
    local src="$ROOT"; case "$PUBLIC" in */) src="$ROOT/${PUBLIC%/}" ;; esac
    # shellcheck disable=SC2086
    rsync -a --delete --link-dest="$src" --exclude .DS_Store --exclude README.txt $PUBLIC dist/
  fi
  SITE_ENV="$env" OUT_DIR="$ROOT/dist" bash -c "$BUILD"
  [ -f dist/index.html ] || die "dist/index.html missing after the build"

  if [ "$env" = production ]; then
    local bad
    bad=$(grep -rl --include='*.html' 'noindex' dist | grep -v '/404.html$' || true)
    [ -z "$bad" ] || die "production build contains noindex in: $bad"
    grep -q 'rel="canonical"' dist/index.html || die "dist/index.html has no canonical link"
  else
    grep -q 'noindex' dist/index.html || die "preview build has no noindex tag — refusing"
  fi
  chmod -R u=rwX,go=rX dist
}

# ---------------------------------------------------------------- upload

# Upload dist/ into $1 on the server. Before that, keep a hard-link snapshot of what is
# live now (free on disk) so `./site.sh rollback` can put it back; the last 3 are kept.
upload() {
  local DEST="$1" SEED="${2:-}"
  say "Uploading to $HOST:$DEST"
  remote DEST SEED <<'REMOTE'
set -euo pipefail
mkdir -p "$DEST"
# first deploy into a new folder: start from the old copy so the audio is not uploaded again
if [ -z "$(ls -A "$DEST")" ] && [ -n "$SEED" ] && [ -d "$SEED" ]; then
  echo "    seeding from $SEED"; cp -a "$SEED/." "$DEST/"
fi
if [ -n "$(ls -A "$DEST")" ]; then
  cp -al "$DEST" "$DEST.bak-$(date +%Y%m%d-%H%M%S)"
  ls -dt "$DEST".bak-* | tail -n +4 | xargs -r rm -rf
fi
REMOTE
  # 1) pages, styles, images — exact copy of dist/ (audio and the certificate folder untouched)
  rsync -az --delete --exclude .DS_Store --exclude .well-known "${NO_MEDIA[@]}" dist/ "$HOST:$DEST/"
  # 2) audio — only files that are new or changed in size, never deleted on the server
  local d
  for d in $MEDIA_DIRS; do
    [ -d "dist/$d" ] && rsync -az --size-only --exclude .DS_Store "dist/$d/" "$HOST:$DEST/$d/"
  done
  ssh -o BatchMode=yes "$HOST" "chmod -R a+rX '$DEST'"
}

# Start (or refresh) the site's nginx container. $1 container name, $2 folder, $3 public port (preview only)
container_up() {
  local CNAME="$1" DIR="$2" PORT="${3:-}"
  say "Starting container $CNAME"
  ssh -o BatchMode=yes "$HOST" "mkdir -p '$DIR/nginx'"
  rsync -az deploy/nginx.conf "$HOST:$DIR/nginx/default.conf"
  rsync -az docker-compose.yml compose.preview.yml "$HOST:$DIR/"
  remote CNAME DIR PORT EDGE <<'REMOTE'
set -euo pipefail
cd "$DIR"
NET=$(docker inspect "$EDGE" --format '{{range $k, $v := .NetworkSettings.Networks}}{{$k}} {{end}}' | awk '{print $1}')
FILES=docker-compose.yml; [ -n "$PORT" ] && FILES=docker-compose.yml:compose.preview.yml
printf 'COMPOSE_PROJECT_NAME=%s\nCOMPOSE_FILE=%s\nCONTAINER=%s\nWW_NETWORK=%s\nPREVIEW_PORT=%s\n' \
  "$CNAME" "$FILES" "$CNAME" "${NET:-ww_landing_default}" "$PORT" > .env
# a container with this name left over from an older setup is replaced
if docker ps -a --format '{{.Names}}' | grep -qx "$CNAME"; then
  PROJ=$(docker inspect "$CNAME" --format '{{index .Config.Labels "com.docker.compose.project"}}' 2>/dev/null || true)
  [ "$PROJ" = "$CNAME" ] || { echo "    replacing old container $CNAME (project: ${PROJ:-none})"; docker rm -f "$CNAME" >/dev/null; }
fi
docker compose up -d --remove-orphans
docker exec "$CNAME" nginx -t -q && docker exec "$CNAME" nginx -s reload
REMOTE
}

# ---------------------------------------------------------------- edge proxy (ww-landing)

# Make sure ww-landing serves https://$DOMAIN by proxying to the site's container.
# The block sits between "# >>> NAME" and "# <<< NAME" markers; it is only rewritten when it
# differs from what it should be. Older hand-written blocks (LEGACY_MARK) are replaced.
# Gets the Let's Encrypt certificate the first time. Backs up and rolls back on a bad config.
edge_block() {
  say "Checking the HTTPS proxy for $DOMAIN"
  local LEGACY_MARK="${LEGACY_MARK:-}" ALIASES="${ALIASES:-}"
  remote NAME DOMAIN ALIASES LEGACY_MARK EDGE EDGE_CONF ACME_ROOT SERVER_IP <<'REMOTE'
set -euo pipefail
NAMES="$DOMAIN${ALIASES:+ $ALIASES}"

render() {  # $1 = full | http   (http = only what is needed to get the certificate)
  echo "# >>> $NAME: $DOMAIN (managed by site.sh in the site's repo — do not edit by hand)"
  cat <<NGX
server {
  listen 80;
  listen [::]:80;
  server_name $NAMES;
  location ^~ /.well-known/acme-challenge/ { root /usr/share/nginx/html; default_type text/plain; }
  location / { return 301 https://$DOMAIN\$request_uri; }
}
NGX
  [ "$1" = full ] && cat <<NGX
server {
  listen 443 ssl;
  listen [::]:443 ssl;
  http2 on;
  server_name $NAMES;
  ssl_certificate /etc/letsencrypt/live/$DOMAIN/fullchain.pem;
  ssl_certificate_key /etc/letsencrypt/live/$DOMAIN/privkey.pem;
  ssl_protocols TLSv1.2 TLSv1.3;
  if (\$host != $DOMAIN) { return 301 https://$DOMAIN\$request_uri; }

  # resolve the container by name at request time: ww-landing still starts if it is down
  resolver 127.0.0.11 valid=30s ipv6=off;
  set \$site_upstream http://$NAME:80;
  location / {
    proxy_pass \$site_upstream;
    proxy_http_version 1.1;
    proxy_set_header Host \$host;
    proxy_set_header X-Real-IP \$remote_addr;
    proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto https;
    proxy_buffering off;          # stream audio straight through (seeking works)
  }
}
NGX
  echo "# <<< $NAME"
}

# current config without this site's block (managed or legacy)
strip() {
  awk -v name="$NAME" -v legacy="$LEGACY_MARK" '
    index($0, "# >>> " name ":") == 1 { skip = 1; next }
    skip == 1 && $0 == "# <<< " name { skip = 0; next }
    legacy != "" && index($0, legacy) == 1 { skip = 2; next }
    skip == 2 && /^# (---|>>>)/ { skip = 0 }
    skip && /server_name/ { print > "/tmp/site-sh-removed" }
    skip { next }
    { print }' "$EDGE_CONF" | sed -e :a -e '/^\n*$/{$d;N;ba' -e '}'
}

apply() {  # $1 = full | http
  rm -f /tmp/site-sh-removed
  local new; new="$(strip; echo; render "$1")"
  # safety: only ever remove server blocks for this site's own names
  if [ -f /tmp/site-sh-removed ]; then
    local n
    for n in $(sed 's/server_name//; s/;//' /tmp/site-sh-removed); do
      case " $NAMES " in *" $n "*) ;; *) echo "!! would also remove a block for '$n' — stopping, nothing changed"; exit 1 ;; esac
    done
  fi
  if [ "$new" = "$(cat "$EDGE_CONF")" ]; then echo "    proxy block up to date"; return 0; fi
  local bak="$EDGE_CONF.bak-$(date +%Y%m%d-%H%M%S)"
  cp -p "$EDGE_CONF" "$bak"
  printf '%s\n' "$new" > "$EDGE_CONF"        # write in place: the file is bind-mounted
  if docker exec "$EDGE" nginx -t -q; then
    docker exec "$EDGE" nginx -s reload; echo "    updated (backup: $bak)"
  else
    echo "!! nginx rejected the new config — restoring $bak"; cat "$bak" > "$EDGE_CONF"
    docker exec "$EDGE" nginx -s reload; exit 1
  fi
  ls -t "$EDGE_CONF".bak-* | tail -n +11 | xargs -r rm -f
}

if [ ! -f "/etc/letsencrypt/live/$DOMAIN/fullchain.pem" ]; then
  for h in $NAMES; do
    got=$(getent ahostsv4 "$h" | awk 'NR==1{print $1}' || true)
    [ "$got" = "$SERVER_IP" ] || { echo "!! $h points to '${got:-nothing}', not $SERVER_IP — fix DNS first"; exit 1; }
  done
  apply http
  command -v certbot >/dev/null || { apt-get update -qq && DEBIAN_FRONTEND=noninteractive apt-get install -y -qq certbot; }
  args=(); for h in $NAMES; do args+=(-d "$h"); done
  certbot certonly --webroot -w "$ACME_ROOT" "${args[@]}" --cert-name "$DOMAIN" \
    --non-interactive --agree-tos --register-unsafely-without-email --keep-until-expiring
fi
apply full

# renewals: reload ww-landing after certbot renews any certificate
mkdir -p /etc/letsencrypt/renewal-hooks/deploy
printf '#!/bin/sh\ndocker exec %s nginx -s reload\n' "$EDGE" > /etc/letsencrypt/renewal-hooks/deploy/reload-ww-landing.sh
chmod +x /etc/letsencrypt/renewal-hooks/deploy/reload-ww-landing.sh
REMOTE
}

# Old hosting that the new container replaces (host nginx site on a public port).
legacy_cleanup() {
  [ -n "${LEGACY_HOST_SITE:-}" ] || return 0
  local SITE="$LEGACY_HOST_SITE"
  remote SITE <<'REMOTE'
set -euo pipefail
[ -e "/etc/nginx/sites-enabled/$SITE" ] || exit 0
echo "    switching off the old host-nginx copy ($SITE)"
rm -f "/etc/nginx/sites-enabled/$SITE"
if [ -z "$(ls -A /etc/nginx/sites-enabled 2>/dev/null)" ] && [ -z "$(ls /etc/nginx/conf.d/*.conf 2>/dev/null)" ]; then
  systemctl disable --now nginx >/dev/null 2>&1 || true; echo "    host nginx has nothing left to serve — stopped"
else
  nginx -t -q && systemctl reload nginx
fi
REMOTE
}

check() {  # $1 = URL as seen from the server, $2 = optional --resolve host
  local URL="$1" RES="${2:-}"
  remote URL RES <<'REMOTE'
code=$(curl -s -o /dev/null -w '%{http_code}' ${RES:+--resolve "$RES:443:127.0.0.1"} "$URL" || true)
echo "    $code  $URL"
REMOTE
}

# ---------------------------------------------------------------- commands

cmd_deploy() {
  [ -n "${DOMAIN:-}" ] || die "$NAME has no domain yet (DOMAIN in site.env) — use ./site.sh preview"
  if [ "${1:-}" != "--yes" ]; then
    read -r -p "Publish $NAME to https://$DOMAIN/ ? [y/N] " a
    case "$a" in y|Y) ;; *) echo "Cancelled."; exit 1 ;; esac
  fi
  build production
  if [ "$KIND" = edge ]; then
    upload "$EDGE_DIR"
  else
    upload "/opt/$NAME/html" "${LEGACY_SEED:-}"
    container_up "$NAME" "/opt/$NAME"
    edge_block
    [ "${LEGACY_PHASE:-production}" = production ] && legacy_cleanup
  fi
  check "https://$DOMAIN/" "$DOMAIN"
  echo "Live: https://$DOMAIN/   (undo: ./site.sh rollback)"
}

cmd_preview() {
  [ -n "${PREVIEW_PORT:-}" ] || die "no PREVIEW_PORT in site.env"
  build preview
  upload "/opt/$PREVIEW_NAME/html" "${LEGACY_PREVIEW_SEED:-}"
  [ "${LEGACY_PHASE:-}" = preview ] && legacy_cleanup      # frees the port it used
  container_up "$PREVIEW_NAME" "/opt/$PREVIEW_NAME" "$PREVIEW_PORT"
  check "http://127.0.0.1:$PREVIEW_PORT/"
  echo "Preview (hidden from Google): http://$SERVER_IP:$PREVIEW_PORT/"
}

cmd_rollback() {
  local DEST="/opt/$NAME/html"; [ "$KIND" = edge ] && DEST="$EDGE_DIR"
  remote DEST <<'REMOTE'
set -euo pipefail
LAST=$(ls -dt "$DEST".bak-* 2>/dev/null | head -1)
[ -n "$LAST" ] || { echo "!! no backup next to $DEST"; exit 1; }
rsync -a --delete --exclude .well-known "$LAST/" "$DEST/"
rm -rf "$LAST"
echo "    restored $LAST"
REMOTE
  [ -n "${DOMAIN:-}" ] && check "https://$DOMAIN/" "$DOMAIN"
}

cmd_status() {
  local N1="$NAME" N2="$PREVIEW_NAME"
  remote N1 N2 <<'REMOTE'
docker ps -a --format '    {{.Names}}  {{.Status}}  {{.Ports}}' | grep -E "^    ($N1|$N2) " || echo "    no container for $N1 / $N2"
REMOTE
  [ -n "${DOMAIN:-}" ] && check "https://$DOMAIN/" "$DOMAIN"
  [ -n "${PREVIEW_PORT:-}" ] && check "http://127.0.0.1:$PREVIEW_PORT/"
  true
}

# without a domain the site can only be built hidden from search engines
DEFAULT_ENV=production; [ -n "${DOMAIN:-}" ] || DEFAULT_ENV=preview

case "${1:-help}" in
  build)    build "$DEFAULT_ENV" ;;
  serve)    build "$DEFAULT_ENV"; say "http://localhost:8000  (Ctrl+C to stop)"; cd dist && python3 -m http.server 8000 ;;
  preview)  cmd_preview ;;
  deploy)   shift; cmd_deploy "$@" ;;
  rollback) cmd_rollback ;;
  status)   cmd_status ;;
  *)        sed -n '2,13p' "$0" | sed 's/^# \{0,1\}//' ;;
esac
