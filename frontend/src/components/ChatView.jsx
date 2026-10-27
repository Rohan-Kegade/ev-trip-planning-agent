import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowUp, Bot, Menu, Sparkles, Lock } from 'lucide-react';
import { ThemeToggle } from './Brand';
import InputRequest from './InputRequest';
import MessageContent, { MapsButton } from './MessageContent';
import TripInfoBar from './TripInfoBar';
import { PRIMARY_BUTTON } from '../styles';
import { formatDateTime } from '../format';
import { useAuth } from '../auth';
import { cacheConversation, getCachedConversation } from '../conversationCache';

const SUGGESTIONS = [
  'Trip from Mumbai to Pune',
  'Plan a round trip from Delhi to Jaipur',
  'Help me pick a weekend destination near Bengaluru',
];

const EMPTY_STATE = {
  trip: { origin: null, destination: null, is_round_trip: null },
  route: null,
  messages: [],
  charging_station: null,
  charging_plan: null,
  vehicle_state: { battery_soc: null, range_left: null },
  maps_url: null,
};

const BotAvatar = () => (
  <span className="w-8 h-8 shrink-0 rounded-full bg-gradient-to-br from-indigo-600 to-cyan-600 text-white flex items-center justify-center shadow-md shadow-indigo-200 dark:shadow-black/30">
    <Bot className="w-4 h-4" />
  </span>
);

// One chat: a saved conversation (conversationId) or a new one (null) that is saved on the first message.
// The server owns the trip state; this only sends the new message and shows what comes back.
export default function ChatView({ conversationId, summary, onSaved, onCreated, onNewTrip, onOpenSidebar, theme, onToggleTheme }) {
  const { authRequest } = useAuth();
  const navigate = useNavigate();
  // A chat opened earlier in this tab shows at once and refreshes in the background
  const [cached] = useState(() => (conversationId ? getCachedConversation(conversationId) : null));
  // The title and date come from the sidebar list straight away, before the chat itself has loaded
  const [conversation, setConversation] = useState(cached?.conversation ?? summary ?? null);
  const [graphState, setGraphState] = useState(cached?.state ?? EMPTY_STATE);
  // How the backend wants the next answer collected: a list of options or battery/range inputs
  const [inputRequest, setInputRequest] = useState(cached?.input_request ?? null);
  const [opening, setOpening] = useState(Boolean(conversationId && !cached));
  const [showSkeleton, setShowSkeleton] = useState(false);
  // Messages that were already there when the chat opened appear as they are; only new ones animate in
  const [historyCount, setHistoryCount] = useState(cached?.state.messages.length ?? 0);
  const [openError, setOpenError] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [inputMessage, setInputMessage] = useState('');
  const chatEndRef = useRef(null);
  const inputRef = useRef(null);
  // Only a chat opened from the list is fetched; one created here already has its data
  const shouldFetch = useRef(Boolean(conversationId));
  // Set once the user sends a message, so a slower background refresh cannot overwrite the reply
  const hasSent = useRef(false);

  const remember = (data) => cacheConversation(data.conversation.id, data);

  useEffect(() => {
    if (!shouldFetch.current) return;
    let cancelled = false;
    authRequest(`/conversations/${conversationId}`)
      .then((data) => {
        if (cancelled || hasSent.current) return;
        shouldFetch.current = false;
        cacheConversation(conversationId, data);
        setConversation(data.conversation);
        setGraphState(data.state);
        setInputRequest(data.input_request ?? null);
        setHistoryCount(data.state.messages.length);
      })
      .catch((err) => {
        if (cancelled) return;
        if (err.status === 404) navigate('/app', { replace: true });
        else setOpenError(err.message);
      })
      .finally(() => {
        if (!cancelled) setOpening(false);
      });
    return () => {
      cancelled = true;
    };
  }, [conversationId, authRequest, navigate]);

  // A quick load shows no skeleton at all; it only appears if opening takes a noticeable moment
  useEffect(() => {
    if (!opening) return;
    const timer = setTimeout(() => setShowSkeleton(true), 200);
    return () => clearTimeout(timer);
  }, [opening]);

  // Opening a chat jumps straight to the latest message; only messages arriving after that scroll smoothly
  const hasScrolled = useRef(false);
  useEffect(() => {
    if (graphState.messages.length === 0) return;
    chatEndRef.current?.scrollIntoView({ behavior: hasScrolled.current ? 'smooth' : 'auto' });
    hasScrolled.current = true;
  }, [graphState.messages, isLoading]);

  const ended = Boolean(conversation?.ended);

  // typed: sent from the input. Only then is the input refocused, to keep typing; an option,
  // card or suggestion tapped on a phone would otherwise pop up the keyboard for no reason.
  const sendMessage = async (text, { typed = false } = {}) => {
    if (!text.trim() || isLoading || ended) return;

    hasSent.current = true;
    setInputMessage('');
    setInputRequest(null);
    if (typed) inputRef.current?.focus();
    setIsLoading(true);

    const withUserMessage = [...graphState.messages, { role: 'user', content: text }];
    setGraphState((prev) => ({ ...prev, messages: withUserMessage }));

    try {
      const data = await authRequest('/chat', { body: { conversation_id: conversation?.id ?? null, message: text } });
      remember(data);
      setGraphState(data.state);
      setInputRequest(data.input_request ?? null);
      setConversation(data.conversation);
      onSaved(data.conversation);
      if (!conversation) {
        onCreated(data.conversation.id);
        navigate(`/app/${data.conversation.id}`, { replace: true });
      }
    } catch (err) {
      if (err.status === 409) setConversation((c) => ({ ...c, ended: true }));
      // Shown here only; the server keeps the conversation as it was before this message
      setGraphState((prev) => ({ ...prev, messages: [...withUserMessage, { role: 'assistant', content: `⚠️ ${err.message}` }] }));
    } finally {
      setIsLoading(false);
    }
  };

  const endChat = async () => {
    setInputRequest(null);
    try {
      const endedSummary = await authRequest(`/conversations/${conversation.id}/end`, { method: 'POST' });
      remember({ conversation: endedSummary, state: graphState, input_request: null });
      setConversation(endedSummary);
      onSaved(endedSummary);
    } catch (err) {
      setGraphState((prev) => ({ ...prev, messages: [...prev.messages, { role: 'assistant', content: `⚠️ ${err.message}` }] }));
    }
  };

  const handleAction = (action) => {
    if (action === 'new_trip') onNewTrip();
    else if (action === 'end_chat') endChat();
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    sendMessage(inputMessage, { typed: true });
  };

  const typeInstead = () => {
    setInputRequest(null);
    inputRef.current?.focus();
  };

  const messages = graphState.messages;

  return (
    <main className="flex-1 flex flex-col h-full min-w-0">
      {/* Title */}
      <header className="px-4 sm:px-6 py-2 border-b border-slate-200/70 dark:border-slate-800 flex items-center gap-3">
        <button
          onClick={onOpenSidebar}
          aria-label="Open chats"
          className="p-2 pointer-coarse:p-3 -ml-2 md:hidden text-slate-500 dark:text-slate-400 rounded-xl hover:bg-slate-100 dark:hover:bg-slate-800 transition"
        >
          <Menu className="w-5 h-5" />
        </button>
        <div className="min-w-0 flex-1">
          <h1 className="font-semibold text-slate-900 dark:text-white truncate">
            {conversation?.title ?? (opening ? ' ' : 'New trip')}
          </h1>
          <p className="text-xs text-slate-500 dark:text-slate-400 truncate">
            {conversation ? `Created ${formatDateTime(conversation.created_at)}` : opening ? ' ' : 'Not saved yet'}
          </p>
        </div>
        {ended && (
          <span className="shrink-0 inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300">
            <Lock className="w-3 h-3" /> Ended
          </span>
        )}
        {graphState.maps_url && <MapsButton href={graphState.maps_url} variant="compact" />}
        <ThemeToggle theme={theme} onToggle={onToggleTheme} />
      </header>

      {/* What we know about the trip so far */}
      <TripInfoBar state={graphState} />

      {/* Messages */}
      <div className="flex-1 overflow-y-auto px-4 sm:px-6 pt-6 pb-4">
        <div className="max-w-4xl mx-auto space-y-5 min-h-full flex flex-col">
          {opening ? (
            showSkeleton && (
              <div className="space-y-4" aria-label="Loading chat">
                {[0, 1, 2].map((i) => (
                  <div key={i} className={`h-12 rounded-2xl bg-slate-100 dark:bg-slate-800 animate-pulse ${i % 2 ? 'ml-auto w-1/2' : 'w-2/3'}`} />
                ))}
              </div>
            )
          ) : openError ? (
            <div className="flex-1 flex flex-col items-center justify-center text-center gap-3">
              <p className="text-slate-600 dark:text-slate-300">Couldn’t open this chat: {openError}</p>
              <button onClick={onNewTrip} className={PRIMARY_BUTTON}>Start a new trip</button>
            </div>
          ) : messages.length === 0 ? (
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
                    onClick={() => sendMessage(text)}
                    className="px-4 py-2 rounded-full bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-sm text-slate-600 dark:text-slate-300 hover:border-indigo-300 dark:hover:border-indigo-400 hover:text-indigo-600 dark:hover:text-indigo-300 hover:shadow-md transition flex items-center gap-1.5"
                  >
                    <Sparkles className="w-3.5 h-3.5" /> {text}
                  </button>
                ))}
              </div>
            </div>
          ) : (
            messages.map((msg, idx) => {
              const isUser = msg.role === 'user';
              return (
                <div key={idx} className={`flex items-end gap-2.5 ${idx >= historyCount ? 'msg-in' : ''} ${isUser ? 'justify-end' : 'justify-start'}`}>
                  {!isUser && <BotAvatar />}
                  <div
                    className={`max-w-[85%] sm:max-w-[75%] px-3.5 py-2.5 text-sm leading-relaxed ${
                      isUser
                        ? 'bg-gradient-to-br from-indigo-700 to-indigo-600 text-white rounded-2xl rounded-br-md shadow-md shadow-indigo-300/40 dark:shadow-black/30'
                        : 'bg-white text-slate-800 dark:bg-slate-800 dark:text-slate-100 border border-slate-200/80 dark:border-slate-700 rounded-2xl rounded-bl-md shadow-sm'
                    }`}
                  >
                    <MessageContent content={msg.content} markdown={!isUser} card={msg.card} />
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

      {/* Answer card and input, or the ended notice */}
      <div className="px-4 sm:px-6 pb-6 pt-2">
        {ended ? (
          <div className="max-w-4xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-3 p-4 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 shadow-sm">
            <p className="text-sm text-slate-600 dark:text-slate-300 flex items-center gap-2">
              <Lock className="w-4 h-4 text-slate-400" /> This chat has ended. You can still read it.
            </p>
            <button onClick={onNewTrip} className={PRIMARY_BUTTON}>Plan a new trip</button>
          </div>
        ) : (
          <>
            {!isLoading && !opening && inputRequest && (
              <InputRequest
                key={messages.length}
                request={inputRequest}
                onSubmit={sendMessage}
                onAction={handleAction}
                onTypeInstead={typeInstead}
                onDismiss={() => setInputRequest(null)}
              />
            )}
            <form
              onSubmit={handleSubmit}
              className="max-w-4xl mx-auto flex items-stretch gap-2 p-2 pl-5 bg-white dark:bg-slate-900 rounded-full border border-slate-200 dark:border-slate-700 shadow-lg shadow-indigo-100/50 dark:shadow-black/30 focus-within:border-indigo-300 dark:focus-within:border-indigo-500 focus-within:ring-4 focus-within:ring-indigo-100 dark:focus-within:ring-indigo-500/20 transition"
            >
              <input
                ref={inputRef}
                data-chat-input
                type="text"
                value={inputMessage}
                disabled={opening || Boolean(openError)}
                onChange={(e) => setInputMessage(e.target.value)}
                placeholder={inputRequest ? 'Or type your answer...' : 'Type your trip details...'}
                aria-label="Message"
                // Fills the pill's height so tapping anywhere on it focuses the field; 16px on touch screens,
                // since iOS zooms the page when a smaller field is tapped
                className="flex-1 min-w-0 bg-transparent text-sm pointer-coarse:text-[16px] text-slate-900 dark:text-slate-100 placeholder:text-slate-500 dark:placeholder:text-slate-400 focus:outline-none disabled:cursor-not-allowed"
              />
              <button
                type="submit"
                disabled={isLoading || !inputMessage.trim()}
                aria-label="Send"
                className="w-10 h-10 shrink-0 rounded-full bg-gradient-to-br from-indigo-600 to-cyan-600 text-white flex items-center justify-center shadow-md shadow-indigo-300/50 dark:shadow-black/30 hover:scale-105 active:scale-95 transition disabled:opacity-40 disabled:hover:scale-100 disabled:cursor-not-allowed"
              >
                <ArrowUp className="w-5 h-5" />
              </button>
            </form>
          </>
        )}
      </div>
    </main>
  );
}
