import { useCallback, useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import ChatSidebar from './components/ChatSidebar';
import ChatView from './components/ChatView';
import SettingsModal from './components/SettingsModal';
import { useTheme } from './theme';
import { useAuth } from './auth';

const byNewest = (a, b) => (a.updated_at < b.updated_at ? 1 : -1);

export default function App() {
  const { conversationId = null } = useParams();
  const navigate = useNavigate();
  const [theme, toggleTheme] = useTheme();
  const { user, logout, authRequest } = useAuth();
  const [conversations, setConversations] = useState([]);
  const [listLoading, setListLoading] = useState(true);
  const [sidebarOpen, setSidebarOpen] = useState(false);
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
    setConversations((list) => list.filter((c) => c.id !== id));
    if (id === conversationId) startNewTrip();
  };

  const handleLogout = () => {
    logout();
    navigate('/');
  };

  const viewKey = !conversationId || conversationId === draft.createdId ? `new-${draft.key}` : conversationId;

  return (
    <div className="flex h-screen bg-gradient-to-br from-slate-50 via-indigo-50/40 to-cyan-50/40 text-slate-800 dark:from-slate-950 dark:via-slate-900 dark:to-slate-950 dark:text-slate-200 font-sans antialiased">
      <ChatSidebar
        conversations={conversations}
        loading={listLoading}
        activeId={conversationId}
        onNewTrip={startNewTrip}
        onNavigate={() => setSidebarOpen(false)}
        onDelete={deleteConversation}
        user={user}
        theme={theme}
        onToggleTheme={toggleTheme}
        onOpenSettings={() => setSettingsOpen(true)}
        onLogout={handleLogout}
        open={sidebarOpen}
        onClose={() => setSidebarOpen(false)}
      />

      <ChatView
        key={viewKey}
        conversationId={conversationId}
        onSaved={upsertConversation}
        onCreated={(id) => setDraft((d) => ({ ...d, createdId: id }))}
        onNewTrip={startNewTrip}
        onOpenSidebar={() => setSidebarOpen(true)}
      />

      {settingsOpen && <SettingsModal onClose={() => setSettingsOpen(false)} />}
    </div>
  );
}
