# EVPilot – EV Trip Planning Agent

A chatbot that helps electric-vehicle drivers plan a trip. You tell it where you're going, and it works out the route, checks whether your battery is enough, and, if not, finds charging stations and builds a charging plan (where to stop, how long to charge, total travel time).

## How it works

The conversation is a [LangGraph](https://langchain-ai.github.io/langgraph/) state machine. Each chat message runs the graph once, resumes from wherever the conversation was, and returns the next reply.

```
trip details → confirm trip → route (distance/time) → confirm route
   → battery & range → enough range? ── yes → done
                              │
                              no → offer station search → find stations
                                     → offer charging plan → plan + follow-up Q&A
```

**Key design idea: the LLM only handles language; code handles the numbers.**

- **LLM (Gemini)** extracts structured data from what the user says (origin, destination, battery %, yes/no confirmations) and writes friendly replies.
- **Plain Python** does the real work: routing, station lookup, and the charging plan math in `backend/planner.py` (pure functions, no LLM, unit tested), so the plan is deterministic and never invented.

The backend is stateless. The frontend sends the full conversation state with every request and gets the updated state back.

## Tech stack

| Layer | Tech |
|---|---|
| Frontend | React 19, Vite, Tailwind CSS |
| Backend | Python, FastAPI, Uvicorn |
| Agent | LangGraph, LangChain, Google Gemini (`langchain-google-genai`) |
| External APIs | [OpenRouteService](https://openrouteservice.org/) (geocoding + routing), [OpenChargeMap](https://openchargemap.org/) (charging stations) |

## Project structure

```
backend/
  main.py          # LangGraph nodes/routers + FastAPI /chat endpoint + API clients
  planner.py       # charging plan logic (stops, charge times, total time)
  test_planner.py  # unit tests for the planner
frontend/
  src/App.jsx      # chat UI
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
```

### 2. Frontend

```bash
cd frontend
npm install
npm run dev                    # runs on http://localhost:5173
```

Open http://localhost:5173 and start chatting, e.g. *"I want to drive from Pune to Mumbai."*

### 3. Tests (optional)

```bash
cd backend
python test_planner.py
```
