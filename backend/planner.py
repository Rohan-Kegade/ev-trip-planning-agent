"""Charging plan logic for EVPilot.

Pure functions only (no LLM, no network) so the plan is deterministic and easy to test.
"""

import math

# ---- Planning assumptions ----
RESERVE_FRACTION = 0.10         # never plan to arrive with less than 10% of full range
CHARGE_TARGET_FRACTION = 0.80   # charge to 80% (fast charging slows down above that)
MAX_DETOUR_KM = 5.0             # ignore stations further than this from the route
FULL_CHARGE_MINUTES = 48        # approx. time for 0-100% on a ~50 kW charger (~40 kWh pack)
MAX_STOPS = 20                  # safety cap on the greedy loop
MIN_PROGRESS_KM = 0.5           # each stop must be at least this far ahead of the last one
COARSE_STEP_KM = 0.5            # spacing of route points used for the first, cheap nearest-point pass

EARTH_RADIUS_KM = 6371.0088


def haversine_km(a, b):
    lat1, lon1 = math.radians(a[0]), math.radians(a[1])
    lat2, lon2 = math.radians(b[0]), math.radians(b[1])
    h = math.sin((lat2 - lat1) / 2) ** 2 + math.cos(lat1) * math.cos(lat2) * math.sin((lon2 - lon1) / 2) ** 2
    return 2 * EARTH_RADIUS_KM * math.asin(math.sqrt(h))


def cumulative_distances(points):
    """Distance in km from the first point to each point along the polyline."""
    cumulative = [0.0]
    for previous, current in zip(points, points[1:]):
        cumulative.append(cumulative[-1] + haversine_km(previous, current))
    return cumulative


def sample_route(points, spacing_km):
    """Points roughly every spacing_km along the route, always including the first and last."""
    if not points:
        return []

    cumulative = cumulative_distances(points)
    sampled = [points[0]]
    next_at = spacing_km

    for point, distance in zip(points, cumulative):
        if distance >= next_at:
            sampled.append(point)
            next_at = distance + spacing_km

    if sampled[-1] != points[-1]:
        sampled.append(points[-1])

    return sampled


def format_duration(minutes):
    """Whole minutes as text, e.g. '2 hours 35 minutes', '1 hour', '45 minutes'."""
    total = round(minutes)
    hours, mins = divmod(total, 60)
    parts = []
    if hours:
        parts.append(f"{hours} hour{'s' if hours != 1 else ''}")
    if mins or not hours:
        parts.append(f"{mins} minute{'s' if mins != 1 else ''}")
    return " ".join(parts)


def locate_stations(points, stations, one_way_km, max_detour_km=MAX_DETOUR_KM):
    """Project stations onto the route: distance from start along the route, and detour off it."""
    if len(points) < 2:
        return []

    cumulative = cumulative_distances(points)
    polyline_km = cumulative[-1]
    if polyline_km <= 0:
        return []

    # Scale so positions agree with the routing service's total distance
    scale = one_way_km / polyline_km
    cos_lat = math.cos(math.radians(points[len(points) // 2][0]))

    # Route points come very densely spaced, so search a thinned copy first, then refine locally
    coarse = [0]
    last_km = 0.0
    for i, km in enumerate(cumulative):
        if km - last_km >= COARSE_STEP_KM:
            coarse.append(i)
            last_km = km
    if coarse[-1] != len(points) - 1:
        coarse.append(len(points) - 1)

    def flat_distance_sq(i, lat, lon):
        return (points[i][0] - lat) ** 2 + ((points[i][1] - lon) * cos_lat) ** 2

    located = []
    for station in stations:
        lat, lon = station.get("latitude"), station.get("longitude")
        if lat is None or lon is None:
            continue

        # Cheap flat-earth distance to find the nearest route point, exact distance afterwards
        k = min(range(len(coarse)), key=lambda c: flat_distance_sq(coarse[c], lat, lon))
        window = range(coarse[max(k - 1, 0)], coarse[min(k + 1, len(coarse) - 1)] + 1)
        nearest = min(window, key=lambda i: flat_distance_sq(i, lat, lon))
        detour = haversine_km(points[nearest], (lat, lon))
        if detour > max_detour_km:
            continue

        located.append({**station, "route_km": cumulative[nearest] * scale, "detour_km": detour})

    return sorted(located, key=lambda s: s["route_km"])


def build_charging_plan(points, stations, one_way_km, drive_minutes, is_round_trip, range_left_km, battery_soc):
    """Greedy plan: always drive to the furthest station reachable while keeping the safety reserve."""
    multiplier = 2 if is_round_trip else 1
    total_km = one_way_km * multiplier

    # Full range from what the user told us: 20% battery and 80 km left -> 400 km at 100%.
    # If the percentage is missing, assume the stated range is the full range (conservative).
    if battery_soc is not None and 0 < battery_soc <= 100:
        full_range = range_left_km / (battery_soc / 100)
    else:
        full_range = range_left_km
    full_range = max(full_range, range_left_km, 1.0)

    reserve = RESERVE_FRACTION * full_range
    target_range = CHARGE_TARGET_FRACTION * full_range

    located = locate_stations(points, stations, one_way_km)

    # Candidates along the trip; on a round trip the same road is driven again in reverse
    candidates = [{**s, "km": s["route_km"], "leg": "outbound"} for s in located]
    if is_round_trip:
        candidates += [{**s, "km": total_km - s["route_km"], "leg": "return"} for s in located]
    candidates.sort(key=lambda s: s["km"])

    stops = []
    position = 0.0
    current_range = range_left_km
    gap = None
    feasible = True

    while current_range - (total_km - position) < reserve:
        reachable = [
            s for s in candidates
            if s["km"] > position + MIN_PROGRESS_KM
            and current_range - (s["km"] - position) - s["detour_km"] >= reserve
        ]

        if not reachable or len(stops) >= MAX_STOPS:
            feasible = False
            gap = {"from_km": round(position, 1), "to_km": round(position + max(current_range - reserve, 0), 1)}
            break

        # Furthest first; prefer the smaller detour on a tie
        station = max(reachable, key=lambda s: (round(s["km"], 1), -s["detour_km"]))

        arrival_range = current_range - (station["km"] - position) - station["detour_km"]
        new_range = max(arrival_range, target_range)
        charge_minutes = (new_range - arrival_range) / full_range * FULL_CHARGE_MINUTES

        stops.append({
            "id": station.get("id"),
            "name": station.get("name"),
            "town": station.get("town"),
            "km": round(station["km"], 1),
            "detour_km": round(station["detour_km"], 1),
            "leg": station["leg"],
            "arrival_soc": round(arrival_range / full_range * 100),
            "charge_to": round(new_range / full_range * 100),
            "charge_minutes": round(charge_minutes),
        })

        # Leave the station and rejoin the route (the detour costs range again)
        current_range = new_range - station["detour_km"]
        position = station["km"]

    arrival_soc = None
    if feasible:
        arrival_soc = max(0, round((current_range - (total_km - position)) / full_range * 100))

    charge_minutes_total = sum(s["charge_minutes"] for s in stops)

    return {
        "feasible": feasible,
        "round_trip": bool(is_round_trip),
        "stops": stops,
        "gap": gap,
        "arrival_soc": arrival_soc,
        "total_km": round(total_km, 1),
        "drive_minutes": round(drive_minutes),
        "charge_minutes": charge_minutes_total,
        "total_minutes": round(drive_minutes) + charge_minutes_total,
    }


def format_plan_message(plan):
    """Chat message for a plan. Built in code so every number shown to the user is exact."""
    stops = plan["stops"]
    lines = []

    if plan["feasible"]:
        kind = "round trip" if plan["round_trip"] else "trip"
        lines.append(
            f"Here is your charging plan for the {kind} ({plan['total_km']:g} km): "
            f"{len(stops)} charging stop{'s' if len(stops) != 1 else ''}."
        )
    else:
        lines.append("I could not build a complete charging plan for this trip.")
        if stops:
            lines.append("Here are the stops I could plan before the problem:")

    for number, stop in enumerate(stops, 1):
        place = stop["name"] or "Charging station"
        if stop["town"]:
            place += f", {stop['town']}"
        leg = f" ({stop['leg']} leg)" if plan["round_trip"] else ""
        detour = f", {stop['detour_km']:g} km off the route" if stop["detour_km"] >= 0.5 else ""
        lines.append(f"{number}. {place} at km {stop['km']:g}{leg}{detour}")
        lines.append(
            f"   Arrive with about {stop['arrival_soc']:g}%, charge to {stop['charge_to']:g}% "
            f"(about {format_duration(stop['charge_minutes'])})"
        )

    if plan["feasible"]:
        lines.append(f"You will finish the trip with about {plan['arrival_soc']:g}% battery.")
        lines.append(
            f"Estimated total time: {format_duration(plan['total_minutes'])} "
            f"({format_duration(plan['drive_minutes'])} driving + {format_duration(plan['charge_minutes'])} charging)."
        )
        lines.append("Charging times assume a fast charger of about 50 kW and are approximate.")
    else:
        gap = plan["gap"]
        lines.append(
            f"There are no charging stations I can reach between km {gap['from_km']:g} and km {gap['to_km']:g} "
            "while keeping a safety reserve. You could charge more before you leave, or consider a different route."
        )

    return "\n".join(lines)
