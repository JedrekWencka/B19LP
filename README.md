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
docker-compose.yml  # nginx container on port 8080
deploy/nginx/default.conf
deploy/update.sh    # pull + restart, run on the server
```

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

Site: **http://2.28.230.117:8080**

After pushing changes from your Mac:

```
ssh root@2.28.230.117 /opt/b19lp/deploy/update.sh
```
