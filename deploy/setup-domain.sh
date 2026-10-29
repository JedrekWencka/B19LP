#!/usr/bin/env bash
# One-time setup: serve b19studio.net (HTTPS) through the band site's nginx (ww-landing),
# which owns ports 80/443. whitewaterband.com is left untouched.
#   - gets a Let's Encrypt certificate for b19studio.net + www (webroot, same as the band site)
#   - appends a b19studio.net server block to /opt/ww_landing/nginx.conf
#   - proxies it to the B19 container on :8080
# Safe to re-run. Backs up nginx.conf and rolls back if nginx rejects the new config.
set -euo pipefail

DOMAIN=b19studio.net
WWW=www.b19studio.net
CONF=/opt/ww_landing/nginx.conf
WEBROOT=/opt/ww_landing/dist
UPSTREAM=http://2.28.230.117:8080
MARK="# --- B19 (b19studio.net) ---"
HOOK="docker exec ww-landing nginx -s reload"

echo "==> 1/4 checking"
docker ps --format '{{.Names}}' | grep -qx ww-landing  || { echo "ww-landing not running"; exit 1; }
docker ps --format '{{.Names}}' | grep -qx b19-landing || { echo "b19-landing not running"; exit 1; }
curl -fsS -o /dev/null "$UPSTREAM/" || { echo "B19 site not answering on $UPSTREAM"; exit 1; }

echo "==> 2/4 certificate for $DOMAIN + $WWW"
if [ -f /etc/letsencrypt/live/$DOMAIN/fullchain.pem ]; then
  echo "    already exists, skipping"
elif command -v certbot >/dev/null; then
  certbot certonly --webroot -w "$WEBROOT" -d "$DOMAIN" -d "$WWW" \
    --non-interactive --agree-tos --register-unsafely-without-email \
    --deploy-hook "$HOOK"
else
  echo "    certbot not installed on host -> using certbot docker image"
  docker run --rm -v /etc/letsencrypt:/etc/letsencrypt -v /var/lib/letsencrypt:/var/lib/letsencrypt \
    -v "$WEBROOT":"$WEBROOT" certbot/certbot certonly --webroot -w "$WEBROOT" \
    -d "$DOMAIN" -d "$WWW" --non-interactive --agree-tos --register-unsafely-without-email
  echo "    NOTE: renewals for this cert must be run the same way (docker certbot renew)."
fi

echo "==> 3/4 nginx config"
if grep -qF "$MARK" "$CONF"; then
  echo "    b19 block already present, skipping"
else
  cp -p "$CONF" "$CONF.bak-$(date +%Y%m%d-%H%M%S)"
  # append with >> so the file keeps its inode (it's bind-mounted as a single file)
  cat >> "$CONF" <<NGINX

$MARK
server {
  listen 80;
  listen [::]:80;
  server_name $DOMAIN $WWW;

  location ^~ /.well-known/acme-challenge/ {
    root /usr/share/nginx/html;
    default_type text/plain;
  }

  location / {
    return 301 https://$DOMAIN\$request_uri;
  }
}

server {
  listen 443 ssl;
  listen [::]:443 ssl;
  http2 on;
  server_name $DOMAIN $WWW;

  ssl_certificate /etc/letsencrypt/live/$DOMAIN/fullchain.pem;
  ssl_certificate_key /etc/letsencrypt/live/$DOMAIN/privkey.pem;
  ssl_protocols TLSv1.2 TLSv1.3;

  if (\$host = $WWW) { return 301 https://$DOMAIN\$request_uri; }

  location / {
    proxy_pass $UPSTREAM;
    proxy_http_version 1.1;
    proxy_set_header Host \$host;
    proxy_set_header X-Real-IP \$remote_addr;
    proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto https;
    proxy_buffering off;          # stream audio straight through (range requests work)
  }
}
NGINX
fi

echo "==> 4/4 test + reload"
if docker exec ww-landing nginx -t; then
  docker exec ww-landing nginx -s reload
else
  echo "!! nginx rejected the config -> rolling back"
  LAST=$(ls -t "$CONF".bak-* | head -1)
  cat "$LAST" > "$CONF"          # restore in place (keeps inode)
  docker exec ww-landing nginx -t && docker exec ww-landing nginx -s reload
  exit 1
fi

sleep 1
echo
echo "B19:  $(curl -s -o /dev/null -w '%{http_code}' --resolve $DOMAIN:443:127.0.0.1 https://$DOMAIN/)  https://$DOMAIN"
echo "Band: $(curl -s -o /dev/null -w '%{http_code}' --resolve whitewaterband.com:443:127.0.0.1 https://whitewaterband.com/)  https://whitewaterband.com"
echo "Done."
