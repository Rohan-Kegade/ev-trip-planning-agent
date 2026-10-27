"""Rule-based fast paths for clear-cut user replies, so they skip an LLM call.

Each parser returns None when the message is not clearly covered, and the caller
falls back to the LLM. They are deliberately strict: a wrong guess is worse than
a slower answer.
"""

import re

YES_WORDS = {
    "yes", "yeah", "yea", "yep", "yup", "ya", "y", "sure", "ok", "okay", "okk", "k",
    "correct", "right", "perfect", "great", "fine", "absolutely", "definitely",
    "confirm", "confirmed", "proceed", "continue", "go", "ahead", "good",
}
NO_WORDS = {
    "no", "nope", "nah", "n", "not", "dont", "don't", "cancel", "stop", "wrong", "incorrect", "never", "later", "change",
}

# Words that carry no decision on their own ("yes, please go ahead with the plan")
FILLER_WORDS = {
    "please", "pls", "plz", "thanks", "thank", "you", "do", "it", "that", "that's", "thats", "is", "its", "it's",
    "this", "all", "looks", "sounds", "the", "a", "me", "give", "show", "search", "find", "stations",
    "plan", "charging", "now", "and", "for", "with", "let's", "lets", "of", "course", "need", "want",
    "something", "trip", "open", "in", "google", "maps", "map", "route",
}


def quick_yes_no(text: str) -> bool | None:
    """True/False for a plain yes or no ("yes, go ahead", "no thanks"), else None."""
    if "?" in text:
        return None

    words = re.findall(r"[a-z']+", text.lower())
    if not words or len(words) > 8:
        return None

    has_yes = any(w in YES_WORDS for w in words)
    has_no = any(w in NO_WORDS for w in words)
    only_known = all(w in YES_WORDS or w in NO_WORDS or w in FILLER_WORDS for w in words)

    # Mixed ("yes but not today") or anything else (a place name, a change request) goes to the LLM
    if not only_known or has_yes == has_no:
        return None
    return has_yes


ONE_WAY_PHRASES = {"one way", "oneway", "one way trip", "just one way", "single", "one way only"}
ROUND_TRIP_PHRASES = {"round trip", "roundtrip", "return", "return trip", "round", "both ways", "there and back"}


def quick_trip_type(text: str) -> bool | None:
    """True for "round trip", False for "one way", None for anything longer or different."""
    phrase = " ".join(re.findall(r"[a-z]+", text.lower()))
    if phrase in ROUND_TRIP_PHRASES:
        return True
    if phrase in ONE_WAY_PHRASES:
        return False
    return None


PERCENT = re.compile(r"(\d{1,3})\s*(?:%|percent\b)")
KILOMETRES = re.compile(r"(\d{1,4})\s*(?:km|kms|kilomet(?:er|re)s?)\b")


def quick_vehicle_state(text: str) -> tuple[int | None, int | None] | None:
    """(battery %, range km) from a message like "20% and 50 km"; either may be None if not mentioned.

    None when nothing is stated, or when a value is ambiguous (two percentages, a battery over 100%).
    """
    text = text.lower()
    percents = PERCENT.findall(text)
    kms = KILOMETRES.findall(text)

    if len(percents) > 1 or len(kms) > 1 or not (percents or kms):
        return None

    battery = int(percents[0]) if percents else None
    range_km = int(kms[0]) if kms else None
    if battery is not None and battery > 100:
        return None
    return battery, range_km


VEHICLE_WORDS = {"battery", "range", "charge", "charging", "soc", "km", "kms", "percent"}
TRIP_WORDS = {"trip", "origin", "destination", "start", "starting", "route", "round", "way", "city", "place"}
CHANGE_WORDS = {"change", "changes", "update", "edit", "modify", "different", "adjust"}
# A request to change the trip that says nothing about what to change ("change the trip")
BARE_TRIP_CHANGE_WORDS = CHANGE_WORDS | {"the", "trip", "my", "i", "want", "to", "make", "plan", "details", "please", "a", "something"}


def words_in(text: str) -> list[str]:
    return re.findall(r"[a-z%]+", text.lower())


def quick_change_target(text: str) -> str | None:
    """"vehicle" or "trip" for what the user wants to change, None if unclear or both."""
    words = set(words_in(text))
    vehicle = bool(words & VEHICLE_WORDS) or "%" in text or quick_vehicle_state(text) is not None
    trip = bool(words & TRIP_WORDS)
    if vehicle == trip:
        return None
    return "vehicle" if vehicle else "trip"


def wants_change(text: str) -> bool:
    return bool(set(words_in(text)) & CHANGE_WORDS)


def is_bare_trip_change(text: str) -> bool:
    words = words_in(text)
    return bool(words) and all(w in BARE_TRIP_CHANGE_WORDS for w in words)


# Answer options the UI offers at each step, as (label, description). The label is sent as the
# user's message, so each is worded for the parsers above to handle without the LLM.
TRIP_TYPE_OPTIONS = [
    ("One way", "Just getting there"),
    ("Round trip", "There and back on the same route"),
]
TRIP_CONFIRM_OPTIONS = [
    ("Yes, that's correct", "Work out the route, distance and travel time"),
    ("No, change something", "Edit the origin, destination or trip type"),
]
ROUTE_CONFIRM_OPTIONS = [
    ("Yes, go ahead", "Check your battery and charging needs"),
    ("No, change the trip", "Pick a different origin or destination"),
]
SEARCH_OFFER_OPTIONS = [
    ("Yes, search for stations", "Find chargers along your route"),
    ("No thanks", "Skip the search for now"),
]
PLAN_OFFER_OPTIONS = [
    ("Yes, give me the plan", "Where to stop, how long to charge and total time"),
    ("No thanks", "You can ask for it later"),
]
MAPS_OFFER_OPTIONS = [
    ("Yes, open in Google Maps", "Get a directions link with the charging stops"),
    ("No thanks", "Skip the map"),
]
# Shown once the trip is planned. The third item is a UI action: the UI handles those itself
# instead of sending the label as a message.
TRIP_DONE_OPTIONS = [
    ("Make changes to the plan", "Update your battery, range or the trip", None),
    ("Plan a new trip", "Start a new chat", "new_trip"),
    ("End chat", "Close this chat", "end_chat"),
]
CHANGE_OPTIONS = [
    ("Battery or range", "Update your current charge"),
    ("The trip", "Change the origin, destination or trip type"),
]
