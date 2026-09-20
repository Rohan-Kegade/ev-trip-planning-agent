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
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware

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
    distance: int | None = Field(default=None, description="Total distance between origin and destination")

    time: int | None = Field(default=None, description="Total time required to travel the given distance")

    route_geometry: int | None = Field(default=None, description="Encoded polyline string representing the spatial route geometry")


class LLMMessage(BaseModel):
    message: str


class RouteApproval(BaseModel):
    is_approved: bool = Field(
        description="True if the user accepts the route. False if they reject it or ask to change origin/destination/details."
    )


class TripApproval(BaseModel):
    is_approved: bool = Field(
        description="True if the user confirms the trip details are correct. False if they reject them or want to change something."
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
    charging_station: list
    vehicle_state: VehicleState


# llm
structured_llm_trip_details_extractor = llm.with_structured_output(TripDetails)
structured_llm_vehicle_state_extractor = llm.with_structured_output(VehicleState)
structured_llm_route_approval = llm.with_structured_output(RouteApproval)
structured_llm_trip_approval = llm.with_structured_output(TripApproval)
structured_llm_message = llm.with_structured_output(LLMMessage)


# helper functions
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

    start = get_coordinates(origin)
    end = get_coordinates(destination)

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


def get_charging_stations_along_route(
    geometry: str, sample_interval: int = 30, search_radius_km: int = 5
):
    coordinates = polyline.decode(geometry)

    if not coordinates:
        return []

    sampled_coordinates = coordinates[::sample_interval]

    if coordinates[-1] not in sampled_coordinates:
        sampled_coordinates.append(coordinates[-1])

    stations = {}
    url = "https://api.openchargemap.io/v3/poi/"
    headers = {"X-API-Key": OCM_API_KEY, "User-Agent": "EV-Trip_Planner"}

    for lat, lon in sampled_coordinates:
        params = {
            "latitude": lat,
            "longitude": lon,
            "distance": search_radius_km,
            "distanceunit": "KM",
            "maxresults": 20,
            "compact": True,
        }

        response = requests.get(url, headers=headers, params=params, timeout=15)

        if response.status_code != 200:
            continue

        for station in response.json():
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

    return list(stations.values())


# nodes
def extract_trip_details(state: TripState):
    print("extract_trip_details")

    prompt = f"""
        Extract the trip details from the conversation.
        If the user's response is ambiguous or unclear, do not extract the information.
        Do not overwrite existing values with `None`. Preserve previously collected information unless the user explicitly changes it.

        Current Trip:
        {state["trip"]}

        Conversation:
        {state["messages"]}

    """
    trip_details = structured_llm_trip_details_extractor.invoke(prompt)

    return {"trip": trip_details}


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

    prompt = f"""
        You are an intelligent EV trip-planning assistant.
        
        Required Fields:
        {state["trip"]}

        Conversation:
        {state["messages"]}

        
        Have a natural conversation with the user.

        If any required field is missing, ask the user, but only one question at a time.

        If all fields are present but the user did not confirm them, ask what they would like to change.

        If the user has not decided where to go, help them decide.

        If the user's response is ambiguous or unclear, ask a follow-up question to clarify before proceeding. Do not make assumptions.

        If user has declined to proceed ahead with further processing after calculating route details. Ask whether wants to change destination.

        Do not mention internal fields or technical details.
        Do not answer anything unrelated to EV trip planning.

    """

    response = structured_llm_message.invoke(prompt)

    return {"messages": [AIMessage(content=response.message)]}


def ask_for_trip_confirmation(state: TripState):
    print("ask_for_trip_confirmation")

    prompt = f"""
        You are an intelligent EV trip-planning assistant.
        Present the trip details extracted so far to the user (origin, destination, and whether it is a round trip or one way).
        Ask them to confirm that these are correct so you can calculate the route, distance and travel time.
        Do not mention internal fields or technical details.

        Trip: {state["trip"]}
    """
    response = structured_llm_message.invoke(prompt)

    return {"messages": [AIMessage(content=response.message)]}


def trip_confirmation_extraction(state: TripState):
    print("trip_confirmation_extraction")

    prompt = f"""
        Determine if the user confirmed the trip details or wants to make changes.

        Proposed Trip: {state["trip"]}
        Conversation: {state["messages"]}
    """
    response = structured_llm_trip_approval.invoke(prompt)

    if response.is_approved:
        return {"trip_details_confirmed": True}

    # Re-extract and re-validate on the next turn so any changes are picked up
    return {"trip_details_confirmed": False, "trip_details_retrieved": False}


def find_route_details(state: TripState):
    print("find_route_details")

    trip = state["trip"]

    route = get_route(trip.origin, trip.destination)

    route_details = {
        "distance": route["distance_km"],
        "time": route["duration_minutes"],
        "route_geometry": route["geometry"],
    }

    return {"route": route_details, "route_details_found": True}


def ask_for_route_confirmation(state: TripState):
    print("ask_for_route_confirmation")

    prompt = f"""

    You are an intelligent EV trip-planning assistant.
    Present the TRIP AND calculated ROUTE details to the user and ask if they want to proceed ahead with further planning.
    Present distance in KM and Time in HOURS & MINUTES.

    Current Trip: {state['trip']}
    Route Details: {state['route']}

    """
    response = structured_llm_message.invoke(prompt)

    return {"messages": [AIMessage(content=response.message)]}


def route_confirmation_extraction(state: TripState):
    print("route_confirmation_extraction")

    prompt = f"""

    Determine if the user approved the route or wants to make changes.

    Proposed Route: {state['route']}
    Conversation: {state['messages']}

    """
    response = structured_llm_route_approval.invoke(prompt)

    if response.is_approved:
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

    prompt = f"""
        You are an ev-trip planning agent

        Your job is to ask user about the battery and range left in there electric vehicle.

    """
    response = structured_llm_message.invoke(prompt)

    return {"messages": [AIMessage(content=response.message)]}


def extract_vehicle_state_information(state: TripState):
    print("extract_vehicle_state_information")

    prompt = f"""

    Extract the battery and range information from given context.

    Conversation: {state['messages']}

    """
    response = structured_llm_vehicle_state_extractor.invoke(prompt)

    return { "vehicle_state": response } 


def is_trip_possible_with_current_vehicle_state(state: TripState):
    print("is_trip_possible_with_current_vehicle_state")

    current_vehicle_state = state['vehicle_state']
    route_details = state["route"]

    if route_details["distance"] > current_vehicle_state.range_left:
        return {"messages": [AIMessage(content="Your current range is insufficient for this distance. Searching for optimal charging stations along your path...")]}

    return {"messages": [AIMessage(content="You have enough range to reach your destination directly. No charging stops required!")]}  
 

def find_charging_stations(state: TripState):
    print("find_charging_stations")

    route = state["route"]

    geometry = route.get("route_geometry")

    stations = get_charging_stations_along_route(geometry)

    return {"charging_station": stations}


# routers
def router_after_start(state: TripState) -> Literal["extract_trip_details", "trip_confirmation_extraction", "route_confirmation_extraction", "extract_vehicle_state_information"]:

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


def route_vehicle_state(state: TripState) -> Literal["find_charging_stations", END]:

    current_vehicle_state = state['vehicle_state']
    route_details = state["route"]
    
    if route_details["distance"] > current_vehicle_state.range_left:
        return "find_charging_stations"
    
    return END


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
graph.add_conditional_edges("is_trip_possible_with_current_vehicle_state", route_vehicle_state)
graph.add_edge("find_charging_stations", END)

app_graph = graph.compile()

# ==================== FastAPI Setup ====================

app = FastAPI(title="EVPilot API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

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
    charging_station: list | None = None
    vehicle_state: VehicleState = Field(default_factory=VehicleState)

@app.post("/chat")
async def chat_endpoint(request: ChatRequest):
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
            "route": request.route,
            "messages": langchain_messages,
            "trip_details_retrieved": request.trip_details_retrieved,
            "trip_details_confirmed": request.trip_details_confirmed,
            "route_details_found": request.route_details_found,
            "route_approved": request.route_approved,
            "charging_station": request.charging_station,
            "vehicle_state": request.vehicle_state,
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
            "state": {
                "trip": output_state["trip"].model_dump(),
                "route": output_state["route"],
                "messages": formatted_messages,
                "trip_details_retrieved": output_state["trip_details_retrieved"],
                "trip_details_confirmed": output_state["trip_details_confirmed"],
                "route_details_found": output_state["route_details_found"],
                "route_approved": output_state["route_approved"],
                "charging_station": output_state["charging_station"],
                "vehicle_state": output_state["vehicle_state"].model_dump(),
            }
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


