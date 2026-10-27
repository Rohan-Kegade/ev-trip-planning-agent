import { useCallback, useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import ChatSidebar from './components/ChatSidebar';
import ChatView from './components/ChatView';
import SettingsModal from './components/SettingsModal';
import { useTheme } from './theme';
import { useAuth } from './auth';
import { forgetConversation } from './conversationCache';

const byNewest = (a, b) => (a.updated_at < b.updated_at ? 1 : -1);

// Remembered per browser; a convenience only, so it falls back to expanded if storage is unavailable
const COLLAPSED_KEY = 'evpilot_sidebar_collapsed';

const readCollapsed = () => {
  try {
    return localStorage.getItem(COLLAPSED_KEY) === '1';
  } catch {
    return false;
  }
};

export default function App() {
  const { conversationId = null } = useParams();
  const navigate = useNavigate();
  const [theme, toggleTheme] = useTheme();
  const { user, logout, authRequest } = useAuth();
  const [conversations, setConversations] = useState([]);
  const [listLoading, setListLoading] = useState(true);
  const [sidebarOpen, setSidebarOpen] = useState(false); // slide-in sidebar on small screens
  const [sidebarCollapsed, setSidebarCollapsed] = useState(readCollapsed); // icon rail on wider screens
  const [settingsOpen, setSettingsOpen] = useState(false);
  // The new-chat view keeps its key when its first message creates a conversation and the URL
  // changes to it, so the chat is not remounted (and refetched) mid-conversation
  const [draft, setDraft] = useState({ key: 0, createdId: null });

  useEffect(() => {
    authRequest('/conversations')
      .then(setConversations)
      .catch(() => {}) // the list stays empty; opening and sending chats still work
      .finally(() => setListLoading(false));
  }, [authRequest]);

  // Add or update a chat in the list (new chat, new title, ended)
  const upsertConversation = useCallback((summary) => {
    setConversations((list) => [summary, ...list.filter((c) => c.id !== summary.id)].sort(byNewest));
  }, []);

  const startNewTrip = () => {
    setDraft((d) => ({ key: d.key + 1, createdId: null }));
    setSidebarOpen(false);
    navigate('/app');
  };

  const deleteConversation = async (id) => {
    try {
      await authRequest(`/conversations/${id}`, { method: 'DELETE' });
    } catch (err) {
      if (err.status !== 404) return; // keep it listed if it could not be deleted
    }
    forgetConversation(id);
    setConversations((list) => list.filter((c) => c.id !== id));
    if (id === conversationId) startNewTrip();
  };

  const toggleSidebarCollapsed = () => {
    const next = !sidebarCollapsed;
    setSidebarCollapsed(next);
    try {
      localStorage.setItem(COLLAPSED_KEY, next ? '1' : '0');
    } catch {
      // storage unavailable; the choice just isn't remembered
    }
  };

  const handleLogout = () => {
    logout();
    navigate('/');
  };

  const viewKey = !conversationId || conversationId === draft.createdId ? `new-${draft.key}` : conversationId;

  return (
    // h-dvh: the height actually visible on phones, between the browser's address and tool bars
    <div className="flex h-dvh bg-gradient-to-br from-slate-50 via-indigo-50/40 to-cyan-50/40 text-slate-800 dark:from-slate-950 dark:via-slate-900 dark:to-slate-950 dark:text-slate-200 font-sans antialiased">
      <ChatSidebar
        conversations={conversations}
        loading={listLoading}
        activeId={conversationId}
        onNewTrip={startNewTrip}
        onNavigate={() => setSidebarOpen(false)}
        onDelete={deleteConversation}
        user={user}
        onOpenSettings={() => setSettingsOpen(true)}
        onLogout={handleLogout}
        open={sidebarOpen}
        onClose={() => setSidebarOpen(false)}
        collapsed={sidebarCollapsed}
        onToggleCollapsed={toggleSidebarCollapsed}
      />

      <ChatView
        key={viewKey}
        conversationId={conversationId}
        summary={conversations.find((c) => c.id === conversationId) ?? null}
        onSaved={upsertConversation}
        onCreated={(id) => setDraft((d) => ({ ...d, createdId: id }))}
        onNewTrip={startNewTrip}
        onOpenSidebar={() => setSidebarOpen(true)}
        theme={theme}
        onToggleTheme={toggleTheme}
      />

      {settingsOpen && <SettingsModal onClose={() => setSettingsOpen(false)} />}
    </div>
  );
}
