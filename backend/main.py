from langchain_google_genai import ChatGoogleGenerativeAI
from dotenv import load_dotenv
from typing import TypedDict, Literal, Annotated
from langgraph.graph.message import add_messages
from pydantic import BaseModel, Field
from langgraph.graph import StateGraph, START, END
from langchain_core.messages import HumanMessage, AIMessage
import os
import requests
import polyline
from concurrent.futures import ThreadPoolExecutor
from planner import build_charging_plan, format_duration, format_plan_message, google_maps_url, sample_route
from intent import (
    MAPS_OFFER_OPTIONS, PLAN_FOLLOWUP_OPTIONS, PLAN_OFFER_OPTIONS, ROUTE_CONFIRM_OPTIONS, SEARCH_OFFER_OPTIONS,
    TRIP_CONFIRM_OPTIONS,
    TRIP_TYPE_OPTIONS,
    quick_trip_type, quick_vehicle_state, quick_yes_no,
)
from fastapi import FastAPI, HTTPException, Depends
from fastapi.middleware.cors import CORSMiddleware
from auth import router as auth_router, get_current_user, User

load_dotenv()

ORS_API_KEY = os.getenv("OPENROUTESERVICE_KEY")
OCM_API_KEY = os.getenv("OPENCHARGEMAP_KEY")

llm = ChatGoogleGenerativeAI(model="gemini-3.1-flash-lite")


# Types
class TripDetails(BaseModel):
    origin: str | None = Field(default=None, description="Source or origin of the trip")

    destination: str | None = Field(default=None, description="Destination of the trip")

    is_round_trip: bool | None = Field(
        default=None, description="Whether the trip is a round trip"
    )


class RouteDetails(BaseModel):
    distance: float | None = Field(default=None, description="Total distance in kilometers")

    time: float | None = Field(default=None, description="Total travel time in minutes")

    route_geometry: str | None = Field(default=None, description="Encoded polyline string representing the spatial route geometry")


class LLMMessage(BaseModel):
    message: str


OPTIONS_DESCRIPTION = (
    "Up to 4 short answers (under 40 characters each) the user could tap to reply to your message, "
    "for example suggested destinations or which detail to change. Empty if the question is open-ended."
)


class ReplyWithOptions(LLMMessage):
    options: list[str] = Field(default_factory=list, description=OPTIONS_DESCRIPTION)


class TripTurn(TripDetails):
    message: str = Field(
        default="",
        description="Your next message to the user. Empty if origin, destination and trip type are all known.",
    )
    options: list[str] = Field(default_factory=list, description=OPTIONS_DESCRIPTION)


class RouteApproval(BaseModel):
    is_approved: bool = Field(
        description="True if the user accepts the route. False if they reject it or ask to change origin/destination/details."
    )


class TripApproval(BaseModel):
    is_approved: bool = Field(
        description="True if the user confirms the trip details are correct. False if they reject them or want to change something."
    )


class ChargingApproval(BaseModel):
    is_approved: bool = Field(
        description="True if the user agrees to search for charging stations along the route. False if they decline or want something else."
    )


class PlanApproval(BaseModel):
    is_approved: bool = Field(
        description="True if the user wants the complete charging plan. False if they decline or ask about something else."
    )


class MapsApproval(BaseModel):
    is_approved: bool = Field(
        description="True if the user wants the route opened in Google Maps. False if they decline or ask about something else."
    )


class VehicleState(BaseModel):
    battery_soc: int | None = Field(default=None, description="Battery in Percentage", le=100, ge=-1)
    range_left: int | None = Field(default=None, description="Estimated remaining range in kilometers")


# state
class TripState(TypedDict):
    trip: TripDetails
    route: RouteDetails
    messages: Annotated[list, add_messages]
    trip_details_retrieved: bool
    trip_details_confirmed: bool
    route_details_found: bool
    route_approved: bool
    charging_search_pending: bool
    charging_search_approved: bool
    charging_station: list
    charging_plan: dict
    charging_plan_approved: bool
    vehicle_state: VehicleState
    draft_reply: str | None
    reply_options: list[str] | None
    maps_offer_pending: bool
    maps_offer_approved: bool
    maps_url: str | None


# llm
structured_llm_trip_turn = llm.with_structured_output(TripTurn)
structured_llm_vehicle_state_extractor = llm.with_structured_output(VehicleState)
structured_llm_route_approval = llm.with_structured_output(RouteApproval)
structured_llm_trip_approval = llm.with_structured_output(TripApproval)
structured_llm_charging_approval = llm.with_structured_output(ChargingApproval)
structured_llm_plan_approval = llm.with_structured_output(PlanApproval)
structured_llm_maps_approval = llm.with_structured_output(MapsApproval)
structured_llm_message = llm.with_structured_output(LLMMessage)
structured_llm_reply_with_options = llm.with_structured_output(ReplyWithOptions)


# helper functions
def format_conversation(messages):
    # Plain "User: ..." lines; the default repr adds ids and metadata the LLM does not need
    return "\n".join(
        f"{'User' if isinstance(msg, HumanMessage) else 'Assistant'}: {msg.content}" for msg in messages
    )


def clean_options(options):
    # The LLM occasionally repeats an option or writes a sentence; keep a few short, distinct ones
    seen, cleaned = set(), []
    for option in options or []:
        option = option.strip()
        if option and len(option) <= 60 and option.lower() not in seen:
            seen.add(option.lower())
            cleaned.append(option)
    return cleaned[:4] or None


def latest_user_message(state):
    return state["messages"][-1].content if state["messages"] else ""


def describe_trip(trip):
    trip_type = "unknown" if trip.is_round_trip is None else "round trip" if trip.is_round_trip else "one way"
    return f"origin: {trip.origin or 'unknown'}, destination: {trip.destination or 'unknown'}, trip type: {trip_type}"


def get_coordinates(place_name: str):
    
    url = "https://api.openrouteservice.org/geocode/search"

    headers = {"Authorization": ORS_API_KEY}

    params = {"text": place_name, "size": 1}

    response = requests.get(url, headers=headers, params=params, timeout=10)

    response.raise_for_status()

    data = response.json()

    if not data.get("features"):
        return None

    coordinates = data["features"][0]["geometry"]["coordinates"]

    return coordinates[0], coordinates[1]


def get_route(origin: str, destination: str):

    with ThreadPoolExecutor(max_workers=2) as pool:
        start, end = pool.map(get_coordinates, [origin, destination])

    if start is None or end is None:
        return None

    url = "https://api.openrouteservice.org/v2/directions/driving-car"

    headers = {"Authorization": ORS_API_KEY, "Content-Type": "application/json"}

    body = {"coordinates": [start, end]}

    response = requests.post(url, headers=headers, json=body, timeout=20)

    response.raise_for_status()

    data = response.json()

    route = data["routes"][0]

    return {
        "distance_km": round(route["summary"]["distance"] / 1000, 2),
        "duration_minutes": round(route["summary"]["duration"] / 60, 1),
        "geometry": route["geometry"],
    }


# Charging station lookup tuning
SAMPLE_SPACING_KM = 8         # one lookup roughly every 8 km (search circles of 5 km radius overlap)
MAX_PARALLEL_LOOKUPS = 8      # lookups run concurrently
LOOKUP_TIMEOUT_SECONDS = 10


class ChargingServiceError(Exception):
    """Raised when the charging station service could not be reached for any point on the route."""


def get_charging_stations_along_route(geometry: str, search_radius_km: int = 5):
    coordinates = polyline.decode(geometry)

    if not coordinates:
        return [], 0

    # Sample by distance, not by point count: routing polylines are very dense
    sampled_coordinates = sample_route(coordinates, SAMPLE_SPACING_KM)

    stations = {}
    failed_lookups = 0
    url = "https://api.openchargemap.io/v3/poi/"
    headers = {"X-API-Key": OCM_API_KEY, "User-Agent": "EV-Trip_Planner"}

    session = requests.Session()

    def lookup(point):
        lat, lon = point
        params = {
            "latitude": lat,
            "longitude": lon,
            "distance": search_radius_km,
            "distanceunit": "KM",
            "maxresults": 20,
            "compact": True,
        }

        try:
            response = session.get(url, headers=headers, params=params, timeout=LOOKUP_TIMEOUT_SECONDS)
            return response.json() if response.status_code == 200 else None
        except (requests.RequestException, ValueError):
            return None

    with ThreadPoolExecutor(max_workers=MAX_PARALLEL_LOOKUPS) as pool:
        results = list(pool.map(lookup, sampled_coordinates))

    for data in results:
        # A failed lookup is not the same as "no stations here", so count it separately
        if not isinstance(data, list):
            failed_lookups += 1
            continue

        for station in data:
            station_id = station.get("ID")
            if not station_id:
                continue

            address = station.get("AddressInfo", {})

            stations[station_id] = {
                "id": station_id,
                "name": address.get("Title"),
                "latitude": address.get("Latitude"),
                "longitude": address.get("Longitude"),
                "town": address.get("Town"),
                "state": address.get("StateOrProvince"),
                "address": address.get("AddressLine1"),
            }

    if failed_lookups == len(sampled_coordinates):
        raise ChargingServiceError("Could not reach the charging station service")

    return list(stations.values()), failed_lookups


# nodes
def extract_trip_details(state: TripState):
    print("extract_trip_details")

    # Answering "one way or round trip?" (typed or via the answer chips) needs no LLM
    trip = state["trip"]
    if trip.origin and trip.destination and trip.is_round_trip is None:
        is_round_trip = quick_trip_type(latest_user_message(state))
        if is_round_trip is not None:
            return {"trip": trip.model_copy(update={"is_round_trip": is_round_trip}), "draft_reply": None, "reply_options": None}

    # One call both extracts the trip and drafts the follow-up question, instead of two in a row
    prompt = f"""
        You are an intelligent EV trip-planning assistant.

        1. Extract the trip details (origin, destination, round trip or one way) from the conversation.
           If the user's response is ambiguous or unclear, do not extract the information.
           Preserve previously collected information unless the user explicitly changes it.

        2. If any of the three is still unknown after this message, write your next message to the user:
           - Have a natural conversation and ask for only one missing detail at a time.
           - If the user has not decided where to go, help them decide.
           - If the user's response is ambiguous or unclear, ask a follow-up question to clarify. Do not make assumptions.
           - Do not mention internal fields or technical details.
           - Do not answer anything unrelated to EV trip planning.
           If your message asks something with a few natural answers, also list them as options.
           If all three are known, leave the message and options empty.

        Trip so far: {describe_trip(state["trip"])}

        Conversation:
        {format_conversation(state["messages"])}
    """
    turn = structured_llm_trip_turn.invoke(prompt)

    trip = TripDetails(origin=turn.origin, destination=turn.destination, is_round_trip=turn.is_round_trip)
    draft = turn.message.strip() or None
    return {"trip": trip, "draft_reply": draft, "reply_options": clean_options(turn.options) if draft else None}


def validate_trip_details(state: TripState):
    print("validate_trip_details")

    trip = state["trip"]

    trip_details_retrieved = all(
        [
            trip.origin is not None,
            trip.destination is not None,
            trip.is_round_trip is not None,
        ]
    )

    return {"trip_details_retrieved": trip_details_retrieved}


def gather_trip_details(state: TripState):
    print("gather_trip_details")

    # Drafted by extract_trip_details this turn; only the rejection paths need a fresh call
    if state.get("draft_reply"):
        return {"messages": [AIMessage(content=state["draft_reply"])]}

    prompt = f"""
        You are an intelligent EV trip-planning assistant.
        
        Trip so far: {describe_trip(state["trip"])}

        Conversation:
        {format_conversation(state["messages"])}

        
        Have a natural conversation with the user.

        If any required field is missing, ask the user, but only one question at a time.

        If all fields are present but the user did not confirm them, ask what they would like to change.

        If the user has not decided where to go, help them decide.

        If the user's response is ambiguous or unclear, ask a follow-up question to clarify before proceeding. Do not make assumptions.

        If user has declined to proceed ahead with further processing after calculating route details. Ask whether wants to change destination.

        Do not mention internal fields or technical details.
        Do not answer anything unrelated to EV trip planning.

        If your message asks something with a few natural answers, also list them as options.

    """

    response = structured_llm_reply_with_options.invoke(prompt)

    return {"messages": [AIMessage(content=response.message)], "reply_options": clean_options(response.options)}


def ask_for_trip_confirmation(state: TripState):
    print("ask_for_trip_confirmation")

    trip = state["trip"]
    trip_kind = "a round trip (there and back)" if trip.is_round_trip else "one way"
    message = (
        f"Just to confirm: you're driving from {trip.origin} to {trip.destination}, {trip_kind}. "
        "Is that right? Once you confirm, I'll work out the route, distance and travel time."
    )

    return {"messages": [AIMessage(content=message)]}


def trip_confirmation_extraction(state: TripState):
    print("trip_confirmation_extraction")

    is_approved = quick_yes_no(latest_user_message(state))
    if is_approved is None:
        prompt = f"""
            Determine if the user confirmed the trip details or wants to make changes.

            Proposed Trip: {describe_trip(state["trip"])}
            Conversation:
            {format_conversation(state["messages"])}
        """
        is_approved = structured_llm_trip_approval.invoke(prompt).is_approved

    if is_approved:
        return {"trip_details_confirmed": True}

    # Re-extract and re-validate on the next turn so any changes are picked up
    return {"trip_details_confirmed": False, "trip_details_retrieved": False}


def find_route_details(state: TripState):
    print("find_route_details")

    trip = state["trip"]

    route = get_route(trip.origin, trip.destination)

    # A round trip covers the route twice; the geometry stays one-way (same road back)
    multiplier = 2 if trip.is_round_trip else 1

    route_details = {
        "distance": round(route["distance_km"] * multiplier, 2),
        "time": round(route["duration_minutes"] * multiplier, 1),
        "route_geometry": route["geometry"],
    }

    return {"route": route_details, "route_details_found": True}


def ask_for_route_confirmation(state: TripState):
    print("ask_for_route_confirmation")

    trip = state["trip"]
    route = state["route"]
    time_text = format_duration(route["time"])

    if trip.is_round_trip:
        summary = (
            f"Your round trip from {trip.origin} to {trip.destination} and back is {route['distance']:g} km in total, "
            f"about {time_text} of driving."
        )
    else:
        summary = f"Your one way trip from {trip.origin} to {trip.destination} is {route['distance']:g} km, about {time_text} of driving."

    message = f"{summary} Shall I go ahead and check your battery and charging needs?"

    return {"messages": [AIMessage(content=message)]}


def route_confirmation_extraction(state: TripState):
    print("route_confirmation_extraction")

    is_approved = quick_yes_no(latest_user_message(state))
    if is_approved is None:
        # Distance and time only: the route geometry is thousands of characters the LLM does not need
        prompt = f"""
            Determine if the user approved the route or wants to make changes.

            Proposed Route: {state['route']['distance']} km, {format_duration(state['route']['time'])}
            Conversation:
            {format_conversation(state['messages'])}
        """
        is_approved = structured_llm_route_approval.invoke(prompt).is_approved

    if is_approved:
        return {"route_approved": True}

    # Rejected: clear route and confirmation flags so trip details are re-extracted
    # and confirmed again on the next turn
    return {
        "route_approved": False,
        "route": None,
        "route_details_found": False,
        "trip_details_retrieved": False,
        "trip_details_confirmed": False,
    }


def gather_vehicle_state_information(state: TripState):
    print("gather_vehicle_state_information")

    vehicle = state["vehicle_state"]
    need_battery = vehicle.battery_soc is None
    need_range = vehicle.range_left is None

    if need_battery and not need_range:
        message = "Great. What's your current battery percentage?"
    elif need_range and not need_battery:
        message = "Great. Roughly how many km of range does your car show right now?"
    else:
        message = "Great. What's your current battery percentage, and roughly how many km of range does your car show?"

    return {"messages": [AIMessage(content=message)]}


def extract_vehicle_state_information(state: TripState):
    print("extract_vehicle_state_information")

    parsed = quick_vehicle_state(latest_user_message(state))
    if parsed:
        # Keep a value given earlier when this message only has the other one ("Range 50 km")
        battery, range_km = parsed
        known = state["vehicle_state"]
        return {"vehicle_state": VehicleState(
            battery_soc=battery if battery is not None else known.battery_soc,
            range_left=range_km if range_km is not None else known.range_left,
        )}

    prompt = f"""
        Extract the battery and range information from the conversation.

        Conversation:
        {format_conversation(state['messages'])}
    """
    response = structured_llm_vehicle_state_extractor.invoke(prompt)

    return {"vehicle_state": response}


def is_trip_possible_with_current_vehicle_state(state: TripState):
    print("is_trip_possible_with_current_vehicle_state")

    current_vehicle_state = state['vehicle_state']
    route_details = state["route"]

    if current_vehicle_state.range_left is None:
        return {"messages": [AIMessage(content="I could not work out how far your vehicle can still go. Roughly how many kilometres of range do you have left?")]}

    if route_details["distance"] > current_vehicle_state.range_left:
        message = (
            f"Your current range of {current_vehicle_state.range_left:g} km is not enough to cover "
            f"the {route_details['distance']:g} km trip, so you will need to charge along the way. "
            "Shall I search for charging stations along your route?"
        )
        return {"messages": [AIMessage(content=message)], "charging_search_pending": True}

    message = "You have enough range to reach your destination directly. No charging stops required! Would you like this route in Google Maps, so you can start navigating?"
    return {"messages": [AIMessage(content=message)], "maps_offer_pending": True}
 

def find_charging_stations(state: TripState):
    print("find_charging_stations")

    route = state["route"]

    geometry = route.get("route_geometry")

    try:
        stations, failed_lookups = get_charging_stations_along_route(geometry)
    except ChargingServiceError:
        # Keep the question open so a "yes" retries the search
        message = "I could not reach the charging station service right now, so I could not check your route. Would you like me to try again?"
        return {"messages": [AIMessage(content=message)], "charging_search_pending": True}

    if stations:
        count = len(stations)
        message = f"Good news, I found {count} charging station{'s' if count != 1 else ''} along your route."
        if failed_lookups:
            message += " Some parts of the route could not be checked, so there may be more."
        message += (
            " Would you like a complete charging plan, with where to stop, how long to charge at each stop "
            "and your estimated total travel time?"
        )
        return {"charging_station": stations, "messages": [AIMessage(content=message)]}

    message = (
        "I searched along your route but did not find any charging stations. "
        "You may want to charge before you set off, or consider a different route."
    )

    return {"charging_station": stations, "messages": [AIMessage(content=message)]}


def charging_confirmation_extraction(state: TripState):
    print("charging_confirmation_extraction")

    is_approved = quick_yes_no(latest_user_message(state))
    if is_approved is None:
        prompt = f"""
            The user was asked whether to search for charging stations along their route because their current range is not enough.
            Determine if the user agreed to the search or declined.

            Conversation:
            {format_conversation(state["messages"])}
        """
        is_approved = structured_llm_charging_approval.invoke(prompt).is_approved

    return {"charging_search_pending": False, "charging_search_approved": is_approved}


def decline_charging_search(state: TripState):
    print("decline_charging_search")

    message = "No problem. Let me know if you would like to update your battery or range, or search for charging stations later."

    return {"messages": [AIMessage(content=message)]}


def plan_confirmation_extraction(state: TripState):
    print("plan_confirmation_extraction")

    is_approved = quick_yes_no(latest_user_message(state))
    if is_approved is None:
        prompt = f"""
            The user was told that charging stations were found along their route and was asked whether they want a complete charging plan.
            Determine if the user now wants the complete charging plan or not.

            Conversation:
            {format_conversation(state["messages"])}
        """
        is_approved = structured_llm_plan_approval.invoke(prompt).is_approved

    return {"charging_plan_approved": is_approved}


def decline_charging_plan(state: TripState):
    print("decline_charging_plan")

    message = "No problem. Just ask whenever you would like a complete charging plan."

    return {"messages": [AIMessage(content=message)]}


def plan_charging_stops(state: TripState):
    print("plan_charging_stops")

    route = state["route"]
    trip = state["trip"]
    vehicle_state = state["vehicle_state"]

    points = polyline.decode(route["route_geometry"])
    # The stored distance already covers both directions for a round trip
    one_way_km = route["distance"] / (2 if trip.is_round_trip else 1)

    plan = build_charging_plan(
        points=points,
        stations=state["charging_station"],
        one_way_km=one_way_km,
        drive_minutes=route["time"],
        is_round_trip=trip.is_round_trip,
        range_left_km=vehicle_state.range_left,
        battery_soc=vehicle_state.battery_soc,
    )

    if not plan["feasible"]:
        return {"charging_plan": plan, "messages": [AIMessage(content=format_plan_message(plan))]}

    message = f"{format_plan_message(plan)}\n\nWould you like this route with the charging stops in Google Maps, so you can start navigating?"
    return {"charging_plan": plan, "messages": [AIMessage(content=message)], "maps_offer_pending": True}


def maps_confirmation_extraction(state: TripState):
    print("maps_confirmation_extraction")

    is_approved = quick_yes_no(latest_user_message(state))
    if is_approved is None:
        prompt = f"""
            The user was asked whether they want their route opened in Google Maps.
            Determine if the user wants the Google Maps link or not.

            Conversation:
            {format_conversation(state["messages"])}
        """
        is_approved = structured_llm_maps_approval.invoke(prompt).is_approved

    return {"maps_offer_pending": False, "maps_offer_approved": is_approved}


def create_maps_route(state: TripState):
    print("create_maps_route")

    trip = state["trip"]
    stops = (state["charging_plan"] or {}).get("stops", [])
    url, included = google_maps_url(trip.origin, trip.destination, stops, trip.is_round_trip)

    if not stops:
        message = f"Here is your route from {trip.origin} to {trip.destination} in Google Maps:"
    else:
        message = f"Here is your route in Google Maps with {included} charging stop{'s' if included != 1 else ''} added along the way:"
        if included < len(stops):
            message += f" (Google Maps allows only {included} stops in one link, so add the rest from the plan above.)"
    # The UI turns the link on its own line into an "Open in Google Maps" button
    message += f"\n{url}"

    return {"maps_url": url, "messages": [AIMessage(content=message)]}


def decline_maps_route(state: TripState):
    print("decline_maps_route")

    return {"messages": [AIMessage(content="No problem. Have a safe trip!")]}


def answer_plan_followup(state: TripState):
    print("answer_plan_followup")

    prompt = f"""
        You are an intelligent EV trip-planning assistant. The charging plan below has already been shared with the user.

        Answer the user's latest message using only this plan and the conversation. Do not invent stations, distances, battery levels or times.
        If the user wants to plan a different trip, tell them to press the new trip button in the sidebar.
        Do not answer anything unrelated to EV trip planning.

        Trip: {describe_trip(state["trip"])}

        Charging plan:
        {format_plan_message(state["charging_plan"])}

        Conversation:
        {format_conversation(state["messages"])}
    """
    response = structured_llm_message.invoke(prompt)

    return {"messages": [AIMessage(content=response.message)]}


def choice(options):
    return {"type": "choice", "options": [{"label": label, "description": description} for label, description in options]}


def input_request_for(state) -> dict | None:
    """How the UI should collect the answer to the assistant's last question, or None for plain typing.

    "choice": a list of options to pick from (the label is sent as the message), with typing as a fallback.
    "vehicle": battery and range inputs, for the fields that are still missing.
    """
    trip = state["trip"]
    vehicle = state["vehicle_state"]

    if state["maps_offer_pending"]:
        return choice(MAPS_OFFER_OPTIONS)
    if state["charging_plan"]:
        return choice(PLAN_FOLLOWUP_OPTIONS)
    if state["charging_station"]:
        return choice(PLAN_OFFER_OPTIONS)
    if state["charging_search_pending"]:
        return choice(SEARCH_OFFER_OPTIONS)
    if state["route_approved"]:
        missing = [name for name, value in (("battery", vehicle.battery_soc), ("range", vehicle.range_left)) if value is None]
        return {"type": "vehicle", "fields": missing} if missing else None
    if state["route_details_found"]:
        return choice(ROUTE_CONFIRM_OPTIONS)
    if state["trip_details_retrieved"] and not state["trip_details_confirmed"]:
        return choice(TRIP_CONFIRM_OPTIONS)
    if trip.origin and trip.destination and trip.is_round_trip is None:
        return choice(TRIP_TYPE_OPTIONS)
    if state.get("reply_options"):
        return choice((option, "") for option in state["reply_options"])
    return None


# routers
def router_after_start(state: TripState) -> Literal["maps_confirmation_extraction", "extract_trip_details", "trip_confirmation_extraction", "route_confirmation_extraction", "charging_confirmation_extraction", "extract_vehicle_state_information", "answer_plan_followup", "plan_confirmation_extraction"]:

    if state['maps_offer_pending']:
        return "maps_confirmation_extraction"

    if state['charging_plan']:
        return "answer_plan_followup"

    # Stations were found and the user has not received a plan yet: the offer is still open
    if state['charging_station']:
        return "plan_confirmation_extraction"

    if state['route_approved'] and state['charging_search_pending']:
        return "charging_confirmation_extraction"

    if state['route_approved']:
        return "extract_vehicle_state_information"

    
    if state['route_details_found']:
        return "route_confirmation_extraction"

    if state['trip_details_retrieved'] and not state['trip_details_confirmed']:
        return "trip_confirmation_extraction"

    return "extract_trip_details"


def router_trip_details(state: TripState) -> Literal["gather_trip_details", "ask_for_trip_confirmation"]:

    if state["trip_details_retrieved"]:
        return "ask_for_trip_confirmation"

    return "gather_trip_details"


def router_trip_approval(state: TripState) -> Literal["find_route_details", "gather_trip_details"]:

    if state["trip_details_confirmed"]:
        return "find_route_details"

    return "gather_trip_details"


def router_route_details(state: TripState) -> Literal["ask_for_route_confirmation", "gather_trip_details"]:
    
    if state['route'] is not None:
        return "ask_for_route_confirmation"

    return "gather_trip_details"


def router_route_approval(state: TripState) -> Literal["gather_vehicle_state_information", "gather_trip_details"]:
    
    if state['route_approved']:
        return "gather_vehicle_state_information"
    
    return "gather_trip_details"


def router_charging_approval(state: TripState) -> Literal["find_charging_stations", "decline_charging_search"]:

    if state["charging_search_approved"]:
        return "find_charging_stations"

    return "decline_charging_search"


def router_maps_approval(state: TripState) -> Literal["create_maps_route", "decline_maps_route"]:

    if state["maps_offer_approved"]:
        return "create_maps_route"

    return "decline_maps_route"


def router_plan_approval(state: TripState) -> Literal["plan_charging_stops", "decline_charging_plan"]:

    if state["charging_plan_approved"]:
        return "plan_charging_stops"

    return "decline_charging_plan"


graph = StateGraph(TripState)

graph.add_node("extract_trip_details", extract_trip_details)
graph.add_node("validate_trip_details", validate_trip_details)
graph.add_node("gather_trip_details", gather_trip_details)
graph.add_node("ask_for_trip_confirmation", ask_for_trip_confirmation)
graph.add_node("trip_confirmation_extraction", trip_confirmation_extraction)
graph.add_node("find_route_details", find_route_details)
graph.add_node("ask_for_route_confirmation", ask_for_route_confirmation)
graph.add_node("route_confirmation_extraction", route_confirmation_extraction)
graph.add_node("gather_vehicle_state_information", gather_vehicle_state_information)
graph.add_node("extract_vehicle_state_information", extract_vehicle_state_information)
graph.add_node("is_trip_possible_with_current_vehicle_state", is_trip_possible_with_current_vehicle_state)
graph.add_node("find_charging_stations", find_charging_stations)
graph.add_node("charging_confirmation_extraction", charging_confirmation_extraction)
graph.add_node("decline_charging_search", decline_charging_search)
graph.add_node("plan_confirmation_extraction", plan_confirmation_extraction)
graph.add_node("decline_charging_plan", decline_charging_plan)
graph.add_node("plan_charging_stops", plan_charging_stops)
graph.add_node("answer_plan_followup", answer_plan_followup)
graph.add_node("maps_confirmation_extraction", maps_confirmation_extraction)
graph.add_node("create_maps_route", create_maps_route)
graph.add_node("decline_maps_route", decline_maps_route)

graph.add_conditional_edges(START, router_after_start)
graph.add_edge("extract_trip_details", "validate_trip_details")
graph.add_conditional_edges("validate_trip_details", router_trip_details)
graph.add_edge("gather_trip_details", END)
graph.add_edge("ask_for_trip_confirmation", END)
graph.add_conditional_edges("trip_confirmation_extraction", router_trip_approval)
graph.add_edge("find_route_details", "ask_for_route_confirmation")
graph.add_edge("ask_for_route_confirmation", END)

graph.add_conditional_edges("route_confirmation_extraction", router_route_approval)
graph.add_edge("gather_vehicle_state_information", END)
graph.add_edge("extract_vehicle_state_information", "is_trip_possible_with_current_vehicle_state")
graph.add_edge("is_trip_possible_with_current_vehicle_state", END)
graph.add_conditional_edges("charging_confirmation_extraction", router_charging_approval)
graph.add_edge("decline_charging_search", END)
graph.add_edge("find_charging_stations", END)
graph.add_conditional_edges("plan_confirmation_extraction", router_plan_approval)
graph.add_edge("decline_charging_plan", END)
graph.add_edge("plan_charging_stops", END)
graph.add_edge("answer_plan_followup", END)
graph.add_conditional_edges("maps_confirmation_extraction", router_maps_approval)
graph.add_edge("create_maps_route", END)
graph.add_edge("decline_maps_route", END)

app_graph = graph.compile()

# ==================== FastAPI Setup ====================

app = FastAPI(title="EVPilot API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=os.getenv("CORS_ORIGINS", "http://localhost:5173").split(","),
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth_router)

class ChatMessagePayload(BaseModel):
    role: Literal["user", "assistant"]
    content: str

class ChatRequest(BaseModel):
    message: str
    trip: TripDetails = Field(default_factory=TripDetails)
    route: RouteDetails | None = None
    messages: list[ChatMessagePayload] = Field(default_factory=list)
    trip_details_retrieved: bool = False
    trip_details_confirmed: bool = False
    route_details_found: bool = False
    route_approved: bool = False
    charging_search_pending: bool = False
    charging_station: list | None = None
    charging_plan: dict | None = None
    vehicle_state: VehicleState = Field(default_factory=VehicleState)
    maps_offer_pending: bool = False
    maps_url: str | None = None

@app.post("/chat")
# Plain def: the graph blocks on network calls, so FastAPI runs it in its thread pool
# instead of stalling every other request on the event loop
def chat_endpoint(request: ChatRequest, user: User = Depends(get_current_user)):
    try:
        # 1. Convert incoming JSON message payload to LangChain message objects
        langchain_messages = []
        for msg in request.messages:
            if msg.role == "user":
                langchain_messages.append(HumanMessage(content=msg.content))
            else:
                langchain_messages.append(AIMessage(content=msg.content))
        
        # Append the incoming new prompt
        langchain_messages.append(HumanMessage(content=request.message))

        # 2. Build current state
        current_state: TripState = {
            "trip": request.trip,
            "route": request.route.model_dump() if request.route else None,
            "messages": langchain_messages,
            "trip_details_retrieved": request.trip_details_retrieved,
            "trip_details_confirmed": request.trip_details_confirmed,
            "route_details_found": request.route_details_found,
            "route_approved": request.route_approved,
            "charging_search_pending": request.charging_search_pending,
            "charging_search_approved": False,
            "charging_station": request.charging_station,
            "charging_plan": request.charging_plan,
            "charging_plan_approved": False,
            "vehicle_state": request.vehicle_state,
            "draft_reply": None,
            "reply_options": None,
            "maps_offer_pending": request.maps_offer_pending,
            "maps_offer_approved": False,
            "maps_url": request.maps_url,
        }

        # 3. Invoke graph
        output_state = app_graph.invoke(current_state)

        # 4. Extract latest response and format messages for clean JSON response
        formatted_messages = []
        for msg in output_state["messages"]:
            role = "user" if isinstance(msg, HumanMessage) else "assistant"
            formatted_messages.append({"role": role, "content": msg.content})

        latest_ai_message = formatted_messages[-1]["content"] if formatted_messages else ""

        return {
            "response": latest_ai_message,
            "input_request": input_request_for(output_state),
            "state": {
                "trip": output_state["trip"].model_dump(),
                "route": output_state["route"],
                "messages": formatted_messages,
                "trip_details_retrieved": output_state["trip_details_retrieved"],
                "trip_details_confirmed": output_state["trip_details_confirmed"],
                "route_details_found": output_state["route_details_found"],
                "route_approved": output_state["route_approved"],
                "charging_search_pending": output_state["charging_search_pending"],
                "charging_station": output_state["charging_station"],
                "charging_plan": output_state["charging_plan"],
                "vehicle_state": output_state["vehicle_state"].model_dump(),
                "maps_offer_pending": output_state["maps_offer_pending"],
                "maps_url": output_state["maps_url"],
            }
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


