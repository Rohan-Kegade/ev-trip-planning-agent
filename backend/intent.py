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
NO_WORDS = {"no", "nope", "nah", "n", "not", "dont", "don't", "cancel", "stop", "wrong", "incorrect", "never", "later"}

# Words that carry no decision on their own ("yes, please go ahead with the plan")
FILLER_WORDS = {
    "please", "pls", "plz", "thanks", "thank", "you", "do", "it", "that", "that's", "thats", "is", "its", "it's",
    "this", "all", "looks", "sounds", "the", "a", "me", "give", "show", "search", "find", "stations",
    "plan", "charging", "now", "and", "for", "with", "let's", "lets", "of", "course", "need", "want",
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


PERCENT = re.compile(r"(\d{1,3})\s*(?:%|percent\b)")
KILOMETRES = re.compile(r"(\d{1,4})\s*(?:km|kms|kilomet(?:er|re)s?)\b")


def quick_vehicle_state(text: str) -> tuple[int, int] | None:
    """(battery %, range km) when the message states exactly one of each, else None."""
    text = text.lower()
    percents = PERCENT.findall(text)
    kms = KILOMETRES.findall(text)

    if len(percents) != 1 or len(kms) != 1:
        return None

    battery, range_km = int(percents[0]), int(kms[0])
    if battery > 100:
        return None
    return battery, range_km
