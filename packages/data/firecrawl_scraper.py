"""
firecrawl_scraper.py

This script uses the Firecrawl API to automatically extract menu
information from a handful of restaurant websites near UCI

You need .env with firecrawl api key for this. This will update data.json

This file was written with the assistance of generative artificial intelligence.
"""

from __future__ import annotations

import json
import os
import re
from typing import Any, Dict, List, Optional

from dotenv import load_dotenv

try:
    # firecrawl not installed
    from firecrawl import Firecrawl
except ImportError as exc:  # pragma: no cover
    raise SystemExit(
        "firecrawl-py is not installed. Install it with 'pip install firecrawl-py'"
    ) from exc


def slugify(value: str) -> str:
    """Convert a string into a URL-friendly slug.

    All non-alphanumeric characters are replaced by single hyphens and the
    result is lower-cased.  Leading and trailing hyphens are removed.
    """
    slug = re.sub(r"[^a-zA-Z0-9]+", "-", value.strip().lower())
    return slug.strip("-")


def parse_price(price_str: Optional[str]) -> Optional[float]:
    """Parse a price string into a float.

    This helper strips any currency symbols or commas and attempts to
    convert the remaining text to a float.  If parsing fails or the
    input is ``None``/empty, ``None`` is returned.
    """
    if not price_str:
        return None
    # Remove anything that isn't a digit or decimal point
    cleaned = re.sub(r"[^0-9.]+", "", price_str)
    if not cleaned:
        return None
    try:
        return float(cleaned)
    except ValueError:
        return None


def extract_restaurant_data(app: Firecrawl, url: str) -> Dict[str, Any]:
    """Use Firecrawl to extract structured restaurant data from a URL.

    The returned dictionary matches the high-level structure used in
    ``uci_restaurants_full.json``.  All fields are optional and may be
    missing or empty depending on what the extractor is able to
    discover.  This function relies on Firecrawl's ability to infer
    fields from the provided schema; if you have a particularly
    challenging page you can tweak the schema or the prompt below.
    """
    # Define a schema instructing Firecrawl to pull out the fields we
    # care about.  Uses standard JSON Schema format.
    schema: Dict[str, Any] = {
        "type": "object",
        "properties": {
            "restaurantName": {"type": "string"},
            "description": {"type": "string"},
            "cuisine": {"type": "array", "items": {"type": "string"}},
            "priceTier": {"type": "string"},
            "location": {
                "type": "object",
                "properties": {
                    "address": {"type": "string"},
                    "city": {"type": "string"},
                    "state": {"type": "string"},
                    "postalCode": {"type": "string"},
                    "lat": {"type": "number"},
                    "lng": {"type": "number"},
                },
            },
            "hours": {
                "type": "array",
                "items": {
                    "type": "object",
                    "properties": {
                        "day": {"type": "string"},
                        "open": {"type": "string"},
                        "close": {"type": "string"},
                    },
                },
            },
            "menu": {
                "type": "array",
                "items": {
                    "type": "object",
                    "properties": {
                        "name": {"type": "string"},
                        "description": {"type": "string"},
                        "price": {"type": "string"},
                        "category": {"type": "string"},
                    },
                    "required": ["name"],
                },
            },
        },
        "required": ["restaurantName"],
    }

    # A natural-language prompt helps steer the extraction towards our
    # domain.  Without a prompt Firecrawl may still work, but a well
    # crafted prompt can improve accuracy.  Feel free to adjust the
    # wording here if Firecrawl struggles with your target sites.
    prompt = (
        "Extract the following information about this restaurant: its name, a short "
        "description, cuisine types, price tier if given, full address (including city, "
        "state and postal code), latitude and longitude if provided on the page, the "
        "hours of operation, and a list of menu items. For each menu item list its name, "
        "description, price (in USD if available) and category. Return the data in "
        "JSON according to the provided schema."
    )

    # Use scrape with json format — the recommended replacement for the
    # deprecated /extract endpoint.  Passing the schema and prompt as a
    # format dict instructs Firecrawl to run LLM extraction on the scraped
    # page and return structured JSON in Document.json.
    result = app.scrape(
        url=url,
        formats=[{"type": "json", "schema": schema, "prompt": prompt}],
    )

    data = result.json if hasattr(result, "json") and result.json is not None else {}

    return data  # type: ignore[return-value]


def build_restaurant_entry(raw: Dict[str, Any]) -> Dict[str, Any]:
    """Transform raw Firecrawl output into our final JSON structure."""
    name = raw.get("restaurantName") or raw.get("name") or ""
    rest_id = slugify(name) if name else ""
    description = raw.get("description") or ""
    cuisine = raw.get("cuisine") or []
    price_tier = raw.get("priceTier") or None
    raw_location = raw.get("location") or {}
    location = {
        "address": raw_location.get("address") or "Not Provided",
        "city": raw_location.get("city") or "Not Provided",
        "state": raw_location.get("state") or "Not Provided",
        "postalCode": raw_location.get("postalCode") or "Not Provided",
        "lat": raw_location.get("lat") if raw_location.get("lat") is not None else 0,
        "lng": raw_location.get("lng") if raw_location.get("lng") is not None else 0,
    }
    hours = raw.get("hours") or []
    menu_items = []
    for item in raw.get("menu", []) or []:
        item_name = item.get("name") or ""
        item_id = slugify(item_name) if item_name else ""
        item_desc = item.get("description") or ""
        price_val = parse_price(item.get("price"))
        category = item.get("category") or None
        menu_items.append(
            {
                "id": item_id,
                "name": item_name,
                "description": item_desc,
                "priceUSD": price_val,
                "category": category,
            }
        )

    return {
        "id": rest_id,
        "name": name,
        "description": description,
        "cuisine": cuisine,
        "priceTier": price_tier,
        "location": location,
        "hours": hours,
        "menu": menu_items,
        "dataSource": "firecrawl",
    }


def main() -> None:
    """Entry point for the scraper."""
    load_dotenv()
    app = Firecrawl()  # API key will be pulled from FIRECRAWL_API_KEY

    # Define the list of restaurants to process.  Each entry contains
    # the publicly accessible menu page for a restaurant within ~10
    # minutes of UC Irvine.  Feel free to add or remove entries to
    # target different establishments.  Note that the order here will
    # determine the order of entries in the output JSON.
    restaurants: List[Dict[str, str]] = [
        {
            "name": "Luna Grill",
            "url": "https://lunagrill.com/menu",
        },
        {
            "name": "Mendocino Farms",
            "url": "https://mendocinofarms.com/menus",
        },
        {
            "name": "Blaze Pizza",
            "url": "https://blazepizza.com/menu",
        },
        {
            "name": "Northern Cafe Irvine",
            "url": "https://northerncafeirvine.com/menu",
        },
        {
            "name": "Eureka! Irvine",
            "url": "https://eurekarestaurantgroup.com/locations/irvine/menu",
        },
        {
            "name": "Silverlake Ramen",
            "url": "https://silverlakeramen.com/menu3.php",
        },
        {
            "name": "Saffron & Rose Persian Ice Cream",
            "url": "https://saffronrosepersianicecream.com/flavors",
        },
        {
            "name": "Hen House Grill",
            "url": "https://thehenhousegrill.com/menus",
        },
        {
            "name": "Tender Greens",
            "url": "https://tendergreens.com/menus",
        },
    ]

    all_restaurants: List[Dict[str, Any]] = []
    for entry in restaurants:
        url = entry["url"]
        print(f"Extracting: {entry['name']} ({url})")
        try:
            raw_data = extract_restaurant_data(app, url)
            formatted = build_restaurant_entry(raw_data)
            all_restaurants.append(formatted)
            print(f"  -> {len(formatted.get('menu', []))} menu items")
        except Exception as exc:
            print(f"  -> FAILED: {exc}")
            continue

    # Write to output JSON file
    output_path = "data.json"
    with open(output_path, "w", encoding="utf-8") as fh:
        json.dump(all_restaurants, fh, indent=2, ensure_ascii=False)
    print(f"Saved {len(all_restaurants)} restaurants to {output_path}")


if __name__ == "__main__":
    main()