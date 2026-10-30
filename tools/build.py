#!/usr/bin/env python3
"""
Builds the site pages from one template + translations.

    src/index.template.html  +  src/i18n.json
        -> site/index.html      (English, default)   https://b19studio.net/
        -> site/pl/index.html   (Polish)             https://b19studio.net/pl/
        -> site/sitemap.xml, site/robots.txt

Run after editing the template or the translations:

    python3 tools/build.py

The version number (?v=…) on CSS/JS links is bumped automatically so browsers
pick up changes straight away.
"""
import html
import json
import re
import sys
import time
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
SRC = ROOT / "src"
SITE = ROOT / "site"
BASE = "https://b19studio.net"

LANGS = {
    # code: (output file, public URL)
    "en": (SITE / "index.html", f"{BASE}/"),
    "pl": (SITE / "pl" / "index.html", f"{BASE}/pl/"),
}


# Polish typography: a one-letter word (i, a, w, z, o, u …) must not end a line.
# Glue it to the next word with a non-breaking space.
ORPHAN = re.compile(r"(?<![\w&])([AaIiOoUuWwZz])\s+")
NO_ORPHAN_KEYS = {"og_locale", "og_locale_alt"}


def fix_orphans(text: str) -> str:
    text = ORPHAN.sub(lambda m: m.group(1) + "\u00a0", text)
    return re.sub(r"\s+—", "\u00a0—", text)   # a dash never starts a line


ROLE_LABEL = {"prod": "PROD", "rec": "REC", "mix": "MIX", "master": "MASTER"}
PL_ORDER = "aąbcćdeęfghijklłmnńoóprsśtuvwxyzźż"


def pl_key(text: str):
    """Sort like the site does (Polish alphabet, case-insensitive)."""
    return [PL_ORDER.index(ch) if ch in PL_ORDER else 100 + ord(ch) for ch in (text or "").lower()]


def load_work() -> list:
    """Reads site/js/work-data.js (a JS array) into Python dicts."""
    js = (SITE / "js" / "work-data.js").read_text(encoding="utf-8")
    js = re.sub(r"/\*.*?\*/", "", js, flags=re.S)                 # block comments
    js = re.sub(r"(?m)^\s*//.*$", "", js)                          # whole-line // comments
    body = js[js.index("[", js.index("B19_WORK")): js.rindex("]") + 1]
    body = re.sub(r"(?m)^(\s*)(\w+)\s*:", r'\1"\2":', body)        # quote keys
    body = re.sub(r",(\s*[}\]])", r"\1", body)                     # trailing commas
    items = json.loads(body)
    return sorted(items, key=lambda w: (pl_key(w.get("artist")), pl_key(w.get("title"))))


def esc(t) -> str:
    return html.escape(str(t or ""), quote=True)


def work_list_html(items: list, s: dict) -> str:
    out = []
    for i, w in enumerate(items, 1):
        artist = esc(w.get("artist"))
        if w.get("url"):
            artist = f'<a class="artist-link" href="{esc(w["url"])}" target="_blank" rel="noopener">{artist}</a>'
        tags = "".join(f'<span class="tag {r}">{ROLE_LABEL.get(r, esc(r))}</span>' for r in w.get("roles", []))
        if w.get("audio"):
            action = f'<button class="wi-play" data-audio>{s["btn_play"]}</button>'
        elif w.get("link"):
            action = f'<a class="wi-play" href="{esc(w["link"])}" target="_blank" rel="noopener">{s["btn_listen_out"]}</a>'
        else:
            action = f'<span class="wi-play is-off">{s["btn_soon"]}</span>'
        out.append(
            f'\n    <li class="work-item"><span class="wi-num">{i:02d}</span>'
            f'<span class="wi-title">{artist}<small>{esc(w.get("title"))}</small></span>'
            f'<span class="wi-roles">{tags}</span><span class="wi-genre">{esc(w.get("genre"))}</span>'
            f'<span class="wi-year">{esc(w.get("year"))}</span>{action}</li>'
        )
    return "".join(out) + "\n  "


def gallery_html(lang: str, s: dict):
    data = json.loads((SRC / "gallery.json").read_text(encoding="utf-8"))["items"]
    out = []
    for i, g in enumerate(data, 1):
        alt = esc(g.get(f"alt_{lang}") or g.get("alt_en"))
        f = esc(g["file"])
        big = ' class="is-big"' if i == 1 else ""
        sizes = "(max-width: 700px) 100vw, 66vw" if i == 1 else "(max-width: 700px) 100vw, 33vw"
        out.append(
            f'\n    <li{big}><button class="g-item" data-full="/assets/studio/{f}-1800.webp" data-index="{i-1}" '
            f'aria-label="{esc(s["aria_open_photo"])}: {alt}">'
            f'<img src="/assets/studio/{f}-900.webp" srcset="/assets/studio/{f}-900.webp 900w, /assets/studio/{f}-1800.webp 1800w" '
            f'sizes="{sizes}" alt="{alt}" loading="lazy" decoding="async" width="900" height="601">'
            f'<span class="g-label mono" aria-hidden="true">CAM {i:02d}</span></button></li>'
        )
    return "".join(out) + "\n  ", len(data)


def lang_switch(current: str) -> str:
    parts = []
    for code, (_, url) in LANGS.items():
        path = "/" if code == "en" else f"/{code}/"
        if code == current:
            parts.append(f'<a href="{path}" hreflang="{code}" lang="{code}" class="is-active" aria-current="true">{code.upper()}</a>')
        else:
            parts.append(f'<a href="{path}" hreflang="{code}" lang="{code}" data-lang-link>{code.upper()}</a>')
    return '<span class="sep">/</span>'.join(parts)


def main() -> int:
    template = (SRC / "index.template.html").read_text(encoding="utf-8")
    strings = json.loads((SRC / "i18n.json").read_text(encoding="utf-8"))
    version = time.strftime("%Y%m%d%H%M")
    work = load_work()

    keys_in_template = set(re.findall(r"{{(\w+)}}", template))
    auto = {"lang", "canonical", "url_en", "url_pl", "lang_switch", "v", "work_list_html", "gallery_html", "gallery_count"}
    ok = True
    for code in LANGS:
        missing = keys_in_template - auto - set(strings[code])
        if missing:
            print(f"!! {code}: missing translations: {', '.join(sorted(missing))}")
            ok = False
    if not ok:
        return 1

    for code, (out, url) in LANGS.items():
        values = dict(strings[code])
        if code == "pl":
            values = {k: (v if k in NO_ORPHAN_KEYS else fix_orphans(v)) for k, v in values.items()}
        values.update(
            lang=code,
            canonical=url,
            url_en=LANGS["en"][1],
            url_pl=LANGS["pl"][1],
            lang_switch=lang_switch(code),
            v=version,
            work_list_html=work_list_html(work, values),
        )
        gh, gn = gallery_html(code, values)
        values.update(gallery_html=gh, gallery_count=f"{gn:02d}")
        html = re.sub(r"{{(\w+)}}", lambda m: values[m.group(1)], template)
        out.parent.mkdir(parents=True, exist_ok=True)
        out.write_text(html, encoding="utf-8")
        print(f"wrote {out.relative_to(ROOT)}  ({url})")

    today = time.strftime("%Y-%m-%d")
    alts = "".join(
        f'\n    <xhtml:link rel="alternate" hreflang="{c}" href="{u}"/>' for c, (_, u) in LANGS.items()
    ) + f'\n    <xhtml:link rel="alternate" hreflang="x-default" href="{LANGS["en"][1]}"/>'
    urls = "".join(
        f"\n  <url>\n    <loc>{u}</loc>\n    <lastmod>{today}</lastmod>{alts}\n  </url>" for _, (_, u) in LANGS.items()
    )
    (SITE / "sitemap.xml").write_text(
        '<?xml version="1.0" encoding="UTF-8"?>\n'
        '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:xhtml="http://www.w3.org/1999/xhtml">'
        f"{urls}\n</urlset>\n",
        encoding="utf-8",
    )
    (SITE / "robots.txt").write_text(f"User-agent: *\nAllow: /\n\nSitemap: {BASE}/sitemap.xml\n", encoding="utf-8")
    print("wrote site/sitemap.xml, site/robots.txt")
    return 0


if __name__ == "__main__":
    sys.exit(main())
