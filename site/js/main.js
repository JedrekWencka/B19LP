/* =========================================================
   B19 — interactions & generative visuals
   ========================================================= */
(() => {
  "use strict";

  const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  let paused = reduceMotion;
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => [...r.querySelectorAll(s)];
  const rand = (a = 1, b) => (b === undefined ? Math.random() * a : a + Math.random() * (b - a));

  /* ---------- canvas helper: keeps backing store in sync with CSS size ---------- */
  function setupCanvas(canvas, maxDpr = 2) {
    const ctx = canvas.getContext("2d");
    const state = { w: 0, h: 0, ctx, canvas, visible: true };
    const resize = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, maxDpr);
      const r = canvas.getBoundingClientRect();
      state.w = Math.max(1, Math.round(r.width));
      state.h = Math.max(1, Math.round(r.height));
      canvas.width = Math.round(state.w * dpr);
      canvas.height = Math.round(state.h * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };
    resize();
    new ResizeObserver(resize).observe(canvas);
    new IntersectionObserver(([e]) => { state.visible = e.isIntersecting; }).observe(canvas);
    return state;
  }

  /* ---------- simple frame loop with per-visual fps ---------- */
  const visuals = [];
  function addVisual(state, draw, fps = 30) {
    visuals.push({ state, draw, interval: 1000 / fps, last: 0, t0: performance.now() });
  }
  function loop(now) {
    for (const v of visuals) {
      if (!v.state.visible) continue;
      if (paused && v.last) continue;
      if (now - v.last < v.interval) continue;
      v.last = now;
      v.draw(v.state, (now - v.t0) / 1000);
    }
    requestAnimationFrame(loop);
  }

  /* =======================================================
     1. COLOR BARS (hero) — test card with tracking glitches
     ======================================================= */
  const BAR_COLORS = ["#f4f4f4", "#f2ee3a", "#58e6f0", "#5ae34a", "#e23fe6", "#e8352a", "#2a2df0"];
  const barsCanvas = $(".bars");
  if (barsCanvas) {
    let tears = [];
    addVisual(setupCanvas(barsCanvas, 1.5), ({ ctx, w, h }, t) => {
      ctx.fillStyle = "#000";
      ctx.fillRect(0, 0, w, h);
      const barW = w / BAR_COLORS.length;
      const strip = 3;

      // occasionally spawn a horizontal "tear"
      if (Math.random() < 0.08) tears.push({ y: rand(h), hgt: rand(10, 80), amp: rand(-60, 60), life: rand(4, 14) });
      tears = tears.filter(tr => tr.life-- > 0);

      for (let y = 0; y < h; y += strip) {
        // base wobble + jagged edge noise
        let off = Math.sin(y * 0.02 + t * 3) * 4 + (Math.random() - 0.5) * 10;
        for (const tr of tears) if (y > tr.y && y < tr.y + tr.hgt) off += tr.amp;
        for (let i = -1; i <= BAR_COLORS.length; i++) {
          const c = BAR_COLORS[(i + BAR_COLORS.length) % BAR_COLORS.length];
          ctx.fillStyle = c;
          ctx.fillRect(i * barW + off, y, barW + 1, strip);
        }
      }
      // scanlines
      ctx.fillStyle = "rgba(0,0,0,0.18)";
      for (let y = 0; y < h; y += 4) ctx.fillRect(0, y, w, 1);
      // white noise specks
      for (let i = 0; i < 120; i++) {
        ctx.fillStyle = Math.random() < 0.5 ? "rgba(255,255,255,0.7)" : "rgba(0,0,0,0.6)";
        ctx.fillRect(rand(w), rand(h), rand(1, 18), 1);
      }
      // rolling bright band
      const bandY = ((t * 80) % (h + 200)) - 100;
      const g = ctx.createLinearGradient(0, bandY - 60, 0, bandY + 60);
      g.addColorStop(0, "rgba(255,255,255,0)");
      g.addColorStop(0.5, "rgba(255,255,255,0.12)");
      g.addColorStop(1, "rgba(255,255,255,0)");
      ctx.fillStyle = g;
      ctx.fillRect(0, bandY - 60, w, 120);
    }, 24);
  }

  /* =======================================================
     2. SERVICE VISUALS
     ======================================================= */

  // 2a. Noise "fast-forward" shape (Mix & Mastering)
  const noiseCanvas = $(".viz-noise");
  if (noiseCanvas) {
    const N = 56;
    const inTri = (x, y, x0, x1) => {
      if (y < 0.12 || y > 0.88) return false;
      const half = 0.38 * (1 - Math.abs(y - 0.5) / 0.38);
      const reach = x0 + (x1 - x0) * Math.min(1, (half / 0.38) * 1.15);
      return x >= x0 && x <= reach;
    };
    const mask = [];
    for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
      const x = i / N, y = j / N;
      mask.push(inTri(x, y, 0.1, 0.56) || inTri(x, y, 0.46, 0.92));
    }
    addVisual(setupCanvas(noiseCanvas), ({ ctx, w, h }) => {
      ctx.clearRect(0, 0, w, h);
      const cw = w / N, ch = h / N;
      const shift = Math.random() < 0.15 ? Math.floor(rand(-3, 3)) : 0;
      for (let j = 0; j < N; j++) {
        const rowShift = Math.random() < 0.04 ? Math.floor(rand(-4, 4)) : shift;
        for (let i = 0; i < N; i++) {
          if (!mask[j * N + i]) continue;
          const v = Math.floor(rand(40, 255));
          ctx.fillStyle = `rgb(${v},${v},${v})`;
          ctx.fillRect((i + rowShift) * cw, j * ch, cw + 0.5, ch + 0.5);
        }
      }
    }, 15);
  }

  // 2b. Blue circle grid with sync line (Live Sound)
  const dotsCanvas = $(".viz-dots");
  if (dotsCanvas) {
    addVisual(setupCanvas(dotsCanvas), ({ ctx, w, h }, t) => {
      ctx.clearRect(0, 0, w, h);
      const cols = 4, rows = 3;
      const r = (w * 0.96) / (2 + (cols - 1) * 1.86);
      const top = h / 2 - rows * r * 0.95;
      ctx.fillStyle = "#1f2bff";
      for (let j = 0; j < rows; j++) for (let i = 0; i < cols; i++) {
        const wob = Math.sin(t * 2 + i + j * 1.7) * 2;
        ctx.beginPath();
        ctx.arc(w * 0.02 + r + i * r * 1.86, top + r + j * r * 1.9 + wob, r, 0, Math.PI * 2);
        ctx.fill();
      }
      // horizontal glitch lines
      const ly = h / 2 + Math.sin(t * 1.3) * h * 0.08;
      ctx.fillStyle = "rgba(255,255,255,0.9)";
      ctx.fillRect(w * 0.3, ly, w * 0.4, 2);
      ctx.fillRect(w * 0.42 + Math.sin(t * 5) * 20, ly + 8, w * 0.25, 1.5);
      if (Math.random() < 0.1) {
        const gy = rand(top, top + rows * r * 2);
        ctx.fillStyle = "#000";
        ctx.fillRect(0, gy, w, rand(2, 8));
      }
    }, 30);
  }

  // 2c. Red striped arch (Reamping)
  const archCanvas = $(".viz-arch");
  if (archCanvas) {
    addVisual(setupCanvas(archCanvas), ({ ctx, w, h }, t) => {
      ctx.clearRect(0, 0, w, h);
      const aw = w * 0.62, ah = h * 0.86;
      const x0 = (w - aw) / 2, y0 = (h - ah) / 2;
      ctx.save();
      ctx.beginPath();
      ctx.moveTo(x0, y0 + ah);
      ctx.lineTo(x0, y0 + aw / 2);
      ctx.arc(x0 + aw / 2, y0 + aw / 2, aw / 2, Math.PI, 0);
      ctx.lineTo(x0 + aw, y0 + ah);
      ctx.closePath();
      ctx.clip();
      ctx.fillStyle = "#e0321f";
      ctx.fillRect(x0, y0, aw, ah);
      const gap = 5;
      const scroll = (t * 14) % gap;
      for (let y = y0 - gap + scroll; y < y0 + ah; y += gap) {
        const o = Math.random() < 0.03 ? rand(-14, 14) : 0;
        ctx.fillStyle = "rgba(90,0,0,0.75)";
        ctx.fillRect(x0 + o, y, aw, 1.4);
      }
      ctx.restore();
    }, 30);
  }

  /* =======================================================
     3. ABOUT DISC — piano-key glitch circle
     ======================================================= */
  const discCanvas = $(".viz-disc");
  if (discCanvas) {
    const ROWS = 9;
    const PALETTE = ["#000", "#fff", "#000", "#fff", "#e43bd2", "#000", "#fff", "#5ff0ff"];
    let rows = [];
    const rebuild = () => {
      rows = Array.from({ length: ROWS }, () => {
        const cells = [];
        let x = 0;
        while (x < 1.2) {
          const wdt = rand(0.03, 0.11);
          cells.push({ x, wdt, c: PALETTE[Math.floor(rand(PALETTE.length))] });
          x += wdt;
        }
        return { cells, off: 0 };
      });
    };
    rebuild();
    addVisual(setupCanvas(discCanvas), ({ ctx, w, h }) => {
      ctx.clearRect(0, 0, w, h);
      const R = Math.min(w, h) / 2;
      ctx.save();
      ctx.beginPath();
      ctx.arc(w / 2, h / 2, R, 0, Math.PI * 2);
      ctx.clip();
      ctx.fillStyle = "#fff";
      ctx.fillRect(0, 0, w, h);
      const rh = h / ROWS;
      rows.forEach((row, j) => {
        if (Math.random() < 0.12) row.off = rand(-0.08, 0.08);
        if (Math.random() < 0.02) {
          const cell = row.cells[Math.floor(rand(row.cells.length))];
          cell.c = PALETTE[Math.floor(rand(PALETTE.length))];
        }
        for (const c of row.cells) {
          ctx.fillStyle = c.c;
          ctx.fillRect((c.x - 0.1 + row.off) * w, j * rh, c.wdt * w + 1, rh + 1);
        }
      });
      ctx.restore();
    }, 12);
  }

  /* =======================================================
     4. TIMECODE, GLITCH TITLE, PAUSE
     ======================================================= */
  const tcEls = $$("[data-timecode]");
  const start = performance.now();
  let pausedAt = 0, pausedTotal = 0;
  const pad = n => String(n).padStart(2, "0");
  setInterval(() => {
    if (paused) return;
    const s = Math.floor((performance.now() - start - pausedTotal) / 1000);
    const tc = `${pad(Math.floor(s / 3600))}:${pad(Math.floor(s / 60) % 60)}:${pad(s % 60)}`;
    tcEls.forEach(el => (el.textContent = tc));
  }, 250);

  const pauseBtn = $("[data-pause]");
  const hero = $(".hero");
  if (pauseBtn) {
    const sync = () => {
      pauseBtn.textContent = paused ? "▶" : "❚❚";
      pauseBtn.setAttribute("aria-label", paused ? "Play animation" : "Pause animation");
      hero.classList.toggle("paused", paused);
    };
    pauseBtn.addEventListener("click", () => {
      paused = !paused;
      if (paused) pausedAt = performance.now();
      else pausedTotal += performance.now() - pausedAt;
      sync();
    });
    sync();
  }

  const b19 = $(".hero-b19");
  if (b19 && !reduceMotion) {
    const glitch = () => {
      if (!paused) {
        b19.classList.remove("glitching");
        void b19.offsetWidth;
        b19.classList.add("glitching");
      }
      setTimeout(glitch, rand(1800, 5200));
    };
    setTimeout(glitch, 1200);
  }

  /* =======================================================
     5. STATEMENT TYPE-OUT
     ======================================================= */
  const typeEl = $("[data-typeout]");
  if (typeEl && !reduceMotion) {
    const full = typeEl.textContent;
    typeEl.setAttribute("aria-label", full);
    typeEl.textContent = "";
    const caret = document.createElement("span");
    caret.className = "caret";
    caret.innerHTML = "&nbsp;";
    typeEl.append(caret);
    let started = false;
    new IntersectionObserver(([e], obs) => {
      if (!e.isIntersecting || started) return;
      started = true; obs.disconnect();
      let i = 0;
      const tick = () => {
        caret.before(full[i++]);
        if (i < full.length) setTimeout(tick, full[i - 1] === "," ? 180 : rand(25, 60));
      };
      tick();
    }, { threshold: 0.6 }).observe(typeEl);
  }

  /* =======================================================
     6. LIVE COORDINATES
     ======================================================= */
  const xEl = $("[data-x]"), yEl = $("[data-y]");
  if (xEl) window.addEventListener("pointermove", e => { xEl.textContent = Math.round(e.clientX); yEl.textContent = Math.round(e.clientY); }, { passive: true });

  /* =======================================================
     7. WORK LIST + FILTER + PLAYERS
     ======================================================= */
  const list = $("[data-work-list]");
  const ROLE_LABEL = { prod: "PROD", rec: "REC", mix: "MIX", master: "MASTER" };
  const fmt = s => {
    if (!isFinite(s)) s = 0;
    s = Math.floor(s);
    return `${pad(Math.floor(s / 3600))}:${pad(Math.floor(s / 60) % 60)}:${pad(s % 60)}`;
  };

  function embedFor(url) {
    try {
      const u = new URL(url);
      if (u.hostname.includes("spotify.com")) {
        const path = u.pathname.replace(/^\/intl-[a-z]+/, "");
        return { src: `https://open.spotify.com/embed${path}?theme=0`, h: path.includes("/track/") ? 152 : 380 };
      }
      if (u.hostname.includes("youtube.com") || u.hostname === "youtu.be") {
        const id = u.hostname === "youtu.be" ? u.pathname.slice(1) : u.searchParams.get("v");
        if (id) return { src: `https://www.youtube-nocookie.com/embed/${id}?autoplay=1`, h: 0 };
      }
      if (u.hostname.includes("soundcloud.com")) {
        return { src: `https://w.soundcloud.com/player/?url=${encodeURIComponent(url)}&color=%2300ff00&auto_play=true`, h: 166 };
      }
    } catch (_) {}
    return null;
  }

  // artist name as a link to their page (Bandcamp etc.) when "url" is set
  function artistNode(item) {
    if (!item.url) return document.createTextNode(item.artist || "");
    const a = document.createElement("a");
    a.className = "artist-link";
    a.href = item.url;
    a.target = "_blank";
    a.rel = "noopener";
    a.textContent = item.artist || "";
    a.title = `${item.artist} — ${new URL(item.url).hostname.replace(/^www\./, "")}`;
    return a;
  }

  /* ---------- self-hosted audio player (deck) ---------- */
  const deck = $("[data-deck]");
  const audio = new Audio();
  audio.preload = "metadata";
  let current = null;           // { item, li }
  let quality = "mp3";
  try { if (localStorage.getItem("b19-quality") === "flac") quality = "flac"; } catch (_) {}

  const deckPlay = $("[data-deck-play]"), deckTitle = $("[data-deck-title]");
  const deckRoles = $("[data-deck-roles]"), deckTime = $("[data-deck-time]");
  const deckQ = $$("[data-deck-q]"), deckWave = $("[data-deck-wave]");
  const waveState = deckWave ? setupCanvas(deckWave) : null;

  const srcFor = (item, q) => `audio/${item.audio}.${q}`;

  function drawWave() {
    if (!waveState || !current) return;
    const { ctx, w, h } = waveState;
    ctx.clearRect(0, 0, w, h);
    const peaks = (window.B19_PEAKS || {})[current.item.audio] || [];
    const n = peaks.length || 1;
    const prog = audio.duration ? audio.currentTime / audio.duration : 0;
    const bw = w / n;
    const buffered = audio.buffered.length && audio.duration ? audio.buffered.end(audio.buffered.length - 1) / audio.duration : 0;
    for (let i = 0; i < n; i++) {
      const x = i * bw, frac = i / n;
      const amp = Math.max(0.04, peaks[i]) * (h * 0.9);
      ctx.fillStyle = frac < prog ? "#00ff00" : frac < buffered ? "#5a5a5a" : "#2e2e2e";
      ctx.fillRect(x, (h - amp) / 2, Math.max(1, bw - 0.6), amp);
    }
    // playhead
    ctx.fillStyle = "#fff";
    ctx.fillRect(prog * w, 0, 1.5, h);
  }

  function syncUI() {
    const playing = !audio.paused;
    if (deckPlay) {
      deckPlay.textContent = playing ? "❚❚" : "▶";
      deckPlay.setAttribute("aria-label", playing ? "Pause" : "Play");
    }
    $$(".work-item").forEach(li => {
      const on = current && li === current.li;
      li.classList.toggle("is-current", !!on);
      const b = li.querySelector(".wi-play[data-audio]");
      if (b) b.textContent = on && playing ? "❚❚ PAUSE" : "▶ PLAY";
    });
    deckQ.forEach(b => b.classList.toggle("is-active", b.dataset.deckQ === quality));
    if (deckTime) deckTime.textContent = `${fmt(audio.currentTime)} / ${fmt(audio.duration)}`;
    drawWave();
  }

  function playItem(item, li) {
    if (current && current.item === item) {
      audio.paused ? audio.play() : audio.pause();
      return;
    }
    current = { item, li };
    audio.src = srcFor(item, quality);
    audio.play().catch(() => {});
    deck.hidden = false;
    document.body.classList.add("deck-open");
    deckTitle.replaceChildren(artistNode(item), document.createTextNode(` — ${item.title}`));
    deckRoles.innerHTML = (item.roles || []).map(r => `<span class="tag ${r}">${ROLE_LABEL[r] || r}</span>`).join("");
    if ("mediaSession" in navigator) {
      navigator.mediaSession.metadata = new MediaMetadata({ title: item.title, artist: item.artist, album: "B19 — Jędrzej Wencka" });
    }
    syncUI();
  }

  function setQuality(q) {
    if (q === quality) return;
    quality = q;
    try { localStorage.setItem("b19-quality", q); } catch (_) {}
    if (current) {
      const t = audio.currentTime, wasPlaying = !audio.paused;
      audio.src = srcFor(current.item, q);
      audio.addEventListener("loadedmetadata", () => {
        audio.currentTime = t;
        if (wasPlaying) audio.play().catch(() => {});
      }, { once: true });
    }
    syncUI();
  }

  ["play", "pause", "timeupdate", "loadedmetadata", "progress", "ended"].forEach(ev => audio.addEventListener(ev, syncUI));
  audio.addEventListener("ended", () => {
    // auto-advance to the next visible self-hosted track
    const items = $$(".work-item:not(.is-hidden)").filter(li => li._item && li._item.audio);
    const i = items.indexOf(current && current.li);
    if (i > -1 && items[i + 1]) playItem(items[i + 1]._item, items[i + 1]);
  });
  if (deckPlay) deckPlay.addEventListener("click", () => current && (audio.paused ? audio.play() : audio.pause()));
  deckQ.forEach(b => b.addEventListener("click", () => setQuality(b.dataset.deckQ)));
  const deckClose = $("[data-deck-close]");
  if (deckClose) deckClose.addEventListener("click", () => {
    audio.pause(); audio.removeAttribute("src"); audio.load();
    current = null; deck.hidden = true; document.body.classList.remove("deck-open"); syncUI();
  });
  if (deckWave) {
    const seek = e => {
      if (!audio.duration) return;
      const r = deckWave.getBoundingClientRect();
      audio.currentTime = Math.min(1, Math.max(0, (e.clientX - r.left) / r.width)) * audio.duration;
    };
    let dragging = false;
    deckWave.addEventListener("pointerdown", e => { dragging = true; deckWave.setPointerCapture(e.pointerId); seek(e); });
    deckWave.addEventListener("pointermove", e => dragging && seek(e));
    deckWave.addEventListener("pointerup", () => (dragging = false));
  }
  document.addEventListener("keydown", e => {
    if (!current || e.code !== "Space" || /INPUT|TEXTAREA|BUTTON/.test(document.activeElement.tagName)) return;
    e.preventDefault();
    audio.paused ? audio.play() : audio.pause();
  });

  (function waveTick() {
    if (current && !audio.paused) drawWave();
    requestAnimationFrame(waveTick);
  })();

  /* ---------- build the list ---------- */
  if (list) {
    // always shown A–Z: band name, then song title (Polish letters sorted correctly)
    const byName = (a, b) => (a || "").localeCompare(b || "", "pl", { sensitivity: "base" });
    const data = [...(window.B19_WORK || [])].sort((a, b) => byName(a.artist, b.artist) || byName(a.title, b.title));
    if (!data.length) list.innerHTML = '<li class="work-empty">PORTFOLIO COMING SOON</li>';
    data.forEach((item, idx) => {
      const li = document.createElement("li");
      li.className = "work-item";
      li._item = item;
      li.dataset.roles = (item.roles || []).join(" ");
      const tags = (item.roles || []).map(r => `<span class="tag ${r}">${ROLE_LABEL[r] || r}</span>`).join("");
      let action = '<span class="wi-play is-off">SOON</span>';
      if (item.audio) action = '<button class="wi-play" data-audio>▶ PLAY</button>';
      else if (item.link) action = '<button class="wi-play" data-embed>▶ LISTEN</button>';
      li.innerHTML = `
        <span class="wi-num">${pad(idx + 1)}</span>
        <span class="wi-title"></span>
        <span class="wi-roles">${tags}</span>
        <span class="wi-genre"></span>
        <span class="wi-year">${item.year || ""}</span>
        ${action}`;
      const titleEl = li.querySelector(".wi-title");
      titleEl.append(artistNode(item));
      const small = document.createElement("small");
      small.textContent = item.title || "";
      titleEl.append(small);
      li.querySelector(".wi-genre").textContent = item.genre || "";
      const btn = li.querySelector("button.wi-play");
      if (btn && item.audio) btn.addEventListener("click", () => playItem(item, li));
      if (btn && !item.audio) { btn.setAttribute("aria-expanded", "false"); btn.addEventListener("click", () => openEmbed(item, li, btn)); }
      list.append(li);
    });

    $$(".work-filters button").forEach(btn => btn.addEventListener("click", () => {
      $$(".work-filters button").forEach(b => b.classList.toggle("is-active", b === btn));
      const f = btn.dataset.filter;
      $$(".work-item").forEach(li => li.classList.toggle("is-hidden", f !== "all" && !li.dataset.roles.split(" ").includes(f)));
    }));
  }

  /* ---------- embed (YouTube / Spotify / SoundCloud) as an accordion under its row ---------- */
  let openRow = null;   // { li, panel, btn }

  function closeEmbed() {
    if (!openRow) return;
    const { li, panel, btn } = openRow;
    openRow = null;
    li.classList.remove("is-open");
    btn.textContent = "▶ LISTEN";
    btn.setAttribute("aria-expanded", "false");
    panel.classList.remove("is-open");
    // remove the iframe after the collapse animation (also stops playback)
    setTimeout(() => panel.remove(), 350);
  }

  function openEmbed(item, li, btn) {
    if (openRow && openRow.li === li) { closeEmbed(); return; }
    const emb = embedFor(item.link);
    if (!emb) { window.open(item.link, "_blank", "noopener"); return; }
    closeEmbed();
    if (current && !audio.paused) audio.pause();

    const panel = document.createElement("li");
    panel.className = "work-embed";
    const inner = document.createElement("div");
    inner.className = "work-embed-inner";
    const f = document.createElement("iframe");
    f.src = emb.src;
    f.title = `${item.artist} — ${item.title}`;
    f.allow = "autoplay; clipboard-write; encrypted-media; fullscreen; picture-in-picture";
    f.className = emb.h ? "is-audio" : "is-video";
    if (emb.h) f.style.height = Math.min(emb.h, 152) + "px";
    inner.append(f);
    panel.append(inner);
    li.after(panel);

    li.classList.add("is-open");
    btn.textContent = "✕ CLOSE";
    btn.setAttribute("aria-expanded", "true");
    openRow = { li, panel, btn };
    requestAnimationFrame(() => requestAnimationFrame(() => panel.classList.add("is-open")));
  }

  // starting a B19 track or changing the filter closes an open embed
  audio.addEventListener("play", closeEmbed);
  $$(".work-filters button").forEach(b => b.addEventListener("click", closeEmbed));

  /* =======================================================
     8. NAV: mobile menu + active section
     ======================================================= */
  const burger = $(".burger"), menu = $(".mobile-menu");
  if (burger) {
    const setOpen = open => { menu.hidden = !open; burger.setAttribute("aria-expanded", open); document.body.style.overflow = open ? "hidden" : ""; };
    burger.addEventListener("click", () => setOpen(menu.hidden));
    $$("a", menu).forEach(a => a.addEventListener("click", () => setOpen(false)));
  }
  // phone menu reuses the header's social icons
  const mmSocial = $("[data-mm-social]"), headSocial = $(".header .social");
  if (mmSocial && headSocial) mmSocial.innerHTML = headSocial.innerHTML;
  const sections = ["work", "services", "contact"].map(id => document.getElementById(id)).filter(Boolean);
  const navLinks = $$(".nav a, .footer nav a");
  const onScroll = () => {
    let current = "top";
    const passed = sections.filter(s => s.getBoundingClientRect().top < window.innerHeight * 0.4);
    if (passed.length) current = passed.sort((a, b) => b.getBoundingClientRect().top - a.getBoundingClientRect().top)[0].id;
    navLinks.forEach(a => a.classList.toggle("is-active", a.getAttribute("href") === "#" + current));
  };
  window.addEventListener("scroll", onScroll, { passive: true });
  onScroll();

  // "#top" points at the sticky header, which is always on screen, so the
  // browser's own jump does nothing. Scroll to the very top ourselves.
  $$('a[href="#top"]').forEach(a => a.addEventListener("click", e => {
    e.preventDefault();
    window.scrollTo({ top: 0, behavior: reduceMotion ? "auto" : "smooth" });
    if (location.hash) history.replaceState(null, "", location.pathname + location.search);
  }));

  const yearEl = $("[data-year]");
  if (yearEl) yearEl.textContent = new Date().getFullYear();

  requestAnimationFrame(loop);
})();
