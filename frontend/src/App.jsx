import React, { useState, useRef, useEffect } from 'react';
import { ArrowUp, Battery, MapPin, RefreshCw, Route, Clock, Sparkles, Bot, Plug, Sun, Moon } from 'lucide-react';

const API_URL = 'http://localhost:8000/chat';

const SUGGESTIONS = [
  'Trip from Seattle to Portland',
  'Plan a round trip to Los Angeles',
  'Help me pick a weekend destination',
];

const formatTime = (mins) => {
  const h = Math.floor(mins / 60);
  const m = Math.round(mins % 60);
  return h > 0 ? `${h}h ${m}m` : `${m}m`;
};

const Field = ({ label, value }) => (
  <div className="flex items-center justify-between gap-3 text-sm">
    <span className="text-slate-500 dark:text-slate-400">{label}</span>
    <span className={`font-medium truncate ${value ? 'text-slate-900 dark:text-slate-100' : 'text-slate-300 dark:text-slate-600'}`}>{value || '—'}</span>
  </div>
);

const BotAvatar = () => (
  <span className="w-8 h-8 shrink-0 rounded-full bg-gradient-to-br from-indigo-500 to-cyan-500 text-white flex items-center justify-center shadow-md shadow-indigo-200">
    <Bot className="w-4 h-4" />
  </span>
);

const getInitialTheme = () => {
  try {
    const saved = localStorage.getItem('theme');
    if (saved === 'light' || saved === 'dark') return saved;
  } catch {
    // localStorage unavailable
  }
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
};

export default function App() {
  const [theme, setTheme] = useState(getInitialTheme);
  const [inputMessage, setInputMessage] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  // Entire LangGraph state maintained locally
  const [graphState, setGraphState] = useState({
    trip: { origin: null, destination: null, is_round_trip: null },
    route: null,
    messages: [],
    trip_details_retrieved: false,
    trip_details_confirmed: false,
    route_details_found: false,
    route_approved: false,
    charging_station: null,
    vehicle_state: { battery_soc: null, range_left: null },
  });

  const chatEndRef = useRef(null);

  // Apply theme to <html> and remember the choice
  useEffect(() => {
    document.documentElement.classList.toggle('dark', theme === 'dark');
    try {
      localStorage.setItem('theme', theme);
    } catch {
      // localStorage unavailable
    }
  }, [theme]);

  const toggleTheme = () => setTheme((t) => (t === 'dark' ? 'light' : 'dark'));

  // Auto-scroll chat to bottom
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [graphState.messages, isLoading]);

  const handleSendMessage = async (e) => {
    e.preventDefault();
    if (!inputMessage.trim() || isLoading) return;

    const userText = inputMessage;
    setInputMessage('');
    setIsLoading(true);

    // Optimistically add user message to chat feed
    const updatedMessages = [
      ...graphState.messages,
      { role: 'user', content: userText }
    ];
    setGraphState((prev) => ({ ...prev, messages: updatedMessages }));

    try {
      const payload = {
        message: userText,
        trip: graphState.trip,
        route: graphState.route,
        messages: graphState.messages, // Pass prior history
        trip_details_retrieved: graphState.trip_details_retrieved,
        trip_details_confirmed: graphState.trip_details_confirmed,
        route_details_found: graphState.route_details_found,
        route_approved: graphState.route_approved,
        charging_station: graphState.charging_station,
        vehicle_state: graphState.vehicle_state,
      };

      const response = await fetch(API_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        throw new Error(`Server error: ${response.statusText}`);
      }

      const data = await response.json();

      // Update local state with updated graph state from backend
      setGraphState(data.state);
    } catch (error) {
      console.error('Error sending message:', error);
      setGraphState((prev) => ({
        ...prev,
        messages: [
          ...updatedMessages,
          { role: 'assistant', content: '⚠️ Error connecting to server. Please check your FastAPI backend.' }
        ]
      }));
    } finally {
      setIsLoading(false);
    }
  };

  const resetSession = () => {
    setGraphState({
      trip: { origin: null, destination: null, is_round_trip: null },
      route: null,
      messages: [],
      trip_details_retrieved: false,
      trip_details_confirmed: false,
      route_details_found: false,
      route_approved: false,
      charging_station: null,
      vehicle_state: { battery_soc: null, range_left: null },
    });
  };

  const socRaw = graphState.vehicle_state?.battery_soc;
  const hasSoc = socRaw !== null && socRaw !== undefined;
  const soc = hasSoc ? Math.max(0, Math.min(100, socRaw)) : 0;
  const socColor = soc > 50 ? 'bg-emerald-500' : soc > 20 ? 'bg-amber-500' : 'bg-rose-500';
  const rangeLeft = graphState.vehicle_state?.range_left;
  const tripType = graphState.trip?.is_round_trip;

  return (
    <div className="flex h-screen bg-gradient-to-br from-slate-50 via-indigo-50/40 to-cyan-50/40 text-slate-800 dark:from-slate-950 dark:via-slate-900 dark:to-slate-950 dark:text-slate-200 font-sans antialiased">

      {/* Sidebar - Real-Time Graph State */}
      <aside className="w-80 shrink-0 m-3 mr-0 rounded-3xl bg-white/80 backdrop-blur border border-slate-200/70 shadow-xl shadow-indigo-100/40 dark:bg-slate-900/80 dark:border-slate-800 dark:shadow-black/30 p-5 flex flex-col justify-between overflow-y-auto">
        <div className="space-y-4">
          <div className="flex items-center justify-between pb-2">
            <h1 className="text-xl font-bold tracking-tight flex items-center gap-2.5 text-slate-900 dark:text-white">
              <img src="/logo.svg" alt="" className="w-9 h-9 rounded-xl shadow-md shadow-indigo-300/50" />
              <span>
                EV<span className="bg-gradient-to-r from-indigo-600 to-cyan-500 dark:from-indigo-400 dark:to-cyan-300 bg-clip-text text-transparent">Pilot</span>
              </span>
            </h1>
            <div className="flex items-center gap-1">
              <button
                onClick={toggleTheme}
                title={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
                aria-label="Toggle theme"
                className="p-2 text-slate-400 hover:text-indigo-600 dark:hover:text-indigo-300 rounded-xl hover:bg-indigo-50 dark:hover:bg-slate-800 transition"
              >
                {theme === 'dark' ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
              </button>
              <button
                onClick={resetSession}
                title="New trip"
                aria-label="New trip"
                className="p-2 text-slate-400 hover:text-indigo-600 dark:hover:text-indigo-300 rounded-xl hover:bg-indigo-50 dark:hover:bg-slate-800 transition"
              >
                <RefreshCw className="w-4 h-4" />
              </button>
            </div>
          </div>

          {/* Trip Info Widget */}
          <section className="p-4 bg-white dark:bg-slate-800/60 rounded-2xl border border-slate-200/80 dark:border-slate-700/60 shadow-sm space-y-2.5">
            <h2 className="text-[11px] font-semibold text-slate-400 uppercase tracking-widest flex items-center gap-1.5">
              <MapPin className="w-3.5 h-3.5 text-indigo-500" /> Trip Details
            </h2>
            <Field label="From" value={graphState.trip?.origin} />
            <Field label="To" value={graphState.trip?.destination} />
            <Field
              label="Type"
              value={tripType !== null && tripType !== undefined ? (tripType ? 'Round trip' : 'One way') : null}
            />
          </section>

          {/* Route Stats Widget */}
          {graphState.route && (
            <section className="p-4 rounded-2xl bg-gradient-to-br from-indigo-600 to-cyan-500 text-white shadow-lg shadow-indigo-300/40">
              <h2 className="text-[11px] font-semibold text-white/70 uppercase tracking-widest flex items-center gap-1.5 mb-3">
                <Route className="w-3.5 h-3.5" /> Route Summary
              </h2>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <p className="text-2xl font-bold leading-none">
                    {graphState.route.distance}
                    <span className="text-sm font-medium text-white/70 ml-1">km</span>
                  </p>
                  <p className="text-xs text-white/70 mt-1">Distance</p>
                </div>
                <div>
                  <p className="text-2xl font-bold leading-none">{formatTime(graphState.route.time)}</p>
                  <p className="text-xs text-white/70 mt-1 flex items-center gap-1">
                    <Clock className="w-3 h-3" /> Est. time
                  </p>
                </div>
              </div>
            </section>
          )}

          {/* Vehicle Status Widget */}
          <section className="p-4 bg-white dark:bg-slate-800/60 rounded-2xl border border-slate-200/80 dark:border-slate-700/60 shadow-sm space-y-3">
            <h2 className="text-[11px] font-semibold text-slate-400 uppercase tracking-widest flex items-center gap-1.5">
              <Battery className="w-3.5 h-3.5 text-indigo-500" /> EV Battery
            </h2>
            <div>
              <div className="flex items-end justify-between mb-1.5">
                <span className="text-sm text-slate-500 dark:text-slate-400">State of charge</span>
                <span className={`text-lg font-bold leading-none ${hasSoc ? 'text-slate-900 dark:text-slate-100' : 'text-slate-300 dark:text-slate-600'}`}>
                  {hasSoc ? `${socRaw}%` : '—'}
                </span>
              </div>
              <div className="h-2 rounded-full bg-slate-100 dark:bg-slate-700 overflow-hidden">
                <div className={`h-full rounded-full transition-all duration-700 ${socColor}`} style={{ width: `${soc}%` }} />
              </div>
            </div>
            <Field
              label="Range left"
              value={rangeLeft !== null && rangeLeft !== undefined ? `${rangeLeft} km` : null}
            />
          </section>

          {/* Found Stations Counter */}
          {graphState.charging_station && graphState.charging_station.length > 0 && (
            <div className="p-4 bg-emerald-50 text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-300 rounded-2xl border border-emerald-200/80 dark:border-emerald-900 text-sm flex items-center gap-3">
              <span className="p-2 rounded-xl bg-emerald-100 dark:bg-emerald-900/60"><Plug className="w-4 h-4" /></span>
              <span><strong>{graphState.charging_station.length}</strong> charging stations found along your route</span>
            </div>
          )}
        </div>

        <div className="text-[11px] text-slate-400 text-center pt-5 mt-5 border-t border-slate-100 dark:border-slate-800 tracking-wide">
          AI EV Trip Planning Agent
        </div>
      </aside>

      {/* Main Chat Interface */}
      <main className="flex-1 flex flex-col h-full min-w-0">

        {/* Messages Feed */}
        <div className="flex-1 overflow-y-auto px-6 pt-8 pb-4">
          <div className="max-w-3xl mx-auto space-y-5 min-h-full flex flex-col">
            {graphState.messages.length === 0 ? (
              <div className="flex-1 flex flex-col items-center justify-center text-center">
                <img src="/logo.svg" alt="" className="w-20 h-20 rounded-3xl shadow-xl shadow-indigo-300/50 mb-6" />
                <h2 className="text-3xl font-bold tracking-tight text-slate-900 dark:text-white">Where to next?</h2>
                <p className="text-slate-500 dark:text-slate-400 mt-2 max-w-md">
                  Tell me where you&apos;re headed and I&apos;ll plan the route, check your range and find charging stops.
                </p>
                <div className="flex flex-wrap justify-center gap-2 mt-8">
                  {SUGGESTIONS.map((text) => (
                    <button
                      key={text}
                      onClick={() => setInputMessage(text)}
                      className="px-4 py-2 rounded-full bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-sm text-slate-600 dark:text-slate-300 hover:border-indigo-300 dark:hover:border-indigo-400 hover:text-indigo-600 dark:hover:text-indigo-300 hover:shadow-md transition flex items-center gap-1.5"
                    >
                      <Sparkles className="w-3.5 h-3.5" /> {text}
                    </button>
                  ))}
                </div>
              </div>
            ) : (
              graphState.messages.map((msg, idx) => {
                const isUser = msg.role === 'user';
                return (
                  <div key={idx} className={`flex items-end gap-2.5 msg-in ${isUser ? 'justify-end' : 'justify-start'}`}>
                    {!isUser && <BotAvatar />}
                    <div
                      className={`max-w-[75%] px-4 py-3 text-[15px] leading-relaxed whitespace-pre-wrap ${
                        isUser
                          ? 'bg-gradient-to-br from-indigo-600 to-indigo-500 text-white rounded-2xl rounded-br-md shadow-md shadow-indigo-300/40'
                          : 'bg-white text-slate-800 dark:bg-slate-800 dark:text-slate-100 border border-slate-200/80 dark:border-slate-700 rounded-2xl rounded-bl-md shadow-sm'
                      }`}
                    >
                      {msg.content}
                    </div>
                  </div>
                );
              })
            )}

            {isLoading && (
              <div className="flex items-end gap-2.5 msg-in">
                <BotAvatar />
                <div className="bg-white dark:bg-slate-800 border border-slate-200/80 dark:border-slate-700 rounded-2xl rounded-bl-md px-4 py-3.5 shadow-sm flex items-center gap-1">
                  <span className="w-2 h-2 rounded-full bg-slate-300 dark:bg-slate-500 animate-bounce [animation-delay:-0.3s]" />
                  <span className="w-2 h-2 rounded-full bg-slate-300 dark:bg-slate-500 animate-bounce [animation-delay:-0.15s]" />
                  <span className="w-2 h-2 rounded-full bg-slate-300 dark:bg-slate-500 animate-bounce" />
                </div>
              </div>
            )}
            <div ref={chatEndRef} />
          </div>
        </div>

        {/* Message Input Bar */}
        <div className="px-6 pb-6 pt-2">
          <form
            onSubmit={handleSendMessage}
            className="max-w-3xl mx-auto flex items-center gap-2 p-2 pl-5 bg-white dark:bg-slate-900 rounded-full border border-slate-200 dark:border-slate-700 shadow-lg shadow-indigo-100/50 dark:shadow-black/30 focus-within:border-indigo-300 dark:focus-within:border-indigo-500 focus-within:ring-4 focus-within:ring-indigo-100 dark:focus-within:ring-indigo-500/20 transition"
          >
            <input
              type="text"
              value={inputMessage}
              onChange={(e) => setInputMessage(e.target.value)}
              placeholder="Type your trip details or response..."
              className="flex-1 bg-transparent text-[15px] text-slate-900 dark:text-slate-100 placeholder:text-slate-400 dark:placeholder:text-slate-500 focus:outline-none"
            />
            <button
              type="submit"
              disabled={isLoading || !inputMessage.trim()}
              aria-label="Send"
              className="w-10 h-10 shrink-0 rounded-full bg-gradient-to-br from-indigo-600 to-cyan-500 text-white flex items-center justify-center shadow-md shadow-indigo-300/50 hover:scale-105 active:scale-95 transition disabled:opacity-40 disabled:hover:scale-100 disabled:cursor-not-allowed"
            >
              <ArrowUp className="w-5 h-5" />
            </button>
          </form>
        </div>
      </main>
    </div>
  );
}
