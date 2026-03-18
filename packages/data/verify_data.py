import json

with open("data.json", encoding="utf-8") as f:
    data = json.load(f)

issues = []
valid_tiers = {"$", "$$", "$$$", "$$$$"}

for r in data:
    rid = r["id"]
    loc = r["location"]
    if loc["lat"] == 0 or loc["lng"] == 0:
        issues.append(f"{rid}: ZERO COORDS")
    bad_kw = [
        "not provided", "not specified", "sample city", "sushi city",
        "pizza town", "seoul", "12345 main", "12345 w 4th",
        "1234 food", "1234 main", "1234 ice", "location not specified",
    ]
    addr_lower = (loc.get("address", "") + " " + loc.get("city", "")).lower()
    if any(k in addr_lower for k in bad_kw):
        issues.append(f"{rid}: FAKE LOC city={loc.get('city')}")
    null_p = [m["id"] for m in r.get("menu", []) if m.get("priceUSD") is None]
    if null_p:
        issues.append(f"{rid}: NULL PRICE items={null_p}")
    pt = r.get("priceTier", "")
    if pt not in valid_tiers:
        issues.append(f"{rid}: BAD priceTier {pt!r}")
    ds = r.get("dataSource")
    if not isinstance(ds, dict):
        issues.append(f"{rid}: dataSource not object, got {ds!r}")
    for h in r.get("hours", []):
        if len(h.get("day", "")) > 3:
            issues.append(f"{rid}: long day={h['day']!r}")
            break

print(f"Restaurants: {len(data)}")
print(f"Issues: {len(issues)}")
for i in issues:
    print("  ", i)
if not issues:
    print("ALL CHECKS PASSED")

# Summary stats
total_items = sum(len(r.get("menu", [])) for r in data)
items_with_nutrition = sum(
    1 for r in data for m in r.get("menu", []) if "nutrition" in m
)
print(f"\nTotal menu items: {total_items}")
print(f"Items with nutrition: {items_with_nutrition}")
print(f"Coverage: {items_with_nutrition/total_items*100:.1f}%")
