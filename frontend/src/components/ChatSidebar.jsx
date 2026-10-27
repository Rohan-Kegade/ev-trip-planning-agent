import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Plus, Trash2, LogOut, Settings, X } from 'lucide-react';
import { Logo, ThemeToggle } from './Brand';
import { Avatar } from './SettingsModal';
import { dayLabel } from '../format';

const groupByDay = (conversations) => {
  const groups = [];
  for (const conversation of conversations) {
    const label = dayLabel(conversation.updated_at);
    const last = groups[groups.length - 1];
    if (last?.label === label) last.items.push(conversation);
    else groups.push({ label, items: [conversation] });
  }
  return groups;
};

function ChatItem({ conversation, active, onNavigate, onDelete }) {
  const [confirming, setConfirming] = useState(false);

  if (confirming) {
    return (
      <div className="flex items-center gap-1 px-3 py-2 rounded-xl bg-rose-50 dark:bg-rose-950/40 text-sm">
        <span className="flex-1 min-w-0 truncate text-rose-800 dark:text-rose-200">Delete this chat?</span>
        <button
          onClick={() => onDelete(conversation.id)}
          className="px-2 py-1 rounded-lg text-xs font-semibold bg-rose-600 hover:bg-rose-700 text-white transition"
        >
          Delete
        </button>
        <button
          onClick={() => setConfirming(false)}
          className="px-2 py-1 rounded-lg text-xs font-medium text-slate-600 dark:text-slate-300 hover:bg-white dark:hover:bg-slate-800 transition"
        >
          Cancel
        </button>
      </div>
    );
  }

  return (
    <div
      className={`group flex items-center rounded-xl transition ${
        active ? 'bg-indigo-50 dark:bg-indigo-500/15' : 'hover:bg-slate-100/80 dark:hover:bg-slate-800/70'
      }`}
    >
      <Link
        to={`/app/${conversation.id}`}
        onClick={onNavigate}
        aria-current={active ? 'page' : undefined}
        className={`flex-1 min-w-0 px-3 py-2 text-sm truncate ${
          active ? 'font-medium text-indigo-700 dark:text-indigo-200' : 'text-slate-700 dark:text-slate-300'
        }`}
        title={conversation.title}
      >
        {conversation.title}
        {conversation.ended && <span className="ml-1.5 text-[11px] text-slate-400 dark:text-slate-500">· ended</span>}
      </Link>
      <button
        onClick={() => setConfirming(true)}
        aria-label={`Delete ${conversation.title}`}
        title="Delete chat"
        className="p-1.5 mr-1 rounded-lg text-slate-400 hover:text-rose-600 dark:hover:text-rose-300 hover:bg-white dark:hover:bg-slate-800 opacity-0 group-hover:opacity-100 focus:opacity-100 transition"
      >
        <Trash2 className="w-3.5 h-3.5" />
      </button>
    </div>
  );
}

export default function ChatSidebar({
  conversations, loading, activeId, onNewTrip, onNavigate, onDelete, user, theme, onToggleTheme, onOpenSettings, onLogout, open, onClose,
}) {
  return (
    <>
      {/* Backdrop for the slide-in sidebar on small screens */}
      {open && <div className="fixed inset-0 z-30 bg-slate-900/40 md:hidden" onClick={onClose} aria-hidden="true" />}

      <aside
        className={`fixed inset-y-0 left-0 z-40 w-80 max-w-[85vw] md:static md:z-auto md:m-3 md:mr-0 md:max-w-none flex flex-col
          bg-white dark:bg-slate-900 md:bg-white/80 md:dark:bg-slate-900/80 md:backdrop-blur md:rounded-3xl
          border-r md:border border-slate-200/70 dark:border-slate-800 md:shadow-xl md:shadow-indigo-100/40 md:dark:shadow-black/30
          transition-transform duration-200 ${open ? 'translate-x-0' : '-translate-x-full md:translate-x-0'}`}
      >
        <div className="p-5 pb-3 flex items-center justify-between">
          <Logo to="/app" />
          <div className="flex items-center gap-1">
            <ThemeToggle theme={theme} onToggle={onToggleTheme} />
            <button
              onClick={onClose}
              aria-label="Close sidebar"
              className="p-2 md:hidden text-slate-500 dark:text-slate-400 rounded-xl hover:bg-slate-100 dark:hover:bg-slate-800 transition"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        <div className="px-5">
          <button
            onClick={onNewTrip}
            className="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-gradient-to-br from-indigo-600 to-cyan-600 text-white text-sm font-semibold shadow-md shadow-indigo-300/40 dark:shadow-black/30 hover:scale-[1.02] active:scale-95 transition"
          >
            <Plus className="w-4 h-4" /> New trip
          </button>
        </div>

        <nav className="flex-1 min-h-0 overflow-y-auto px-3 py-4" aria-label="Chats">
          <p className="px-2 mb-2 text-[11px] font-semibold uppercase tracking-widest text-slate-500 dark:text-slate-400">Chats</p>
          {loading ? (
            <div className="space-y-2 px-2" aria-hidden="true">
              {[0, 1, 2].map((i) => <div key={i} className="h-8 rounded-xl bg-slate-100 dark:bg-slate-800 animate-pulse" />)}
            </div>
          ) : conversations.length === 0 ? (
            <p className="px-2 text-sm text-slate-500 dark:text-slate-400">Your trips will appear here.</p>
          ) : (
            groupByDay(conversations).map((group) => (
              <div key={group.label} className="mb-3">
                <p className="px-2 mb-1 text-[11px] font-semibold uppercase tracking-wider text-indigo-600 dark:text-indigo-300">{group.label}</p>
                <div className="space-y-0.5">
                  {group.items.map((conversation) => (
                    <ChatItem
                      key={conversation.id}
                      conversation={conversation}
                      active={conversation.id === activeId}
                      onNavigate={onNavigate}
                      onDelete={onDelete}
                    />
                  ))}
                </div>
              </div>
            ))
          )}
        </nav>

        <div className="p-5 pt-4 border-t border-slate-100 dark:border-slate-800">
          <div className="flex items-center gap-2.5">
            <Avatar name={user.name} />
            <div className="min-w-0 flex-1 text-sm">
              <p className="font-medium text-slate-900 dark:text-slate-100 truncate">{user.name}</p>
              <p className="text-xs text-slate-500 dark:text-slate-400 truncate">{user.email}</p>
            </div>
            <button
              onClick={onOpenSettings}
              title="Settings"
              aria-label="Settings"
              className="p-2 text-slate-500 dark:text-slate-400 hover:text-indigo-600 dark:hover:text-indigo-300 rounded-xl hover:bg-indigo-50 dark:hover:bg-slate-800 transition"
            >
              <Settings className="w-4 h-4" />
            </button>
            <button
              onClick={onLogout}
              title="Log out"
              aria-label="Log out"
              className="p-2 text-slate-500 dark:text-slate-400 hover:text-rose-600 dark:hover:text-rose-300 rounded-xl hover:bg-rose-50 dark:hover:bg-slate-800 transition"
            >
              <LogOut className="w-4 h-4" />
            </button>
          </div>

          <div className="text-[11px] text-slate-500 dark:text-slate-400 pt-4 mt-4 border-t border-slate-100 dark:border-slate-800 tracking-wide flex items-center justify-center gap-2">
            <span className="relative flex w-2 h-2" aria-hidden="true">
              <span className="absolute inline-flex h-full w-full rounded-full bg-emerald-500 opacity-75 animate-ping" />
              <span className="relative inline-flex w-2 h-2 rounded-full bg-emerald-500" />
            </span>
            <span className="shimmer-text font-medium">AI EV Trip Planning Agent</span>
          </div>
        </div>
      </aside>
    </>
  );
}
