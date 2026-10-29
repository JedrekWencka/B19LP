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

    keys_in_template = set(re.findall(r"{{(\w+)}}", template))
    auto = {"lang", "canonical", "url_en", "url_pl", "lang_switch", "v"}
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
        values.update(
            lang=code,
            canonical=url,
            url_en=LANGS["en"][1],
            url_pl=LANGS["pl"][1],
            lang_switch=lang_switch(code),
            v=version,
        )
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
