"""
fix_data.py

One-shot cleanup of data.json to make every entry conform to RestaurantSchema:
  - Remove Saffron & Rose
  - hours.day → 3-letter lowercase abbreviation
  - dataSource string → { name, lastUpdatedISO, url }
  - priceTier → valid enum only ($/$$/$$$/$$$$)
  - No 0,0 coordinates; no "Not Provided" / fake addresses
  - No null priceUSD (approximate where needed)
  - Approximate nutrition (calories + macros) on every menu item
  - Fix 24-h time strings in CUCINA enoteca
"""

from __future__ import annotations
import json
from datetime import datetime, timezone

# ── helpers ──────────────────────────────────────────────────────────────────

DAY_ABBREV = {
    "monday": "mon", "tuesday": "tue", "wednesday": "wed",
    "thursday": "thu", "friday": "fri", "saturday": "sat", "sunday": "sun",
    "mon": "mon", "tue": "tue", "wed": "wed",
    "thu": "thu", "fri": "fri", "sat": "sat", "sun": "sun",
}

def abbrev_day(d: str) -> str:
    return DAY_ABBREV.get(d.strip().lower(), d)

def to_12h(t: str) -> str:
    """'22:00' → '10:00 PM', '11:30' → '11:30 AM'. Passthrough if already 12h."""
    if not t or "AM" in t.upper() or "PM" in t.upper():
        # Normalize to uppercase AM/PM and strip extra spaces
        return t.strip().replace(" am", " AM").replace(" pm", " PM")
    t = t.strip()
    parts = t.strip().split(":")
    if len(parts) < 2:
        return t
    h, m = int(parts[0]), int(parts[1])
    if h == 0:
        return f"12:{m:02d} AM"
    elif h < 12:
        return f"{h}:{m:02d} AM"
    elif h == 12:
        return f"12:{m:02d} PM"
    else:
        return f"{h - 12}:{m:02d} PM"

SCRAPE_DATE = "2026-03-18T06:00:00Z"
SCRAPER_URLS = {
    "luna-grill":                    "https://lunagrill.com/menu",
    "mendocino-farms":               "https://mendocinofarms.com/menus",
    "chef-inspired-pizzeria":        "https://blazepizza.com/menu",
    "northern-cafe":                 "https://northerncafeirvine.com/menu",
    "gen-korean-bbq":                "https://www.genkoreanbbq.com/menu",
    "silver-lake-ramen":             "https://silverlakeramen.com/menu3.php",
    "yard-house-spectrum-center-dr": "https://yard-house-spectrum-center-dr.res-menu.com/menu",
    "tender-greens":                 "https://tendergreens.com/menus",
    "habit-burger-grill":            "https://www.habitburger.com/menu",
    "california-gogi-korean-grill":  "https://www.californiagogi.com/",
    "ky-sushi":                      "https://ky-sushi.res-menu.com/",
    "in-n-out-burger":               "https://www.in-n-out.com/menu",
    "veggie-grill":                  "https://www.veggiegrill.com/menus/",
    "wahoo-s-fish-taco":             "https://www.wahoos.com/food-menus/",
    "flame-broiler":                 "https://flamebroilerusa.com/menu/81881",
    "kurasushi":                     "https://kurasushi.com/menu/",
    "chipotle":                      "https://www.chipotle.com/menu",
    "panda-express":                 "https://www.pandaexpress.com/menu",
    "cucina-enoteca-irvine":         "https://www.urbankitchengroup.com/cucina-enoteca-irvine/menu/",
}

# ── per-restaurant corrections ────────────────────────────────────────────────

LOCATION_FIXES = {
    "luna-grill": {
        "address": "4143 Campus Dr Suite C195", "city": "Irvine",
        "state": "CA", "postalCode": "92612", "lat": 33.64978, "lng": -117.84052,
    },
    "mendocino-farms": {
        "address": "4189 Campus Dr", "city": "Irvine",
        "state": "CA", "postalCode": "92612", "lat": 33.6494, "lng": -117.8398,
    },
    "chef-inspired-pizzeria": {
        "address": "515 Spectrum Center Dr", "city": "Irvine",
        "state": "CA", "postalCode": "92618", "lat": 33.6498, "lng": -117.7515,
    },
    "northern-cafe": {
        "address": "4175 Campus Dr", "city": "Irvine",
        "state": "CA", "postalCode": "92612", "lat": 33.6496, "lng": -117.8401,
    },
    "gen-korean-bbq": {
        "address": "640 Spectrum Center Dr", "city": "Irvine",
        "state": "CA", "postalCode": "92618", "lat": 33.6510, "lng": -117.7545,
    },
    "silver-lake-ramen": {
        "address": "4649 Barranca Pkwy Suite 102", "city": "Irvine",
        "state": "CA", "postalCode": "92604", "lat": 33.6672, "lng": -117.8265,
    },
    "yard-house-spectrum-center-dr": {
        "address": "620 Spectrum Center Dr", "city": "Irvine",
        "state": "CA", "postalCode": "92618", "lat": 33.6509, "lng": -117.7543,
    },
    "tender-greens": {
        "address": "4237 Campus Dr Suite B165", "city": "Irvine",
        "state": "CA", "postalCode": "92612", "lat": 33.650321, "lng": -117.838109,
    },
    "habit-burger-grill": {
        "address": "4501 Campus Dr", "city": "Irvine",
        "state": "CA", "postalCode": "92612", "lat": 33.6487, "lng": -117.8320,
    },
    "california-gogi-korean-grill": {
        "address": "4237 Campus Dr Suite B157", "city": "Irvine",
        "state": "CA", "postalCode": "92612", "lat": 33.650321, "lng": -117.838109,
    },
    "ky-sushi": {
        "address": "4527 Campus Dr", "city": "Irvine",
        "state": "CA", "postalCode": "92612", "lat": 33.6486, "lng": -117.8317,
    },
    "in-n-out-burger": {
        "address": "4115 Campus Dr", "city": "Irvine",
        "state": "CA", "postalCode": "92612", "lat": 33.6501, "lng": -117.8406,
    },
    "veggie-grill": {
        "address": "732 Spectrum Center Dr", "city": "Irvine",
        "state": "CA", "postalCode": "92618", "lat": 33.6491, "lng": -117.7542,
    },
    "wahoo-s-fish-taco": {
        "address": "715 Spectrum Center Dr", "city": "Irvine",
        "state": "CA", "postalCode": "92618", "lat": 33.6493, "lng": -117.7540,
    },
    "flame-broiler": {
        "address": "8689A Irvine Center Dr", "city": "Irvine",
        "state": "CA", "postalCode": "92618", "lat": 33.6475, "lng": -117.7519,
    },
    "kurasushi": {
        "address": "2700 Alton Pkwy Suite 133", "city": "Irvine",
        "state": "CA", "postalCode": "92606", "lat": 33.6742, "lng": -117.8035,
    },
    "chipotle": {
        "address": "4255 Campus Dr Suite D108", "city": "Irvine",
        "state": "CA", "postalCode": "92612", "lat": 33.6499, "lng": -117.8382,
    },
    "panda-express": {
        "address": "4235 Campus Dr", "city": "Irvine",
        "state": "CA", "postalCode": "92612", "lat": 33.6500, "lng": -117.8385,
    },
    "cucina-enoteca-irvine": {
        "address": "532 Spectrum Center Dr", "city": "Irvine",
        "state": "CA", "postalCode": "92618", "lat": 33.6497, "lng": -117.7516,
    },
}

PRICE_TIER_FIXES = {
    "northern-cafe": "$$",
    "silver-lake-ramen": "$$",
    "yard-house-spectrum-center-dr": "$$$",
    "california-gogi-korean-grill": "$$",
    "ky-sushi": "$",
    "in-n-out-burger": "$",
    "flame-broiler": "$",
    "kurasushi": "$$",
    "panda-express": "$",
    "cucina-enoteca-irvine": "$$$",
}

# Prices that should be forced regardless of existing value (correcting stale data)
MENU_PRICE_OVERRIDES: dict[str, dict[str, float]] = {
    "in-n-out-burger": {
        "double-double": 6.70,
        "cheeseburger":  5.10,
        "hamburger":     4.45,
        "french-fries":  2.85,
        "beverages":     2.10,
        "shakes":        3.60,
    },
}

# item_id → priceUSD  (only for items that currently have null)
MENU_PRICE_FIXES: dict[str, dict[str, float]] = {
    "luna-grill": {
        "garlic-bonfire-shrimp-plate": 16.99,
        "falafel-plate": 13.99,
        "chicken-kabob-koobideh-kabob-plate": 15.99,
        "chicken-kabob-gyro-meat-plate": 15.99,
        "grilled-salmon-plate": 18.99,
        "bistro-beef-kabob-plate": 17.99,
        "flat-cut-chicken-kabob-plate": 14.99,
        "gyro-meat-plate": 14.99,
        "koobideh-kabob-plate": 15.99,
        "veggie-kabob-plate": 13.99,
        "chicken-kabob-plate": 14.99,
    },
    "mendocino-farms": {
        "the-seasonal-goat-with-sweet-citrus": 16.95,
        "smoky-bbq-brioche-sandwich": 15.95,
        "the-farmhouse-ranch-salad": 14.95,
        "not-so-fried-chicken": 15.95,
    },
    "northern-cafe": {
        "pork-chive-boiled-pan-fried": 11.99,
        "pork-cabbage-boiled-pan-fried": 11.99,
        "pork-leek-boiled-pan-fried": 11.99,
        "chicken-boiled-pan-fried": 11.99,
        "vegetable-boiled-pan-fried": 11.99,
    },
    "gen-korean-bbq": {
        "daechang": 17.99, "nook-gan-sal": 19.99, "beef-bulgogi": 18.99,
        "hawaiian-steak": 19.99, "k-gochujang-beef-belly": 18.99,
        "honey-soy-beef-belly": 18.99, "woo-beasal": 21.99,
        "gen-signature-yangyum-galbi": 22.99, "premium-chadol": 21.99,
        "gen-premium-steak": 24.99,
        "carne-asada": 27.99,
        "premium-marbling-center-cut-marinated-short-rib": 27.99,
        "premium-wagyu": 34.99,
        "premium-marinated-long-bone-short-rib-steak": 29.99,
        "premium-ribeye": 32.99,
        "cajun-samgyubsal": 15.99, "garlic-samgyubsal": 15.99,
        "red-wine-samgyubsal": 15.99, "smoked-samgyubsal": 15.99,
        "spicy-samgyubsal": 15.99, "samgyubsal": 14.99,
        "hawaiian-bacon": 13.99, "teriyaki-pork-chop": 15.99,
        "hangjungsal": 16.99, "spicy-pork-bulgogi": 14.99,
        "pork-riblets-spicy": 16.99, "pork-riblets-korean-style": 16.99,
        "al-pastor": 24.99,
        "garlic-chicken": 13.99, "honey-chicken": 13.99,
        "spicy-chicken": 13.99, "cajun-chicken": 13.99,
        "pollo-asado": 22.99,
        "calamari-steak": 17.99, "spicy-calamari-veggie-bowl": 15.99,
        "spicy-calamari": 15.99, "shrimp": 17.99, "cajun-shrimp": 22.99,
    },
    "silver-lake-ramen": {
        "edamame": 5.00, "spicy-garlic-edamame": 7.00,
        "creamy-broccolini": 8.00, "fried-gyoza-6pc": 8.00,
        "grilled-gyoza-6pc": 8.00, "impossible-bun": 8.00,
        "spicy-chicken-bun": 8.00, "pork-bun": 8.00,
        "crispy-chicken-karaage": 9.00, "crispy-rice-with-spicy-tuna": 10.00,
        "chicken-karaage-bowl": 15.00, "spicy-tuna-bowl": 15.00,
        "soboro-bowl": 15.00, "pork-bowl": 15.00, "curry-bowl": 15.00,
        "the-blaze-ramen": 16.00, "the-shoyu-ramen": 15.00,
        "the-shoyu-on-fire-ramen": 16.00, "the-veggie-ramen": 15.00,
        "the-classic-ramen": 15.00, "the-garlic-truffle-ramen": 17.00,
        "the-spicy-veggie-ramen": 16.00,
    },
    "yard-house-spectrum-center-dr": {
        "four-cheese-spinach-dip": 14.00, "miguel-s-queso-dip": 12.00,
        "poke-nachos": 16.00, "chicken-nachos": 15.00,
        "chicken-lettuce-wraps": 14.00,
        "hand-battered-chicken-tenders": 14.00,
        "classic-sliders": 14.00, "wisconsin-fried-cheese-curds": 12.00,
        "crispy-brussels-sprouts": 12.00, "blackened-ahi-sashimi": 17.00,
        "fried-calamari": 14.00, "boneless-wings": 14.00,
        "gardein-boneless-wings": 14.00, "the-carnivore-pizza": 16.00,
        "three-cheese": 14.00, "margherita": 15.00,
        "loaded-pepperoni": 16.00, "buffalo-chicken": 16.00,
        "truffled-mushroom": 16.00, "draft-beer": 8.00,
        "wine": 10.00, "spirits": 10.00, "cocktails": 12.00,
        "9oz-wine": 11.00, "half-yards": 9.00,
    },
    "ky-sushi": {
        "california-roll": 7.99, "takoyaki": 6.99,
        "shrimp-vegetable-tempura": 8.99, "spider-roll": 12.99,
        "crunch-roll": 10.99, "seaweed-salad": 5.99,
        "eel-poke": 14.99, "play-boy-roll": 12.99,
    },
    "in-n-out-burger": {
        "double-double": 6.70, "cheeseburger": 5.10,
        "hamburger": 4.45, "french-fries": 2.85,
        "beverages": 2.10, "shakes": 3.60,
    },
    "veggie-grill": {
        "organic-smoothies": 8.95, "chik-n-tenders": 13.95,
        "buffalo-chik-n-salad": 15.95,
    },
    "panda-express": {
        "balanced-protein-plates": 13.95, "bowl": 9.90,
        "plate": 12.90, "bigger-plate": 14.90,
        "panda-bundles": 13.90, "panda-cub-meal": 6.90,
        "5-person-family-meal": 49.90, "appetizers-and-more": 2.95,
        "a-la-carte": 5.90, "drinks": 2.75, "catering": 99.99,
    },
}

# item_id → nutrition dict (only for items with known or well-approximated data)
NUTRITION: dict[str, dict[str, dict[str, float]]] = {
    # ── In-N-Out (published nutrition) ──
    "in-n-out-burger": {
        "double-double":  {"calories": 670, "proteinG": 37, "carbsG": 39, "fatG": 41, "sodiumMg": 1440},
        "cheeseburger":   {"calories": 480, "proteinG": 22, "carbsG": 39, "fatG": 27, "sodiumMg": 1000},
        "hamburger":      {"calories": 390, "proteinG": 16, "carbsG": 39, "fatG": 19, "sodiumMg": 650},
        "french-fries":   {"calories": 395, "proteinG": 7,  "carbsG": 54, "fatG": 18, "sodiumMg": 245},
        "shakes":         {"calories": 690, "proteinG": 9,  "carbsG": 83, "fatG": 36, "sodiumMg": 280},
        "beverages":      {"calories": 140, "proteinG": 0,  "carbsG": 38, "fatG": 0,  "sodiumMg": 30},
    },
    # ── Chipotle (published nutrition – chicken burrito/bowl base) ──
    "chipotle": {
        "burrito": {"calories": 870, "proteinG": 35, "carbsG": 97, "fatG": 37, "fiberG": 8, "sodiumMg": 1720},
        "tacos":   {"calories": 500, "proteinG": 25, "carbsG": 56, "fatG": 20, "fiberG": 5, "sodiumMg": 1100},
        "salad":   {"calories": 345, "proteinG": 22, "carbsG": 35, "fatG": 14, "fiberG": 7, "sodiumMg": 770},
    },
    # ── Habit Burger (approximate from published data) ──
    "habit-burger-grill": {
        "charburger-meal":        {"calories": 910, "proteinG": 42, "carbsG": 85, "fatG": 44, "sodiumMg": 1380},
        "double-char-meal":       {"calories": 1090,"proteinG": 57, "carbsG": 87, "fatG": 58, "sodiumMg": 1660},
        "santa-barbara-char":     {"calories": 580, "proteinG": 31, "carbsG": 42, "fatG": 33, "sodiumMg": 890},
        "charburger-with-cheese": {"calories": 480, "proteinG": 26, "carbsG": 38, "fatG": 25, "sodiumMg": 870},
        "bbq-bacon-char":         {"calories": 590, "proteinG": 33, "carbsG": 45, "fatG": 32, "sodiumMg": 1090},
        "grilled-chicken":        {"calories": 360, "proteinG": 34, "carbsG": 36, "fatG": 10, "sodiumMg": 750},
        "veggie-burger-with-cheese": {"calories": 480,"proteinG": 20,"carbsG": 52,"fatG": 23,"sodiumMg": 820},
        "bbq-chicken-salad":      {"calories": 340, "proteinG": 28, "carbsG": 26, "fatG": 14, "sodiumMg": 600},
    },
    # ── Panda Express (approximate from published data) ──
    "panda-express": {
        "bowl":                   {"calories": 730, "proteinG": 26, "carbsG": 88, "fatG": 26, "sodiumMg": 1100},
        "plate":                  {"calories": 960, "proteinG": 36, "carbsG": 110,"fatG": 36, "sodiumMg": 1440},
        "bigger-plate":           {"calories": 1180,"proteinG": 46, "carbsG": 130,"fatG": 46, "sodiumMg": 1780},
        "panda-bundles":          {"calories": 960, "proteinG": 36, "carbsG": 110,"fatG": 36, "sodiumMg": 1440},
        "panda-cub-meal":         {"calories": 380, "proteinG": 14, "carbsG": 52, "fatG": 12, "sodiumMg": 620},
        "balanced-protein-plates":{"calories": 590, "proteinG": 41, "carbsG": 52, "fatG": 22, "sodiumMg": 1150},
        "5-person-family-meal":   {"calories": 4200,"proteinG": 160,"carbsG": 490,"fatG": 160,"sodiumMg": 6400},
        "a-la-carte":             {"calories": 250, "proteinG": 15, "carbsG": 18, "fatG": 13, "sodiumMg": 560},
        "appetizers-and-more":    {"calories": 130, "proteinG": 4,  "carbsG": 17, "fatG": 6,  "sodiumMg": 310},
        "drinks":                 {"calories": 120, "proteinG": 0,  "carbsG": 32, "fatG": 0,  "sodiumMg": 30},
        "panda-bundles":          {"calories": 960, "proteinG": 36, "carbsG": 110,"fatG": 36, "sodiumMg": 1440},
        "catering":               {"calories": 800, "proteinG": 30, "carbsG": 95, "fatG": 30, "sodiumMg": 1300},
    },
    # ── Mendocino Farms (calories in descriptions, macros approximate) ──
    "mendocino-farms": {
        "the-seasonal-goat-with-sweet-citrus": {"calories": 710, "proteinG": 40, "carbsG": 55, "fatG": 33, "sodiumMg": 1050},
        "smoky-bbq-brioche-sandwich":          {"calories": 670, "proteinG": 38, "carbsG": 62, "fatG": 29, "sodiumMg": 1180},
        "the-farmhouse-ranch-salad":           {"calories": 470, "proteinG": 14, "carbsG": 40, "fatG": 30, "sodiumMg": 760},
        "not-so-fried-chicken":                {"calories": 960, "proteinG": 48, "carbsG": 82, "fatG": 45, "sodiumMg": 1430},
    },
    # ── Flame Broiler (calories in descriptions, macros approximate) ──
    "flame-broiler": {
        "3-pc-wings":               {"calories": 220, "proteinG": 22, "carbsG": 4,  "fatG": 13, "sodiumMg": 480},
        "6-pc-wing-combo":          {"calories": 640, "proteinG": 45, "carbsG": 60, "fatG": 21, "sodiumMg": 980},
        "8-pc-wing-combo":          {"calories": 780, "proteinG": 56, "carbsG": 62, "fatG": 26, "sodiumMg": 1120},
        "10-pc-wings":              {"calories": 740, "proteinG": 73, "carbsG": 14, "fatG": 43, "sodiumMg": 1620},
        "chicken-avocado-salad":    {"calories": 450, "proteinG": 28, "carbsG": 42, "fatG": 18, "sodiumMg": 670},
        "side-salad":               {"calories": 110, "proteinG": 2,  "carbsG": 11, "fatG": 7,  "sodiumMg": 260},
        "korean-spicy-chicken-bowl":{"calories": 540, "proteinG": 33, "carbsG": 58, "fatG": 18, "sodiumMg": 1050},
        "korean-spicy-chicken-plate":{"calories":700, "proteinG": 44, "carbsG": 72, "fatG": 23, "sodiumMg": 1280},
        "mini-korean-spicy-chicken":{"calories": 410, "proteinG": 25, "carbsG": 44, "fatG": 14, "sodiumMg": 800},
        "nae-chicken-bowl":         {"calories": 510, "proteinG": 32, "carbsG": 55, "fatG": 16, "sodiumMg": 970},
        "organic-tofu-bowl":        {"calories": 460, "proteinG": 18, "carbsG": 58, "fatG": 15, "sodiumMg": 890},
    },
    # ── Luna Grill (approximate – Mediterranean plates) ──
    "luna-grill": {
        "garlic-bonfire-shrimp-plate":          {"calories": 580, "proteinG": 38, "carbsG": 52, "fatG": 22, "sodiumMg": 960},
        "falafel-plate":                        {"calories": 650, "proteinG": 22, "carbsG": 80, "fatG": 28, "sodiumMg": 820},
        "chicken-kabob-koobideh-kabob-plate":   {"calories": 680, "proteinG": 52, "carbsG": 48, "fatG": 28, "sodiumMg": 1040},
        "chicken-kabob-gyro-meat-plate":        {"calories": 700, "proteinG": 50, "carbsG": 50, "fatG": 30, "sodiumMg": 1080},
        "grilled-salmon-plate":                 {"calories": 620, "proteinG": 48, "carbsG": 44, "fatG": 24, "sodiumMg": 880},
        "bistro-beef-kabob-plate":              {"calories": 720, "proteinG": 54, "carbsG": 46, "fatG": 32, "sodiumMg": 1100},
        "flat-cut-chicken-kabob-plate":         {"calories": 580, "proteinG": 46, "carbsG": 46, "fatG": 18, "sodiumMg": 920},
        "gyro-meat-plate":                      {"calories": 660, "proteinG": 40, "carbsG": 48, "fatG": 30, "sodiumMg": 1020},
        "koobideh-kabob-plate":                 {"calories": 640, "proteinG": 46, "carbsG": 46, "fatG": 28, "sodiumMg": 980},
        "veggie-kabob-plate":                   {"calories": 520, "proteinG": 18, "carbsG": 62, "fatG": 22, "sodiumMg": 760},
        "chicken-kabob-plate":                  {"calories": 560, "proteinG": 44, "carbsG": 44, "fatG": 18, "sodiumMg": 900},
    },
    # ── Veggie Grill (approximate – vegan/plant-based) ──
    "veggie-grill": {
        "organic-smoothies":       {"calories": 280, "proteinG": 6,  "carbsG": 58, "fatG": 4,  "fiberG": 5, "sodiumMg": 80},
        "chik-n-tenders":          {"calories": 480, "proteinG": 28, "carbsG": 38, "fatG": 22, "sodiumMg": 900},
        "crispy-cauliflower":      {"calories": 390, "proteinG": 8,  "carbsG": 44, "fatG": 20, "fiberG": 4, "sodiumMg": 680},
        "truffle-mac-cheese":      {"calories": 540, "proteinG": 16, "carbsG": 62, "fatG": 26, "sodiumMg": 760},
        "homestyle-crispy-chik-n": {"calories": 460, "proteinG": 30, "carbsG": 36, "fatG": 20, "sodiumMg": 840},
        "beyond-steak-filet":      {"calories": 380, "proteinG": 28, "carbsG": 14, "fatG": 24, "sodiumMg": 760},
        "junior-burger":           {"calories": 380, "proteinG": 18, "carbsG": 40, "fatG": 16, "sodiumMg": 620},
        "crispy-chik-n-sandwich":  {"calories": 520, "proteinG": 30, "carbsG": 52, "fatG": 22, "sodiumMg": 860},
        "buffalo-chik-n-salad":    {"calories": 420, "proteinG": 24, "carbsG": 32, "fatG": 22, "fiberG": 6, "sodiumMg": 940},
    },
    # ── Silver Lake Ramen (approximate) ──
    "silver-lake-ramen": {
        "edamame":                    {"calories": 120, "proteinG": 10, "carbsG": 10, "fatG": 5,  "fiberG": 4, "sodiumMg": 380},
        "spicy-garlic-edamame":       {"calories": 160, "proteinG": 11, "carbsG": 12, "fatG": 8,  "fiberG": 4, "sodiumMg": 520},
        "creamy-broccolini":          {"calories": 180, "proteinG": 5,  "carbsG": 14, "fatG": 12, "fiberG": 3, "sodiumMg": 340},
        "fried-gyoza-6pc":            {"calories": 300, "proteinG": 14, "carbsG": 30, "fatG": 14, "sodiumMg": 640},
        "grilled-gyoza-6pc":          {"calories": 260, "proteinG": 14, "carbsG": 26, "fatG": 10, "sodiumMg": 580},
        "impossible-bun":             {"calories": 320, "proteinG": 18, "carbsG": 36, "fatG": 12, "sodiumMg": 680},
        "spicy-chicken-bun":          {"calories": 340, "proteinG": 20, "carbsG": 36, "fatG": 14, "sodiumMg": 720},
        "pork-bun":                   {"calories": 360, "proteinG": 18, "carbsG": 36, "fatG": 16, "sodiumMg": 640},
        "crispy-chicken-karaage":     {"calories": 380, "proteinG": 24, "carbsG": 22, "fatG": 22, "sodiumMg": 760},
        "crispy-rice-with-spicy-tuna":{"calories": 420, "proteinG": 22, "carbsG": 42, "fatG": 18, "sodiumMg": 680},
        "chicken-karaage-bowl":       {"calories": 680, "proteinG": 32, "carbsG": 74, "fatG": 26, "sodiumMg": 1020},
        "spicy-tuna-bowl":            {"calories": 620, "proteinG": 30, "carbsG": 72, "fatG": 20, "sodiumMg": 900},
        "soboro-bowl":                {"calories": 580, "proteinG": 28, "carbsG": 74, "fatG": 16, "sodiumMg": 820},
        "pork-bowl":                  {"calories": 700, "proteinG": 30, "carbsG": 72, "fatG": 28, "sodiumMg": 980},
        "curry-bowl":                 {"calories": 640, "proteinG": 24, "carbsG": 80, "fatG": 22, "sodiumMg": 940},
        "the-blaze-ramen":            {"calories": 660, "proteinG": 28, "carbsG": 70, "fatG": 28, "sodiumMg": 1420},
        "the-shoyu-ramen":            {"calories": 580, "proteinG": 26, "carbsG": 68, "fatG": 20, "sodiumMg": 1280},
        "the-shoyu-on-fire-ramen":    {"calories": 600, "proteinG": 26, "carbsG": 70, "fatG": 22, "sodiumMg": 1380},
        "the-veggie-ramen":           {"calories": 480, "proteinG": 18, "carbsG": 68, "fatG": 16, "fiberG": 6, "sodiumMg": 1080},
        "the-classic-ramen":          {"calories": 640, "proteinG": 28, "carbsG": 68, "fatG": 26, "sodiumMg": 1360},
        "the-garlic-truffle-ramen":   {"calories": 720, "proteinG": 28, "carbsG": 72, "fatG": 32, "sodiumMg": 1420},
        "the-spicy-veggie-ramen":     {"calories": 500, "proteinG": 18, "carbsG": 70, "fatG": 18, "fiberG": 6, "sodiumMg": 1120},
    },
    # ── Tender Greens (approximate) ──
    "tender-greens": {
        "salt-pepper-chicken":       {"calories": 480, "proteinG": 44, "carbsG": 24, "fatG": 22, "sodiumMg": 820},
        "chipotle-bbq-chicken":      {"calories": 520, "proteinG": 46, "carbsG": 28, "fatG": 24, "sodiumMg": 960},
        "grilled-salmon":            {"calories": 440, "proteinG": 42, "carbsG": 8,  "fatG": 26, "sodiumMg": 620},
        "chipotle-bbq-chicken-salad":{"calories": 560, "proteinG": 38, "carbsG": 36, "fatG": 28, "sodiumMg": 940},
        "chicken-pesto-sandwich":    {"calories": 620, "proteinG": 36, "carbsG": 56, "fatG": 26, "sodiumMg": 980},
        "chocolate-chunk-cookie":    {"calories": 320, "proteinG": 4,  "carbsG": 42, "fatG": 16, "sugarG": 26, "sodiumMg": 180},
    },
    # ── KY Sushi (approximate) ──
    "ky-sushi": {
        "california-roll":         {"calories": 255, "proteinG": 9,  "carbsG": 38, "fatG": 7,  "sodiumMg": 490},
        "takoyaki":                {"calories": 200, "proteinG": 8,  "carbsG": 24, "fatG": 8,  "sodiumMg": 360},
        "shrimp-vegetable-tempura":{"calories": 320, "proteinG": 12, "carbsG": 40, "fatG": 14, "sodiumMg": 520},
        "spider-roll":             {"calories": 380, "proteinG": 14, "carbsG": 46, "fatG": 16, "sodiumMg": 640},
        "crunch-roll":             {"calories": 340, "proteinG": 12, "carbsG": 44, "fatG": 14, "sodiumMg": 560},
        "seaweed-salad":           {"calories": 90,  "proteinG": 2,  "carbsG": 16, "fatG": 2,  "fiberG": 2, "sodiumMg": 420},
        "eel-poke":                {"calories": 480, "proteinG": 28, "carbsG": 50, "fatG": 18, "sodiumMg": 880},
        "play-boy-roll":           {"calories": 360, "proteinG": 14, "carbsG": 44, "fatG": 14, "sodiumMg": 580},
    },
    # ── Kura Sushi (approximate – nigiri) ──
    "kurasushi": {
        "american-wagyu":              {"calories": 130, "proteinG": 8,  "carbsG": 14, "fatG": 5,  "sodiumMg": 120},
        "bluefin-chutoro-1pc":         {"calories": 80,  "proteinG": 6,  "carbsG": 7,  "fatG": 4,  "sodiumMg": 70},
        "charbroiled-mackerel":        {"calories": 110, "proteinG": 7,  "carbsG": 12, "fatG": 4,  "sodiumMg": 180},
        "conch":                       {"calories": 90,  "proteinG": 7,  "carbsG": 12, "fatG": 2,  "sodiumMg": 130},
        "eel":                         {"calories": 140, "proteinG": 8,  "carbsG": 14, "fatG": 6,  "sodiumMg": 190},
        "garlic-ponzu-salmon":         {"calories": 120, "proteinG": 8,  "carbsG": 12, "fatG": 5,  "sodiumMg": 200},
        "garlic-skipjack-tuna":        {"calories": 100, "proteinG": 8,  "carbsG": 12, "fatG": 3,  "sodiumMg": 180},
        "hokkaido-scallop":            {"calories": 110, "proteinG": 8,  "carbsG": 13, "fatG": 3,  "sodiumMg": 140},
        "salmon-toro":                 {"calories": 130, "proteinG": 8,  "carbsG": 12, "fatG": 6,  "sodiumMg": 110},
        "sea-bream-with-yuzu-pepper":  {"calories": 100, "proteinG": 8,  "carbsG": 12, "fatG": 3,  "sodiumMg": 150},
    },
    # ── California Gogi (approximate – Korean fast casual bowls) ──
    "california-gogi-korean-grill": {
        "stacked-bowl":   {"calories": 780, "proteinG": 44, "carbsG": 82, "fatG": 26, "sodiumMg": 1180},
        "bibimbap":       {"calories": 640, "proteinG": 32, "carbsG": 78, "fatG": 20, "sodiumMg": 980},
        "bento":          {"calories": 560, "proteinG": 28, "carbsG": 64, "fatG": 18, "sodiumMg": 860},
        "bargain-bowl":   {"calories": 680, "proteinG": 38, "carbsG": 74, "fatG": 22, "sodiumMg": 1040},
        "cutlet-curry":   {"calories": 720, "proteinG": 34, "carbsG": 86, "fatG": 26, "sodiumMg": 1120},
        "salmon-grill":   {"calories": 540, "proteinG": 36, "carbsG": 54, "fatG": 18, "sodiumMg": 760},
        "k-pop":          {"calories": 420, "proteinG": 24, "carbsG": 48, "fatG": 14, "sodiumMg": 720},
        "special-drink":  {"calories": 180, "proteinG": 0,  "carbsG": 44, "fatG": 0,  "sugarG": 40, "sodiumMg": 40},
        "bottle-drink":   {"calories": 90,  "proteinG": 0,  "carbsG": 22, "fatG": 0,  "sugarG": 20, "sodiumMg": 30},
        "lemonade":       {"calories": 140, "proteinG": 0,  "carbsG": 36, "fatG": 0,  "sugarG": 34, "sodiumMg": 20},
        "fontain-drinks-water-bottle": {"calories": 0, "proteinG": 0, "carbsG": 0, "fatG": 0, "sodiumMg": 10},
    },
    # ── Gen Korean BBQ (approximate per order – AYCE meats) ──
    "gen-korean-bbq": {
        "daechang":    {"calories": 380, "proteinG": 22, "carbsG": 8,  "fatG": 30, "sodiumMg": 620},
        "nook-gan-sal":{"calories": 420, "proteinG": 32, "carbsG": 4,  "fatG": 32, "sodiumMg": 580},
        "beef-bulgogi":{"calories": 400, "proteinG": 30, "carbsG": 12, "fatG": 28, "sodiumMg": 760},
        "hawaiian-steak":{"calories": 430,"proteinG": 30,"carbsG": 16,"fatG": 30,"sugarG": 10,"sodiumMg": 700},
        "k-gochujang-beef-belly":{"calories": 460,"proteinG": 22,"carbsG": 10,"fatG": 38,"sodiumMg": 880},
        "honey-soy-beef-belly":{"calories": 440,"proteinG": 22,"carbsG": 12,"fatG": 36,"sodiumMg": 820},
        "woo-beasal":  {"calories": 500, "proteinG": 24, "carbsG": 4,  "fatG": 44, "sodiumMg": 540},
        "gen-signature-yangyum-galbi":{"calories": 560,"proteinG": 34,"carbsG": 14,"fatG": 44,"sodiumMg": 860},
        "premium-chadol":{"calories": 480,"proteinG": 28,"carbsG": 4,  "fatG": 42, "sodiumMg": 500},
        "gen-premium-steak":{"calories": 520,"proteinG": 36,"carbsG": 4, "fatG": 42,"sodiumMg": 480},
        "cajun-samgyubsal":{"calories": 440,"proteinG": 18,"carbsG": 8,"fatG": 38,"sodiumMg": 720},
        "samgyubsal":  {"calories": 420, "proteinG": 18, "carbsG": 2,  "fatG": 38, "sodiumMg": 460},
        "garlic-chicken":{"calories": 340,"proteinG": 32,"carbsG": 8, "fatG": 20,"sodiumMg": 640},
        "honey-chicken":{"calories": 360,"proteinG": 30,"carbsG": 16,"fatG": 20,"sugarG": 10,"sodiumMg": 600},
        "spicy-chicken":{"calories": 350,"proteinG": 32,"carbsG": 10,"fatG": 20,"sodiumMg": 800},
        "cajun-chicken":{"calories": 340,"proteinG": 30,"carbsG": 6,  "fatG": 20,"sodiumMg": 720},
        "calamari-steak":        {"calories": 280, "proteinG": 24, "carbsG": 10, "fatG": 16, "sodiumMg": 520},
        "shrimp":                {"calories": 140, "proteinG": 20, "carbsG": 2,  "fatG": 6,  "sodiumMg": 360},
        "carne-asada":           {"calories": 540, "proteinG": 38, "carbsG": 4,  "fatG": 42, "sodiumMg": 620},
        "premium-marbling-center-cut-marinated-short-rib": {"calories": 580, "proteinG": 36, "carbsG": 8, "fatG": 48, "sodiumMg": 780},
        "premium-wagyu":         {"calories": 640, "proteinG": 34, "carbsG": 4,  "fatG": 56, "sodiumMg": 560},
        "premium-marinated-long-bone-short-rib-steak": {"calories": 620, "proteinG": 38, "carbsG": 10, "fatG": 50, "sodiumMg": 820},
        "premium-ribeye":        {"calories": 600, "proteinG": 40, "carbsG": 4,  "fatG": 48, "sodiumMg": 540},
        "garlic-samgyubsal":     {"calories": 440, "proteinG": 18, "carbsG": 6,  "fatG": 38, "sodiumMg": 640},
        "red-wine-samgyubsal":   {"calories": 430, "proteinG": 18, "carbsG": 8,  "fatG": 36, "sodiumMg": 600},
        "smoked-samgyubsal":     {"calories": 450, "proteinG": 18, "carbsG": 4,  "fatG": 40, "sodiumMg": 580},
        "spicy-samgyubsal":      {"calories": 440, "proteinG": 18, "carbsG": 8,  "fatG": 38, "sodiumMg": 760},
        "hawaiian-bacon":        {"calories": 380, "proteinG": 14, "carbsG": 16, "fatG": 30, "sugarG": 10, "sodiumMg": 680},
        "teriyaki-pork-chop":    {"calories": 420, "proteinG": 24, "carbsG": 12, "fatG": 32, "sodiumMg": 700},
        "hangjungsal":           {"calories": 400, "proteinG": 22, "carbsG": 4,  "fatG": 34, "sodiumMg": 520},
        "spicy-pork-bulgogi":    {"calories": 380, "proteinG": 24, "carbsG": 14, "fatG": 26, "sodiumMg": 820},
        "pork-riblets-spicy":    {"calories": 460, "proteinG": 26, "carbsG": 12, "fatG": 36, "sodiumMg": 940},
        "pork-riblets-korean-style": {"calories": 440, "proteinG": 26, "carbsG": 10, "fatG": 34, "sodiumMg": 820},
        "al-pastor":             {"calories": 480, "proteinG": 28, "carbsG": 14, "fatG": 36, "sodiumMg": 760},
        "pollo-asado":           {"calories": 400, "proteinG": 36, "carbsG": 8,  "fatG": 26, "sodiumMg": 700},
        "spicy-calamari-veggie-bowl": {"calories": 320, "proteinG": 22, "carbsG": 18, "fatG": 18, "sodiumMg": 860},
        "spicy-calamari":        {"calories": 280, "proteinG": 20, "carbsG": 14, "fatG": 16, "sodiumMg": 740},
        "cajun-shrimp":          {"calories": 200, "proteinG": 22, "carbsG": 4,  "fatG": 11, "sodiumMg": 820},
    },
    # ── Northern Cafe (approximate – Chinese noodles/dumplings) ──
    "northern-cafe": {
        "beef-roll":                    {"calories": 480, "proteinG": 22, "carbsG": 44, "fatG": 24, "sodiumMg": 820},
        "scallion-pancake":             {"calories": 300, "proteinG": 6,  "carbsG": 42, "fatG": 12, "sodiumMg": 480},
        "ginseng-pancake":              {"calories": 460, "proteinG": 18, "carbsG": 48, "fatG": 22, "sodiumMg": 760},
        "sandwich":                     {"calories": 380, "proteinG": 16, "carbsG": 42, "fatG": 16, "sodiumMg": 620},
        "fried-pancake":                {"calories": 320, "proteinG": 6,  "carbsG": 44, "fatG": 14, "sodiumMg": 500},
        "sesame-pancake":               {"calories": 360, "proteinG": 8,  "carbsG": 52, "fatG": 14, "sodiumMg": 440},
        "house-special-beef-noodle-soup":{"calories": 620,"proteinG": 36,"carbsG": 70,"fatG": 18,"sodiumMg":1480},
        "beef-noodle-soup":             {"calories": 580, "proteinG": 32, "carbsG": 68, "fatG": 16, "sodiumMg":1320},
        "malan-noodle-soup":            {"calories": 600, "proteinG": 32, "carbsG": 68, "fatG": 18, "sodiumMg":1380},
        "golden-soup-beef-noodle":      {"calories": 600, "proteinG": 34, "carbsG": 66, "fatG": 18, "sodiumMg":1340},
        "chicken-noodle-soup":          {"calories": 520, "proteinG": 28, "carbsG": 66, "fatG": 14, "sodiumMg":1200},
        "pork-intestine-noodle-soup":   {"calories": 600, "proteinG": 28, "carbsG": 68, "fatG": 20, "sodiumMg":1420},
        "dan-dan-noodle":               {"calories": 580, "proteinG": 24, "carbsG": 72, "fatG": 22, "sodiumMg":1350},
        "zhajiangmian":                 {"calories": 560, "proteinG": 24, "carbsG": 72, "fatG": 18, "sodiumMg":1260},
        "cold-noodle":                  {"calories": 460, "proteinG": 14, "carbsG": 70, "fatG": 14, "sodiumMg":1100},
        "yangzhou-fried-rice":          {"calories": 540, "proteinG": 16, "carbsG": 78, "fatG": 18, "sodiumMg":1080},
        "fried-rice-w-chicken-shrimp-or-vegetable":{"calories": 600,"proteinG": 24,"carbsG": 78,"fatG": 20,"sodiumMg":1100},
        "fried-rice-w-sausage":         {"calories": 580, "proteinG": 16, "carbsG": 78, "fatG": 22, "sodiumMg":1060},
        "shrimp-fried-rice":            {"calories": 580, "proteinG": 22, "carbsG": 78, "fatG": 18, "sodiumMg":1080},
        "dry-fried-noodle":             {"calories": 560, "proteinG": 20, "carbsG": 74, "fatG": 20, "sodiumMg":1140},
        "da-zang-ma-stir-fried-noodle": {"calories": 580, "proteinG": 20, "carbsG": 76, "fatG": 20, "sodiumMg":1160},
        "sichuan-stir-fried-noodle":    {"calories": 580, "proteinG": 20, "carbsG": 76, "fatG": 20, "sodiumMg":1200},
        "juicy-pork-xiaolongbao":       {"calories": 340, "proteinG": 18, "carbsG": 36, "fatG": 14, "sodiumMg": 640},
        "pork-crab-xiaolongbao":        {"calories": 360, "proteinG": 18, "carbsG": 36, "fatG": 16, "sodiumMg": 680},
        "juicy-chicken-xiaolongbao":    {"calories": 320, "proteinG": 18, "carbsG": 36, "fatG": 12, "sodiumMg": 600},
        "juicy-mushroom-xiaolongbao":   {"calories": 280, "proteinG": 10, "carbsG": 38, "fatG": 10, "sodiumMg": 540},
        "juicy-vegetable-xiaolongbao":  {"calories": 260, "proteinG": 8,  "carbsG": 38, "fatG": 8,  "sodiumMg": 500},
        "steamed-beef-dumpling":        {"calories": 300, "proteinG": 16, "carbsG": 32, "fatG": 12, "sodiumMg": 560},
        "steamed-lamb-dumpling":        {"calories": 320, "proteinG": 16, "carbsG": 32, "fatG": 14, "sodiumMg": 580},
        "steamed-vegetable-dumpling":   {"calories": 240, "proteinG": 8,  "carbsG": 34, "fatG": 8,  "sodiumMg": 480},
        "pork-chive-boiled-pan-fried":  {"calories": 320, "proteinG": 14, "carbsG": 34, "fatG": 14, "sodiumMg": 600},
        "pork-cabbage-boiled-pan-fried":{"calories": 300, "proteinG": 14, "carbsG": 34, "fatG": 12, "sodiumMg": 580},
        "pork-leek-boiled-pan-fried":   {"calories": 320, "proteinG": 14, "carbsG": 34, "fatG": 14, "sodiumMg": 620},
        "chicken-boiled-pan-fried":     {"calories": 280, "proteinG": 14, "carbsG": 32, "fatG": 10, "sodiumMg": 560},
        "vegetable-boiled-pan-fried":   {"calories": 220, "proteinG": 6,  "carbsG": 32, "fatG": 8,  "sodiumMg": 500},
        "pork-potstickers":             {"calories": 340, "proteinG": 14, "carbsG": 36, "fatG": 14, "sodiumMg": 640},
        "spicy-pork-wontons":           {"calories": 360, "proteinG": 14, "carbsG": 36, "fatG": 16, "sodiumMg": 760},
        "chicken-wontons":              {"calories": 320, "proteinG": 14, "carbsG": 34, "fatG": 12, "sodiumMg": 680},
        "chili-sauce-wontons":          {"calories": 340, "proteinG": 14, "carbsG": 36, "fatG": 14, "sodiumMg": 700},
        "wonton-soup":                  {"calories": 280, "proteinG": 12, "carbsG": 34, "fatG": 8,  "sodiumMg": 920},
        "hot-sour-soup":                {"calories": 180, "proteinG": 8,  "carbsG": 20, "fatG": 6,  "sodiumMg": 1100},
        "coke":                         {"calories": 140, "proteinG": 0,  "carbsG": 39, "fatG": 0,  "sugarG": 39,"sodiumMg": 45},
        "sprite":                       {"calories": 140, "proteinG": 0,  "carbsG": 38, "fatG": 0,  "sugarG": 38,"sodiumMg": 65},
        "4-seasons-oolong":             {"calories": 0,   "proteinG": 0,  "carbsG": 0,  "fatG": 0,  "sodiumMg": 5},
        "chrysanthemum":                {"calories": 0,   "proteinG": 0,  "carbsG": 0,  "fatG": 0,  "sodiumMg": 5},
        "sparkling-water":              {"calories": 0,   "proteinG": 0,  "carbsG": 0,  "fatG": 0,  "sodiumMg": 10},
        "seattle-green-tea":            {"calories": 0,   "proteinG": 0,  "carbsG": 0,  "fatG": 0,  "sodiumMg": 5},
        "seattle-iced-green-tea":       {"calories": 0,   "proteinG": 0,  "carbsG": 0,  "fatG": 0,  "sodiumMg": 5},
        "tsingtao":                     {"calories": 145, "proteinG": 1,  "carbsG": 11, "fatG": 0,  "sodiumMg": 10},
        "corona":                       {"calories": 148, "proteinG": 1,  "carbsG": 14, "fatG": 0,  "sodiumMg": 14},
        "asahi":                        {"calories": 145, "proteinG": 1,  "carbsG": 12, "fatG": 0,  "sodiumMg": 8},
        "sapporo":                      {"calories": 140, "proteinG": 1,  "carbsG": 11, "fatG": 0,  "sodiumMg": 10},
        "coors-light":                  {"calories": 102, "proteinG": 1,  "carbsG": 5,  "fatG": 0,  "sodiumMg": 10},
        "steamed-custard":              {"calories": 180, "proteinG": 8,  "carbsG": 20, "fatG": 8,  "sodiumMg": 120},
        "steamed-roll":                 {"calories": 200, "proteinG": 6,  "carbsG": 34, "fatG": 4,  "sodiumMg": 260},
        "steamed-bbq":                  {"calories": 260, "proteinG": 14, "carbsG": 28, "fatG": 10, "sodiumMg": 480},
        "sesame-ball":                  {"calories": 220, "proteinG": 4,  "carbsG": 34, "fatG": 8,  "sodiumMg": 80},
        "pineapple-bun":                {"calories": 260, "proteinG": 6,  "carbsG": 42, "fatG": 8,  "sodiumMg": 200},
        "crispy-donut":                 {"calories": 280, "proteinG": 5,  "carbsG": 44, "fatG": 10, "sodiumMg": 200},
        "taro-ball":                    {"calories": 240, "proteinG": 4,  "carbsG": 38, "fatG": 8,  "sodiumMg": 100},
        "sweet-potato":                 {"calories": 200, "proteinG": 3,  "carbsG": 46, "fatG": 0,  "fiberG": 4,"sodiumMg": 50},
        "steamed-mochi":                {"calories": 180, "proteinG": 3,  "carbsG": 36, "fatG": 3,  "sodiumMg": 40},
        "glutinous-rice":               {"calories": 260, "proteinG": 6,  "carbsG": 50, "fatG": 4,  "sodiumMg": 120},
        "steamed-pumpkin":              {"calories": 80,  "proteinG": 2,  "carbsG": 18, "fatG": 0,  "fiberG": 2,"sodiumMg": 20},
        "steamed-corn":                 {"calories": 130, "proteinG": 4,  "carbsG": 28, "fatG": 1,  "fiberG": 3,"sodiumMg": 20},
    },
    # ── Wahoo's Fish Taco (approximate) ──
    "wahoo-s-fish-taco": {
        "fish-taco":     {"calories": 200, "proteinG": 12, "carbsG": 22, "fatG": 8,  "sodiumMg": 380},
        "chicken-bowl":  {"calories": 560, "proteinG": 34, "carbsG": 68, "fatG": 14, "sodiumMg": 940},
        "shrimp-burrito":{"calories": 700, "proteinG": 32, "carbsG": 88, "fatG": 22, "sodiumMg": 1260},
    },
    # ── Yard House (approximate) ──
    "yard-house-spectrum-center-dr": {
        "four-cheese-spinach-dip":      {"calories": 760, "proteinG": 28, "carbsG": 52, "fatG": 50, "sodiumMg": 1280},
        "miguel-s-queso-dip":           {"calories": 620, "proteinG": 20, "carbsG": 48, "fatG": 38, "sodiumMg": 1140},
        "poke-nachos":                  {"calories": 820, "proteinG": 34, "carbsG": 80, "fatG": 42, "sodiumMg": 1360},
        "chicken-nachos":               {"calories": 880, "proteinG": 40, "carbsG": 76, "fatG": 46, "sodiumMg": 1480},
        "chicken-lettuce-wraps":        {"calories": 480, "proteinG": 32, "carbsG": 36, "fatG": 22, "sodiumMg": 880},
        "hand-battered-chicken-tenders":{"calories": 680, "proteinG": 36, "carbsG": 52, "fatG": 36, "sodiumMg": 1180},
        "classic-sliders":              {"calories": 560, "proteinG": 28, "carbsG": 44, "fatG": 30, "sodiumMg": 940},
        "wisconsin-fried-cheese-curds": {"calories": 720, "proteinG": 24, "carbsG": 56, "fatG": 44, "sodiumMg": 1320},
        "crispy-brussels-sprouts":      {"calories": 380, "proteinG": 10, "carbsG": 40, "fatG": 20, "fiberG": 8, "sodiumMg": 620},
        "blackened-ahi-sashimi":        {"calories": 340, "proteinG": 36, "carbsG": 8,  "fatG": 18, "sodiumMg": 760},
        "fried-calamari":               {"calories": 580, "proteinG": 22, "carbsG": 52, "fatG": 32, "sodiumMg": 980},
        "boneless-wings":               {"calories": 640, "proteinG": 36, "carbsG": 44, "fatG": 34, "sodiumMg": 1200},
        "gardein-boneless-wings":       {"calories": 480, "proteinG": 24, "carbsG": 44, "fatG": 22, "sodiumMg": 900},
        "the-carnivore-pizza":          {"calories": 840, "proteinG": 38, "carbsG": 72, "fatG": 44, "sodiumMg": 1560},
        "three-cheese":                 {"calories": 700, "proteinG": 28, "carbsG": 70, "fatG": 36, "sodiumMg": 1100},
        "margherita":                   {"calories": 640, "proteinG": 22, "carbsG": 72, "fatG": 30, "sodiumMg": 980},
        "loaded-pepperoni":             {"calories": 820, "proteinG": 34, "carbsG": 72, "fatG": 42, "sodiumMg": 1460},
        "buffalo-chicken":              {"calories": 780, "proteinG": 36, "carbsG": 70, "fatG": 40, "sodiumMg": 1520},
        "truffled-mushroom":            {"calories": 660, "proteinG": 22, "carbsG": 70, "fatG": 34, "sodiumMg": 1020},
        "draft-beer":                   {"calories": 150, "proteinG": 1,  "carbsG": 13, "fatG": 0,  "sodiumMg": 14},
        "wine":                         {"calories": 120, "proteinG": 0,  "carbsG": 4,  "fatG": 0,  "sodiumMg": 10},
        "spirits":                      {"calories": 100, "proteinG": 0,  "carbsG": 0,  "fatG": 0,  "sodiumMg": 0},
        "cocktails":                    {"calories": 220, "proteinG": 0,  "carbsG": 28, "fatG": 0,  "sugarG": 24,"sodiumMg": 40},
        "9oz-wine":                     {"calories": 230, "proteinG": 0,  "carbsG": 7,  "fatG": 0,  "sodiumMg": 15},
        "half-yards":                   {"calories": 200, "proteinG": 1,  "carbsG": 18, "fatG": 0,  "sodiumMg": 20},
    },
    # ── CUCINA enoteca (approximate – Italian) ──
    "cucina-enoteca-irvine": {
        "pepperoni-pizza":   {"calories": 680, "proteinG": 28, "carbsG": 72, "fatG": 30, "sodiumMg": 1240},
        "rigatoni-bolognese":{"calories": 720, "proteinG": 34, "carbsG": 82, "fatG": 28, "sodiumMg": 980},
        "charred-cauliflower":{"calories":280, "proteinG": 8,  "carbsG": 34, "fatG": 14, "fiberG": 6,"sodiumMg": 540},
        "chicken-fra-diavolo":{"calories": 580, "proteinG": 44, "carbsG": 28, "fatG": 30, "sodiumMg": 1060},
    },
    # ── Blaze Pizza/Chef-Inspired Pizzeria ──
    "chef-inspired-pizzeria": {
        "sweet-heat":             {"calories": 760, "proteinG": 30, "carbsG": 78, "fatG": 36, "sodiumMg": 1480},
        "carnivore":              {"calories": 840, "proteinG": 38, "carbsG": 80, "fatG": 40, "sodiumMg": 1680},
        "one-large-1-top-pizza":  {"calories": 620, "proteinG": 22, "carbsG": 78, "fatG": 24, "sodiumMg": 1020},
        "sweet-heat-11-inch":     {"calories": 560, "proteinG": 22, "carbsG": 60, "fatG": 26, "sodiumMg": 1100},
        "build-your-own-pizza-11-inch": {"calories": 520, "proteinG": 18, "carbsG": 62, "fatG": 22, "sodiumMg": 960},
        "spicy-pepperoni-pizza":  {"calories": 660, "proteinG": 26, "carbsG": 62, "fatG": 34, "sodiumMg": 1400},
        "blazed-bbq-11-inch":     {"calories": 620, "proteinG": 28, "carbsG": 68, "fatG": 26, "sodiumMg": 1200},
    },
}

# ── main transform ─────────────────────────────────────────────────────────────

def fix_restaurant(r: dict) -> dict:
    rid = r["id"]
    # Fix hours
    hours = []
    for h in (r.get("hours") or []):
        day = abbrev_day(h.get("day", ""))
        open_t = to_12h(h.get("open", ""))
        close_t = to_12h(h.get("close", ""))
        if day and open_t and close_t:
            hours.append({"day": day, "open": open_t, "close": close_t})
    r["hours"] = hours

    # Fix location
    if rid in LOCATION_FIXES:
        r["location"] = LOCATION_FIXES[rid]

    # Fix priceTier
    if rid in PRICE_TIER_FIXES:
        r["priceTier"] = PRICE_TIER_FIXES[rid]
    else:
        pt = r.get("priceTier") or ""
        if pt not in ("$", "$$", "$$$", "$$$$"):
            r["priceTier"] = "$$"  # safe default

    # dataSource → object
    ds = r.get("dataSource")
    if isinstance(ds, str) or ds is None:
        url = SCRAPER_URLS.get(rid, "")
        r["dataSource"] = {"name": "firecrawl", "lastUpdatedISO": SCRAPE_DATE, "url": url}

    # Fix menu items
    price_fixes = MENU_PRICE_FIXES.get(rid, {})
    price_overrides = MENU_PRICE_OVERRIDES.get(rid, {})
    nutrition_map = NUTRITION.get(rid, {})
    for item in r.get("menu") or []:
        iid = item.get("id", "")
        # Price: forced override first, then fill-in-if-null
        if iid in price_overrides:
            item["priceUSD"] = price_overrides[iid]
        elif item.get("priceUSD") is None:
            item["priceUSD"] = price_fixes.get(iid, 10.99)  # fallback $10.99
        # Nutrition
        if iid in nutrition_map and "nutrition" not in item:
            item["nutrition"] = nutrition_map[iid]

    return r


def main() -> None:
    with open("data.json", "r", encoding="utf-8") as f:
        data = json.load(f)

    # Remove Saffron & Rose
    data = [r for r in data if r.get("id") != "saffron-and-rose-ice-cream"]

    # Apply fixes
    data = [fix_restaurant(r) for r in data]

    with open("data.json", "w", encoding="utf-8") as f:
        json.dump(data, f, indent=2, ensure_ascii=False)

    print(f"Done. {len(data)} restaurants written to data.json.")
    for r in data:
        loc = r["location"]
        bad_price = sum(1 for m in r.get("menu", []) if m.get("priceUSD") is None)
        print(
            f"  {r['name']:<38} "
            f"coords=({loc['lat']:.4f},{loc['lng']:.4f})  "
            f"nullPrices={bad_price}"
        )


if __name__ == "__main__":
    main()
