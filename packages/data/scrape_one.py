"""
scrape_one.py

Test-scrape a single restaurant URL and print the result.
Exits immediately if the API key is out of credits — do not
restart or retry; update the key in .env and re-run.

Usage:
    python scrape_one.py <url>
    python scrape_one.py "https://lunagrill.com/menu"
"""

from __future__ import annotations

import json
import sys

from dotenv import load_dotenv

from firecrawl_scraper import build_restaurant_entry, extract_restaurant_data

try:
    from firecrawl import Firecrawl
except ImportError as exc:
    raise SystemExit(
        "firecrawl-py is not installed. Install it with 'pip install firecrawl-py'"
    ) from exc


def main() -> None:
    if len(sys.argv) != 2:
        raise SystemExit("Usage: python scrape_one.py <url>")

    url = sys.argv[1]
    load_dotenv()
    app = Firecrawl()

    print(f"Scraping: {url}\n")
    try:
        raw = extract_restaurant_data(app, url)
    except Exception as exc:
        msg = str(exc)
        if "Payment Required" in msg or "Insufficient credits" in msg:
            raise SystemExit(
                "\n*** API credits exhausted. ***\n"
                "Please update FIRECRAWL_API_KEY in .env with a key that has remaining credits,\n"
                "then re-run this script."
            ) from None
        raise SystemExit(f"Scrape failed: {exc}") from exc

    entry = build_restaurant_entry(raw, source_url=url)
    menu_count = len(entry.get("menu", []))

    print(json.dumps(entry, indent=2, ensure_ascii=False))
    print(f"\n--- {menu_count} menu item(s) extracted ---")

    if menu_count < 3:
        print("WARNING: fewer than 3 menu items — this URL may not scrape well.")


if __name__ == "__main__":
    main()
