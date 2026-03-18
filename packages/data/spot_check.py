import json

with open("data.json", encoding="utf-8") as f:
    data = json.load(f)

checks = ["luna-grill", "in-n-out-burger", "cucina-enoteca-irvine", "northern-cafe", "gen-korean-bbq"]
for rid in checks:
    r = next(x for x in data if x["id"] == rid)
    loc = r["location"]
    first_item = r["menu"][0]
    print(f"--- {r['name']} ---")
    print(f"  priceTier: {r['priceTier']}")
    print(f"  location: {loc['address']}, {loc['city']} ({loc['lat']},{loc['lng']})")
    print(f"  hours[0]: {r['hours'][0]}")
    print(f"  dataSource: {r['dataSource']}")
    print(f"  first item: {first_item['name']!r}  price={first_item['priceUSD']}  nutrition={first_item.get('nutrition')}")
    print()
