"""Quick checks for intent.py. Run: python test_intent.py"""

from intent import quick_vehicle_state, quick_yes_no


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
check("only battery -> llm", quick_vehicle_state("battery is at 20%") is None)
check("only range -> llm", quick_vehicle_state("I can do 50 km") is None)
check("two ranges -> llm", quick_vehicle_state("20%, maybe 50 km or 60 km") is None)
check("impossible battery -> llm", quick_vehicle_state("150% and 50 km") is None)
check("no numbers -> llm", quick_vehicle_state("about a quarter charge") is None)
