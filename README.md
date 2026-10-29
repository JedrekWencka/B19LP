# B19LP

B19 landing page — portfolio of recording, mixing and mastering work by Jędrzej Wencka.

Plain HTML/CSS/JS, no build step.

```
site/
  index.html
  css/styles.css
  js/main.js        # animations & interactions
  js/work-data.js   # ← portfolio list, edit this to add your work
  assets/
docker-compose.yml  # nginx container (no public port; reached via the band site's proxy)
deploy/nginx/default.conf
deploy/update.sh    # pull + restart, run on the server
```

## Languages (EN / PL)

English is at `/`, Polish at `/pl/`. Both pages are **generated** — don't edit
`site/index.html` or `site/pl/index.html` by hand. Instead edit:

- `src/index.template.html` — the page layout (with `{{placeholders}}`)
- `src/i18n.json` — all texts, in `en` and `pl`

then run `python3 tools/build.py`. It also writes `site/sitemap.xml` and `site/robots.txt`.
Button labels in the player (PLAY / ODTWÓRZ…) live at the top of `site/js/main.js`.

## Preview locally

Open `site/index.html` in a browser, or:

```
cd site && python3 -m http.server 8000   # → http://localhost:8000
```

## Add portfolio work

Edit `site/js/work-data.js`. Each entry has `artist`, `title`, `roles` (`prod`/`rec`/`mix`/`master`),
`genre`, `year`, and either `audio` (a file in `site/audio/`, plays in the B19 player)
or `link` (Spotify / YouTube / SoundCloud, plays in an embed).

### Audio files

Self-hosted tracks live in `site/audio/` as `<name>.mp3` (320 kbps, default stream) and
`<name>.flac` (24-bit lossless, the "LOSSLESS" switch). Waveforms come from `site/js/peaks.js`.
`site/audio/` is **not** in git (size, and the repo is public) — upload it to the server:

```
scp ~/Desktop/B19LP/site/audio/* root@2.28.230.117:/opt/b19lp/site/audio/
```

## Deploy (Hetzner, 2.28.230.117)

First time, on the server:

```
git clone https://github.com/JedrekWencka/B19LP.git /opt/b19lp
cd /opt/b19lp && docker compose up -d
```

Site: **https://b19studio.net** (proxied by the band site's nginx — see deploy/setup-domain.sh, deploy/close-port-8080.sh)

After pushing changes from your Mac:

```
ssh root@2.28.230.117 /opt/b19lp/deploy/update.sh
```
