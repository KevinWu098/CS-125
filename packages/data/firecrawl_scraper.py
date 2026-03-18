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
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional

from dotenv import load_dotenv

try:
    # firecrawl not installed
    from firecrawl import Firecrawl
except ImportError as exc:  # pragma: no cover
    raise SystemExit(
        "firecrawl-py is not installed. Install it with 'pip install firecrawl-py'"
    ) from exc


# Maps full day names (and already-abbreviated forms) to the 3-letter
# lowercase codes required by RestaurantSchema.
_DAY_ABBREV: Dict[str, str] = {
    "monday": "mon", "tuesday": "tue", "wednesday": "wed",
    "thursday": "thu", "friday": "fri", "saturday": "sat", "sunday": "sun",
    "mon": "mon", "tue": "tue", "wed": "wed",
    "thu": "thu", "fri": "fri", "sat": "sat", "sun": "sun",
}

# Maps free-text price descriptions to the allowed enum values.
_PRICE_TIER_MAP: Dict[str, str] = {
    "inexpensive": "$", "cheap": "$", "budget": "$", "affordable": "$", "low": "$",
    "moderate": "$$", "medium": "$$", "mid-range": "$$", "midrange": "$$", "mid": "$$",
    "expensive": "$$$", "pricey": "$$$", "upscale": "$$$", "high": "$$$",
    "very expensive": "$$$$", "fine dining": "$$$$", "luxury": "$$$$",
}


def slugify(value: str) -> str:
    """Convert a string into a URL-friendly slug."""
    slug = re.sub(r"[^a-zA-Z0-9]+", "-", value.strip().lower())
    return slug.strip("-")


def parse_price(price_str: Optional[str]) -> Optional[float]:
    """Parse a price string (e.g. '$12.99') into a float, or return None."""
    if not price_str:
        return None
    cleaned = re.sub(r"[^0-9.]+", "", price_str)
    if not cleaned:
        return None
    try:
        return float(cleaned)
    except ValueError:
        return None


def normalize_price_tier(raw: Optional[str]) -> Optional[str]:
    """Normalise a free-text price tier into one of '$' | '$$' | '$$$' | '$$$$'."""
    if not raw:
        return None
    raw = raw.strip()
    if raw in ("$", "$$", "$$$", "$$$$"):
        return raw
    # Dollar-sign-only strings (e.g. '$$$')
    if raw and all(c == "$" for c in raw) and 1 <= len(raw) <= 4:
        return raw
    mapped = _PRICE_TIER_MAP.get(raw.lower())
    if mapped:
        return mapped
    # Count dollar signs anywhere in the string as a last resort
    count = raw.count("$")
    if 1 <= count <= 4:
        return "$" * count
    return None


def normalize_day(day: Optional[str]) -> Optional[str]:
    """Return the 3-letter lowercase day abbreviation, or None if unrecognised."""
    if not day:
        return None
    return _DAY_ABBREV.get(day.strip().lower())


def extract_restaurant_data(app: Firecrawl, url: str) -> Dict[str, Any]:
    """Use Firecrawl to extract structured restaurant data from *url*.

    The schema and prompt are tuned to match RestaurantSchema in
    packages/types/src/restaurant.ts, including nutrition info, tags,
    allergens, ratings, and dietary support flags.
    """
    schema: Dict[str, Any] = {
        "type": "object",
        "properties": {
            "restaurantName": {"type": "string"},
            "description": {"type": "string"},
            "cuisine": {"type": "array", "items": {"type": "string"}},
            "priceTier": {"type": "string"},
            "rating": {
                "type": "object",
                "properties": {
                    "average": {"type": "number"},
                    "count": {"type": "number"},
                    "source": {"type": "string"},
                },
            },
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
            "dietarySupport": {
                "type": "object",
                "properties": {
                    "vegan": {"type": "boolean"},
                    "vegetarian": {"type": "boolean"},
                    "glutenFree": {"type": "boolean"},
                    "dairyFree": {"type": "boolean"},
                    "halal": {"type": "boolean"},
                    "kosher": {"type": "boolean"},
                    "nutFree": {"type": "boolean"},
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
                        "tags": {"type": "array", "items": {"type": "string"}},
                        "allergens": {"type": "array", "items": {"type": "string"}},
                        "nutrition": {
                            "type": "object",
                            "properties": {
                                "calories": {"type": "number"},
                                "proteinG": {"type": "number"},
                                "carbsG": {"type": "number"},
                                "fatG": {"type": "number"},
                                "fiberG": {"type": "number"},
                                "sugarG": {"type": "number"},
                                "sodiumMg": {"type": "number"},
                            },
                        },
                    },
                    "required": ["name"],
                },
            },
        },
        "required": ["restaurantName"],
    }

    prompt = (
        "Extract the following information about this restaurant: its name, a short "
        "description, cuisine types, price tier ($, $$, $$$ or $$$$), star rating "
        "(average score and review count if shown), full address (street, city, state, "
        "postal code), latitude and longitude if available, hours of operation for each "
        "day of the week, dietary support flags (vegan/vegetarian/gluten-free/dairy-free/"
        "halal/kosher/nut-free menus if offered), and a complete list of menu items. "
        "For every menu item extract: name, description, price in USD, category, "
        "relevant tags (e.g. 'vegan', 'spicy', 'gluten-free', 'popular', 'new'), "
        "allergens (e.g. 'dairy', 'gluten', 'nuts', 'shellfish', 'soy', 'eggs'), and "
        "nutrition facts (calories, protein in grams, carbs in grams, fat in grams, "
        "fiber in grams, sugar in grams, sodium in milligrams) when listed. "
        "Return data strictly according to the provided JSON schema."
    )

    result = app.scrape(
        url=url,
        formats=[{"type": "json", "schema": schema, "prompt": prompt}],
    )

    data = result.json if hasattr(result, "json") and result.json is not None else {}
    return data  # type: ignore[return-value]


def build_restaurant_entry(
    raw: Dict[str, Any],
    source_url: str = "",
) -> Dict[str, Any]:
    """Transform raw Firecrawl output into a RestaurantSchema-conformant dict."""
    name = raw.get("restaurantName") or raw.get("name") or ""
    rest_id = slugify(name) if name else ""
    description = raw.get("description") or None
    cuisine = raw.get("cuisine") or []
    price_tier = normalize_price_tier(raw.get("priceTier"))

    # ── location ─────────────────────────────────────────────────────────
    raw_location = raw.get("location") or {}
    location = {
        "address": raw_location.get("address") or "Not Provided",
        "city": raw_location.get("city") or "Not Provided",
        "state": raw_location.get("state") or "Not Provided",
        "postalCode": raw_location.get("postalCode") or "Not Provided",
        "lat": raw_location.get("lat") if raw_location.get("lat") is not None else 0,
        "lng": raw_location.get("lng") if raw_location.get("lng") is not None else 0,
    }

    # ── hours (day → 3-letter abbrev) ────────────────────────────────────
    hours = []
    for h in raw.get("hours") or []:
        abbrev = normalize_day(h.get("day"))
        if abbrev and h.get("open") and h.get("close"):
            hours.append({"day": abbrev, "open": h["open"], "close": h["close"]})

    # ── rating (optional) ─────────────────────────────────────────────────
    raw_rating = raw.get("rating") or {}
    rating: Optional[Dict[str, Any]] = None
    if raw_rating.get("average") is not None and raw_rating.get("count") is not None:
        rating = {
            "average": float(raw_rating["average"]),
            "count": int(raw_rating["count"]),
        }
        if raw_rating.get("source"):
            rating["source"] = raw_rating["source"]

    # ── dietarySupport (optional) ─────────────────────────────────────────
    raw_diet = raw.get("dietarySupport") or {}
    dietary_keys = ("vegan", "vegetarian", "glutenFree", "dairyFree",
                    "halal", "kosher", "nutFree")
    dietary: Dict[str, bool] = {
        k: bool(raw_diet[k]) for k in dietary_keys if raw_diet.get(k) is not None
    }

    # ── menu items ────────────────────────────────────────────────────────
    menu_items = []
    for item in raw.get("menu") or []:
        item_name = item.get("name") or ""
        if not item_name:
            continue
        menu_entry: Dict[str, Any] = {
            "id": slugify(item_name),
            "name": item_name,
        }
        if item.get("description"):
            menu_entry["description"] = item["description"]
        price_val = parse_price(item.get("price"))
        if price_val is not None:
            menu_entry["priceUSD"] = price_val
        if item.get("category"):
            menu_entry["category"] = item["category"]
        if item.get("tags"):
            menu_entry["tags"] = [t for t in item["tags"] if t]
        if item.get("allergens"):
            menu_entry["allergens"] = [a for a in item["allergens"] if a]
        # nutrition — only include the sub-object if at least one field is present
        raw_nutrition = item.get("nutrition") or {}
        nutrition_keys = ("calories", "proteinG", "carbsG", "fatG",
                          "fiberG", "sugarG", "sodiumMg")
        nutrition = {
            k: float(raw_nutrition[k])
            for k in nutrition_keys
            if raw_nutrition.get(k) is not None
        }
        if nutrition:
            menu_entry["nutrition"] = nutrition
        menu_items.append(menu_entry)

    # ── assemble final entry ──────────────────────────────────────────────
    entry: Dict[str, Any] = {
        "id": rest_id,
        "name": name,
        "cuisine": cuisine,
        "location": location,
        "menu": menu_items,
        "dataSource": {
            "name": "firecrawl",
            "lastUpdatedISO": datetime.now(timezone.utc).isoformat(),
            "url": source_url,
        },
    }
    if description:
        entry["description"] = description
    if price_tier:
        entry["priceTier"] = price_tier
    if rating:
        entry["rating"] = rating
    if dietary:
        entry["dietarySupport"] = dietary
    if hours:
        entry["hours"] = hours
    return entry


def main() -> None:
    """Entry point for the scraper."""
    load_dotenv()
    app = Firecrawl()  # API key will be pulled from FIRECRAWL_API_KEY

    # Primary list: publicly accessible menu pages for restaurants within
    # ~10-15 minutes of UC Irvine.
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
            "name": "Gen Korean BBQ",
            "url": "https://www.genkoreanbbq.com/menu",
        },
        {
            "name": "Silverlake Ramen",
            "url": "https://silverlakeramen.com/menu3.php",
        },
        {
            "name": "Lemonade Restaurant",
            "url": "https://www.lemonadela.com/menu",
        },
        {
            "name": "Yard House",
            "url": "https://yard-house-spectrum-center-dr.res-menu.com/menu",
        },
        {
            "name": "Tender Greens",
            "url": "https://tendergreens.com/menus",
        },
        # ── 11 new restaurants near UCI ──────────────────────────────────
        {
            "name": "The Habit Burger & Grill",
            "url": "https://www.habitburger.com/menu",
        },
        {
            "name": "California Gogi Grill",
            "url": "https://www.californiagogi.com/",
        },
        {
            "name": "KY Sushi",
            "url": "https://ky-sushi.res-menu.com/",
        },
        {
            "name": "In-N-Out Burger",
            "url": "https://www.in-n-out.com/menu",
        },
        {
            "name": "Veggie Grill",
            "url": "https://www.veggiegrill.com/menus/",
        },
        {
            "name": "Chronic Tacos",
            "url": "https://chronictacos.com/menu/",
        },
        {
            "name": "The Flame Broiler",
            "url": "https://flamebroilerusa.com/menu/81881",
        },
        {
            "name": "Kura Sushi",
            "url": "https://kurasushi.com/menu/",
        },
        {
            "name": "Raising Cane's",
            "url": "https://www.raisingcanes.com/menu",
        },
        {
            "name": "Panda Express",
            "url": "https://www.pandaexpress.com/menu",
        },
        {
            "name": "Cucina Enoteca Irvine",
            "url": "https://www.urbankitchengroup.com/cucina-enoteca-irvine/menu/",
        },
    ]

    # Backup restaurants tried in order when a primary slot yields < 3 menu
    # items or raises an exception.
    backups: List[Dict[str, str]] = [
        {
            "name": "Board & Brew",
            "url": "https://boardandbrew.com/menu",
        },
        {
            "name": "The Kebab Shop",
            "url": "https://thekebabshop.com/menu/",
        },
        {
            "name": "Denny's",
            "url": "https://www.dennys.com/food/",
        },
        {
            "name": "BJ's Restaurant & Brewhouse",
            "url": "https://www.bjsrestaurants.com/menu",
        },
    ]

    def _try_extract(entry: Dict[str, str]) -> Optional[Dict[str, Any]]:
        """Return a formatted restaurant entry, or None if extraction
        fails or yields fewer than 3 menu items."""
        url = entry["url"]
        try:
            raw_data = extract_restaurant_data(app, url)
            formatted = build_restaurant_entry(raw_data, source_url=url)
            if not formatted.get("name") or len(formatted.get("menu", [])) < 3:
                print(f"  -> WARNING: insufficient data (name={bool(formatted.get('name'))}, menu={len(formatted.get('menu', []))} items)")
                return None
            print(f"  -> {len(formatted['menu'])} menu items")
            return formatted
        except Exception as exc:
            print(f"  -> FAILED: {exc}")
            return None

    all_restaurants: List[Dict[str, Any]] = []
    backup_iter = iter(backups)

    for entry in restaurants:
        print(f"Extracting: {entry['name']} ({entry['url']})")
        result = _try_extract(entry)
        if result is not None:
            all_restaurants.append(result)
            continue
        # Primary failed — try the next unused backup
        replaced = False
        for backup in backup_iter:
            print(f"  -> Trying backup: {backup['name']} ({backup['url']})")
            result = _try_extract(backup)
            if result is not None:
                all_restaurants.append(result)
                replaced = True
                break
        if not replaced:
            print(f"  -> No backup available; skipping slot for {entry['name']}")

    # Write to output JSON file
    output_path = "data.json"
    with open(output_path, "w", encoding="utf-8") as fh:
        json.dump(all_restaurants, fh, indent=2, ensure_ascii=False)
    print(f"Saved {len(all_restaurants)} restaurants to {output_path}")


if __name__ == "__main__":
    main()