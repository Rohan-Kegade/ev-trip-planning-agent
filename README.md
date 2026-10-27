# EVPilot – EV Trip Planning Agent

A chatbot that helps electric-vehicle drivers plan a trip. You tell it where you're going, and it works out the route, checks whether your battery is enough, and, if not, finds charging stations and builds a charging plan (where to stop, how long to charge, total travel time).

## How it works

The conversation is a [LangGraph](https://langchain-ai.github.io/langgraph/) state machine. Each chat message runs the graph once, resumes from wherever the conversation was, and returns the next reply.

```
trip details → confirm trip → route (distance/time) → confirm route
   → battery & range → enough range? ── yes ──────────────────────┐
                              │                                     │
                              no → offer station search → find stations
                                     → offer charging plan → plan   │
                                                              ↓     ↓
                                     offer Google Maps link → link with stops as waypoints
                                                              → follow-up Q&A
```

The Google Maps link is built in code (`google_maps_url` in `backend/planner.py`) using the [Maps URLs](https://developers.google.com/maps/documentation/urls/get-started) format, so it needs no API key. Charging stops are added as waypoints in route order (up to 9).

**Key design idea: the LLM only handles language; code handles the numbers.**

- **LLM (Gemini)** extracts structured data from what the user says (origin, destination, battery %, yes/no confirmations) and writes friendly replies.
- **Plain Python** does the real work: routing, station lookup, and the charging plan math in `backend/planner.py` (pure functions, no LLM, unit tested), so the plan is deterministic and never invented.
- **Fast paths keep it quick:** clear replies ("yes", "no thanks", "20% and 50 km") are parsed by rules in `backend/intent.py` and replies fully determined by the state use templates, so most turns make no LLM call. Anything ambiguous still goes to the LLM. Each `/chat` response can also carry an `input_request` telling the UI how to collect the next answer: a numbered list of options (fixed ones like yes/no, or suggestions the LLM writes, e.g. destinations) or a battery slider and range field. Typing always remains available.

Once the trip is planned the user can **make changes** (battery/range or the trip; everything after that step is planned again), **plan a new trip** or **end the chat**.

**Chat history lives on the server.** Each conversation's graph state is saved per user in SQLite (`backend/conversations.py`). The frontend sends only `{conversation_id, message}` to `/chat`; the backend loads the state, runs the graph and saves the result, so the client cannot alter the route or plan. `GET /conversations` lists a user's chats, `GET /conversations/{id}` reopens one, `POST /conversations/{id}/end` ends it (no more messages) and `DELETE /conversations/{id}` removes it. Deleting an account deletes its chats.

## Tech stack

| Layer | Tech |
|---|---|
| Frontend | React 19, Vite, Tailwind CSS |
| Backend | Python, FastAPI, Uvicorn, SQLite + JWT auth |
| Agent | LangGraph, LangChain, Google Gemini (`langchain-google-genai`) |
| External APIs | [OpenRouteService](https://openrouteservice.org/) (geocoding + routing), [OpenChargeMap](https://openchargemap.org/) (charging stations) |

## Project structure

```
backend/
  main.py          # LangGraph nodes/routers + FastAPI /chat endpoint + API clients
  auth.py          # /auth endpoints: signup, login, me, profile, password, delete (SQLite, scrypt, JWT)
  conversations.py # saved chats: list, open, end, delete
  planner.py       # charging plan logic (stops, charge times, total time)
  intent.py        # rule-based yes/no and battery/range parsing (LLM fallback when unsure)
  test_planner.py  # unit tests for the planner
  test_intent.py   # unit tests for intent.py
frontend/
  src/main.jsx     # routes: / (landing), /login, /signup, /app and /app/:conversationId (login required)
  src/App.jsx      # chat page: chat list sidebar + the open chat
  src/pages/       # Landing, Login, Signup
  src/components/ChatSidebar.jsx    # new trip button, chats grouped by day, profile
  src/components/ChatView.jsx       # title, trip info bar, messages, input
  src/components/TripInfoBar.jsx    # trip, route, battery and charging summary under the title
  src/components/PlanCard.jsx       # the charging plan drawn as a timeline card in the chat
  src/components/MessageContent.jsx # Markdown replies, the Google Maps button and the plan card
  src/components/SettingsModal.jsx  # profile, password, delete account
  src/components/InputRequest.jsx   # option list and battery/range card shown above the chat input
  src/auth.jsx     # auth context: calls /auth endpoints, stores the token
```

## Run locally

**Prerequisites:** Python 3.10+, Node.js 18+, and free API keys for Google Gemini, OpenRouteService and OpenChargeMap.

### 1. Backend

```bash
cd backend
python -m venv venv
venv\Scripts\activate          # macOS/Linux: source venv/bin/activate
pip install -r requirements.txt
cp .env.sample .env            # then fill in your keys
uvicorn main:app --reload      # runs on http://localhost:8000
```

`.env` needs:

```
GEMINI_API_KEY=
OPENROUTESERVICE_KEY=
OPENCHARGEMAP_KEY=
JWT_SECRET=                    # any long random string, e.g. python -c "import secrets; print(secrets.token_urlsafe(32))"
CORS_ORIGINS=http://localhost:5173
```

If `JWT_SECRET` is empty, a random one is used and everyone is logged out on each restart. User accounts are stored in `backend/users.db` (SQLite, created automatically).

### 2. Frontend

```bash
cd frontend
npm install
npm run dev                    # runs on http://localhost:5173
```

Open http://localhost:5173, create an account and start chatting, e.g. *"I want to drive from Pune to Mumbai."*

### 3. Tests (optional)

```bash
cd backend
python test_planner.py
python test_intent.py
```
