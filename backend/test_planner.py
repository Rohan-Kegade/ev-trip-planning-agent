"""Quick checks for planner.py. Run: python test_planner.py"""

from planner import build_charging_plan, format_plan_message, haversine_km, locate_stations

DEG_PER_KM = 1 / 111.195  # along a meridian


def straight_route(km):
    return [(19.0 + i * DEG_PER_KM, 73.0) for i in range(int(km) + 1)]


def station(id, km, off_km=0.0):
    return {
        "id": id,
        "name": f"Station {id}",
        "town": "Town",
        "latitude": 19.0 + km * DEG_PER_KM,
        "longitude": 73.0 + off_km * DEG_PER_KM,
    }


def check(name, cond):
    print(("PASS" if cond else "FAIL"), name)
    assert cond, name


route = straight_route(300)

# -- locate: position and detour are recovered, far stations dropped --
located = locate_stations(route, [station(1, 100, 2.0), station(2, 150, 9.0)], 300)
check("far station dropped", len(located) == 1)
check("position along route", abs(located[0]["route_km"] - 100) < 1)
check("detour measured", abs(located[0]["detour_km"] - 2.0) < 0.3)

# -- one way: 300 km, 20% battery = 80 km -> full range 400 km, reserve 40, target 320 --
stations = [station(1, 20), station(2, 35), station(3, 200), station(4, 260)]
plan = build_charging_plan(route, stations, 300, 300, False, 80, 20)
print(format_plan_message(plan), "\n")
check("feasible", plan["feasible"])
check("first stop is furthest reachable (80-40=40 km usable -> km 35, not 20)", plan["stops"][0]["km"] == 35.0)
check("stops strictly increase", [s["km"] for s in plan["stops"]] == sorted(s["km"] for s in plan["stops"]))
check("arrival >= reserve (10%)", plan["arrival_soc"] >= 10)
check("time adds up", plan["total_minutes"] == plan["drive_minutes"] + plan["charge_minutes"])

# -- gap: no station within reach --
plan = build_charging_plan(route, [station(1, 250)], 300, 300, False, 80, 20)
print(format_plan_message(plan), "\n")
check("infeasible with a gap", (not plan["feasible"]) and plan["gap"]["from_km"] == 0)

# -- round trip: 600 km total, return-leg stops appear --
stations = [station(i, km) for i, km in enumerate(range(40, 300, 60), 1)]
plan = build_charging_plan(route, stations, 300, 600, True, 200, 50)
print(format_plan_message(plan), "\n")
check("round trip feasible", plan["feasible"])
check("total km doubled", plan["total_km"] == 600)
check("has a return-leg stop", any(s["leg"] == "return" for s in plan["stops"]))

# -- range already sufficient: no stops --
plan = build_charging_plan(route, stations, 300, 300, False, 390, 100)
check("no stops when range is enough", plan["feasible"] and plan["stops"] == [])

# -- missing percentage falls back to conservative full range --
plan = build_charging_plan(route, stations, 300, 300, False, 80, None)
check("fallback does not crash", isinstance(plan["feasible"], bool))

# -- detour costs range --
with_detour = build_charging_plan(route, [station(1, 30, 4.0)], 300, 300, False, 80, 20)
no_detour = build_charging_plan(route, [station(1, 30, 0.0)], 300, 300, False, 80, 20)
check("detour counted in arrival", with_detour["stops"][0]["arrival_soc"] < no_detour["stops"][0]["arrival_soc"])

print("\nall planner checks passed")


# -- fast nearest-point search agrees with brute force on a winding, dense route --
import math
import random

from planner import cumulative_distances, sample_route

random.seed(7)
winding = [(19.0 + i * 0.05 * DEG_PER_KM, 73.0 + 0.02 * math.sin(i / 300)) for i in range(6001)]
cum = cumulative_distances(winding)
scale = 300 / cum[-1]
cos_lat = math.cos(math.radians(winding[3000][0]))
many = [
    {"id": i, "name": "S", "latitude": 19.0 + random.uniform(0, 2.7), "longitude": 73.0 + random.uniform(-0.03, 0.03)}
    for i in range(200)
]
fast = {s["id"]: s for s in locate_stations(winding, many, 300)}
worst = 0.0
for s in many:
    if s["id"] not in fast:
        continue
    best = min(range(len(winding)), key=lambda i: (winding[i][0] - s["latitude"]) ** 2 + ((winding[i][1] - s["longitude"]) * cos_lat) ** 2)
    worst = max(worst, abs(cum[best] * scale - fast[s["id"]]["route_km"]))
check(f"fast locate matches brute force (worst diff {worst:.3f} km)", worst < 0.2)

# -- sampling is by distance: few points, evenly spaced, ends included --
sampled = sample_route(winding, 8)
check(f"sampling thins 6001 points to {len(sampled)}", 30 <= len(sampled) <= 45)
check("sampling keeps first and last", sampled[0] == winding[0] and sampled[-1] == winding[-1])
gaps = [haversine_km(a, b) for a, b in zip(sampled, sampled[1:-1])]
check("sample gaps are close to 8 km", all(7.5 <= g <= 8.5 for g in gaps))

print("\nall speed-related checks passed")
