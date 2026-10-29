#!/usr/bin/env bash
# One-time: stop exposing the B19 site on http://<ip>:8080 (a duplicate copy).
# b19-landing joins the band site's Docker network and ww-landing proxies to it
# by container name. Backs up ww-landing's nginx.conf and rolls back on failure.
set -euo pipefail
cd "$(dirname "$0")/.."

CONF=/opt/ww_landing/nginx.conf
MARK="# --- B19 (b19studio.net) ---"
grep -qF "$MARK" "$CONF" || { echo "b19 block not found in $CONF — run deploy/setup-domain.sh first"; exit 1; }

echo "==> 1/4 band site's Docker network"
NET=$(docker inspect ww-landing --format '{{range $k, $v := .NetworkSettings.Networks}}{{$k}} {{end}}' | awk '{print $1}')
[ -n "$NET" ] || { echo "could not find ww-landing's network"; exit 1; }
echo "    $NET"
echo "WW_NETWORK=$NET" > .env

echo "==> 2/4 recreate b19-landing without a public port"
docker compose up -d --force-recreate
sleep 1
docker exec ww-landing wget -q -O /dev/null http://b19-landing/ && echo "    ww-landing can reach b19-landing ✓" \
  || { echo "!! ww-landing cannot reach b19-landing"; exit 1; }

echo "==> 3/4 point the proxy at the container"
cp -p "$CONF" "$CONF.bak-$(date +%Y%m%d-%H%M%S)"
NEW=$(sed \
  -e 's#^\(\s*\)proxy_pass http://2\.28\.230\.117:8080;#\1resolver 127.0.0.11 valid=30s;\n\1set $b19_upstream http://b19-landing:80;\n\1proxy_pass $b19_upstream;#' \
  "$CONF")
printf '%s\n' "$NEW" > "$CONF"        # write in place (keeps the bind-mounted inode)

echo "==> 4/4 test + reload"
if docker exec ww-landing nginx -t; then
  docker exec ww-landing nginx -s reload
else
  echo "!! nginx rejected the config -> rolling back"
  LAST=$(ls -t "$CONF".bak-* | head -1); cat "$LAST" > "$CONF"
  docker exec ww-landing nginx -s reload; exit 1
fi
sleep 1
echo
echo "b19studio.net : $(curl -s -o /dev/null -w '%{http_code}' --resolve b19studio.net:443:127.0.0.1 https://b19studio.net/)  (want 200)"
echo "band site     : $(curl -s -o /dev/null -w '%{http_code}' --resolve whitewaterband.com:443:127.0.0.1 https://whitewaterband.com/)  (want 200)"
echo "port 8080     : $(curl -s -o /dev/null -m 3 -w '%{http_code}' http://2.28.230.117:8080/ || true)  (want 000 = closed)"
