import React, { useState, useRef, useEffect } from 'react';
import { Send, Battery, MapPin, Zap, RefreshCw } from 'lucide-react';

const API_URL = 'http://localhost:8000/chat';

export default function App() {
  const [inputMessage, setInputMessage] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  
  // Entire LangGraph state maintained locally
  const [graphState, setGraphState] = useState({
    trip: { origin: null, destination: null, is_round_trip: null },
    route: null,
    messages: [],
    trip_details_retrieved: false,
    route_details_found: false,
    route_approved: false,
    charging_station: null,
    vehicle_state: { battery_soc: null, range_left: null },
  });

  const chatEndRef = useRef(null);

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
      route_details_found: false,
      route_approved: false,
      charging_station: null,
      vehicle_state: { battery_soc: null, range_left: null },
    });
  };

  return (
    <div className="flex h-screen bg-slate-100 text-slate-800 font-sans">
      
      {/* Sidebar - Real-Time Graph State */}
      <aside className="w-80 bg-white border-r border-slate-200 p-4 flex flex-col justify-between overflow-y-auto">
        <div>
          <div className="flex items-center justify-between mb-6 pb-4 border-b">
            <h1 className="text-xl font-bold flex items-center gap-2 text-indigo-600">
              <img src="/logo.svg" alt="" className="w-8 h-8" /> Voltway
            </h1>
            <button 
              onClick={resetSession}
              title="Reset Session"
              className="p-1.5 text-slate-500 hover:text-indigo-600 rounded-lg hover:bg-slate-100 transition"
            >
              <RefreshCw className="w-4 h-4" />
            </button>
          </div>

          {/* Trip Info Widget */}
          <div className="mb-4 p-3 bg-slate-50 rounded-xl border border-slate-200">
            <h2 className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2 flex items-center gap-1">
              <MapPin className="w-3.5 h-3.5" /> Trip Details
            </h2>
            <div className="space-y-1 text-sm">
              <p><span className="text-slate-500">From:</span> <strong className="text-slate-700">{graphState.trip?.origin || '—'}</strong></p>
              <p><span className="text-slate-500">To:</span> <strong className="text-slate-700">{graphState.trip?.destination || '—'}</strong></p>
              <p><span className="text-slate-500">Type:</span> <strong className="text-slate-700">{graphState.trip?.is_round_trip !== null ? (graphState.trip.is_round_trip ? 'Round Trip' : 'One Way') : '—'}</strong></p>
            </div>
          </div>

          {/* Route Stats Widget */}
          {graphState.route && (
            <div className="mb-4 p-3 bg-indigo-50 rounded-xl border border-indigo-100">
              <h2 className="text-xs font-semibold text-indigo-400 uppercase tracking-wider mb-2">Route Summary</h2>
              <div className="space-y-1 text-sm">
                <p><span className="text-indigo-600">Distance:</span> <strong>{graphState.route.distance} km</strong></p>
                <p><span className="text-indigo-600">Est. Time:</span> <strong>{graphState.route.time} mins</strong></p>
              </div>
            </div>
          )}

          {/* Vehicle Status Widget */}
          <div className="mb-4 p-3 bg-slate-50 rounded-xl border border-slate-200">
            <h2 className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2 flex items-center gap-1">
              <Battery className="w-3.5 h-3.5" /> EV Battery
            </h2>
            <div className="space-y-1 text-sm">
              <p><span className="text-slate-500">State of Charge:</span> <strong className="text-slate-700">{graphState.vehicle_state?.battery_soc !== null ? `${graphState.vehicle_state.battery_soc}%` : '—'}</strong></p>
              <p><span className="text-slate-500">Range Left:</span> <strong className="text-slate-700">{graphState.vehicle_state?.range_left !== null ? `${graphState.vehicle_state.range_left} km` : '—'}</strong></p>
            </div>
          </div>

          {/* Found Stations Counter */}
          {graphState.charging_station && graphState.charging_station.length > 0 && (
            <div className="p-3 bg-emerald-50 text-emerald-800 rounded-xl border border-emerald-200 text-sm">
              ⚡ Found <strong>{graphState.charging_station.length}</strong> charging stations along route.
            </div>
          )}
        </div>

        <div className="text-xs text-slate-400 text-center pt-4 border-t">
          Stateless FastAPI + LangGraph
        </div>
      </aside>

      {/* Main Chat Interface */}
      <main className="flex-1 flex flex-col h-full bg-slate-50">
        
        {/* Messages Feed */}
        <div className="flex-1 overflow-y-auto p-6 space-y-4">
          {graphState.messages.length === 0 ? (
            <div className="h-full flex flex-col items-center justify-center text-slate-400">
              <Zap className="w-12 h-12 mb-2 text-slate-300" />
              <p>Start by typing where you want to go (e.g., "Trip from Seattle to Portland")</p>
            </div>
          ) : (
            graphState.messages.map((msg, idx) => (
              <div
                key={idx}
                className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
              >
                <div
                  className={`max-w-xl rounded-2xl px-4 py-3 text-sm shadow-sm ${
                    msg.role === 'user'
                      ? 'bg-indigo-600 text-white rounded-br-none'
                      : 'bg-white text-slate-800 border border-slate-200 rounded-bl-none'
                  }`}
                >
                  {msg.content}
                </div>
              </div>
            ))
          )}

          {isLoading && (
            <div className="flex justify-start">
              <div className="bg-white border border-slate-200 text-slate-400 rounded-2xl rounded-bl-none px-4 py-3 text-sm shadow-sm flex items-center gap-2">
                <span className="animate-pulse">Thinking...</span>
              </div>
            </div>
          )}
          <div ref={chatEndRef} />
        </div>

        {/* Message Input Bar */}
        <div className="p-4 bg-white border-t border-slate-200">
          <form onSubmit={handleSendMessage} className="max-w-4xl mx-auto flex gap-2">
            <input
              type="text"
              value={inputMessage}
              onChange={(e) => setInputMessage(e.target.value)}
              placeholder="Type your trip details or response..."
              className="flex-1 border border-slate-300 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition"
              // disabled={isLoading}
            />
            <button
              type="submit"
              disabled={isLoading || !inputMessage.trim()}
              className="bg-indigo-600 hover:bg-indigo-700 text-white px-5 py-3 rounded-xl transition font-medium text-sm flex items-center gap-1 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <Send className="w-4 h-4" /> Send
            </button>
          </form>
        </div>
      </main>
    </div>
  );
}