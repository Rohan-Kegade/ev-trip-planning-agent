"""Quick checks for intent.py. Run: python test_intent.py"""

from intent import (
    CHANGE_OPTIONS, MAPS_OFFER_OPTIONS, PLAN_OFFER_OPTIONS, ROUTE_CONFIRM_OPTIONS, SEARCH_OFFER_OPTIONS, TRIP_CONFIRM_OPTIONS,
    TRIP_DONE_OPTIONS, TRIP_TYPE_OPTIONS,
    is_bare_trip_change, quick_change_target, quick_trip_type, quick_vehicle_state, quick_yes_no, wants_change,
)


def check(name, cond):
    print(("PASS" if cond else "FAIL"), name)
    assert cond, name


# -- clear yes --
for text in ["yes", "Yes!", "yes that's correct", "yes, go ahead", "yes please search", "yes, give me the plan",
             "ok", "sure", "Sounds good", "go ahead", "correct", "yep, looks good"]:
    check(f"yes: {text!r}", quick_yes_no(text) is True)

# -- clear no --
for text in ["no", "No thanks", "nope", "not now", "no, don't search", "cancel"]:
    check(f"no: {text!r}", quick_yes_no(text) is False)

# -- anything else falls back to the LLM --
for text in [
    "yes but change the destination to Nashik",
    "no, make it a round trip",
    "yes but not today",
    "is that right?",
    "Pune",
    "I want to drive from Pune to Mumbai",
    "what about charging at Lonavala",
    "",
]:
    check(f"llm: {text!r}", quick_yes_no(text) is None)

# -- vehicle state --
check("battery and range", quick_vehicle_state("battery is 20% and range is about 50 km") == (20, 50))
check("range first, words", quick_vehicle_state("120 kms left, 45 percent") == (45, 120))
check("kilometres spelled out", quick_vehicle_state("80% battery, 300 kilometres") == (80, 300))
check("only battery", quick_vehicle_state("battery is at 20%") == (20, None))
check("only range", quick_vehicle_state("I can do 50 km") == (None, 50))
check("two ranges -> llm", quick_vehicle_state("20%, maybe 50 km or 60 km") is None)
check("two batteries -> llm", quick_vehicle_state("20% or 30%") is None)
check("impossible battery -> llm", quick_vehicle_state("150% and 50 km") is None)
check("no numbers -> llm", quick_vehicle_state("about a quarter charge") is None)

# -- trip type --
check("one way", quick_trip_type("one way") is False)
check("One-way.", quick_trip_type("One-way.") is False)
check("round trip", quick_trip_type("Round trip") is True)
check("there and back", quick_trip_type("there and back") is True)
check("longer message -> llm", quick_trip_type("one way, but from Nashik") is None)
check("place -> llm", quick_trip_type("Mumbai") is None)

# -- every option the UI offers is handled without the LLM, with the intended meaning --
check("options: trip type", [quick_trip_type(label) for label, _ in TRIP_TYPE_OPTIONS] == [False, True])
for options in (TRIP_CONFIRM_OPTIONS, ROUTE_CONFIRM_OPTIONS, SEARCH_OFFER_OPTIONS, PLAN_OFFER_OPTIONS, MAPS_OFFER_OPTIONS):
    labels = [label for label, _ in options]
    check(f"options: {labels}", [quick_yes_no(label) for label in labels] == [True, False])

# -- what the battery/range card sends --
check("card: both", quick_vehicle_state("Battery 20%, range 50 km") == (20, 50))
check("card: range only", quick_vehicle_state("Range 120 km") == (None, 120))

# -- "change" means no, but a change request with details still goes to the LLM --
check("change -> no", quick_yes_no("change it") is False)
check("yes, change -> llm", quick_yes_no("yes, change the time") is None)
check("change to place -> llm", quick_yes_no("change destination to Nashik") is None)

# -- changing a finished plan --
check("options: change targets", [quick_change_target(label) for label, _ in CHANGE_OPTIONS] == ["vehicle", "trip"])
check("options: make changes is a change request", wants_change(TRIP_DONE_OPTIONS[0][0]) and quick_change_target(TRIP_DONE_OPTIONS[0][0]) is None)
check("change battery", quick_change_target("change my battery to 80%") == "vehicle")
check("new range", quick_change_target("range is 200 km now") == "vehicle")
check("change destination", quick_change_target("change destination to Nashik") == "trip")
check("make it one way", quick_change_target("make it one way") == "trip")
check("both -> unclear", quick_change_target("change the trip and the battery") is None)
check("plan question is not a change", not wants_change("how long will I charge at the first stop?"))
check("bare trip change", is_bare_trip_change("The trip") and is_bare_trip_change("change the trip"))
check("specific trip change", not is_bare_trip_change("change destination to Nashik"))
