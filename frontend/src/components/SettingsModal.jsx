import { useEffect, useState } from 'react';
import { X, User, KeyRound, UserX, Lock, Check } from 'lucide-react';
import { TextField, FormError } from './AuthLayout';
import { PRIMARY_BUTTON } from '../styles';
import { useAuth } from '../auth';

const MIN_PASSWORD_LENGTH = 8;

const TABS = [
  { id: 'profile', label: 'Profile', icon: User },
  { id: 'password', label: 'Password', icon: KeyRound },
  { id: 'delete', label: 'Delete account', shortLabel: 'Delete', icon: UserX, danger: true },
];

export const Avatar = ({ name, size = 'w-9 h-9 text-sm' }) => (
  <span className={`${size} shrink-0 rounded-full bg-indigo-50 dark:bg-indigo-500/15 text-indigo-600 dark:text-indigo-300 font-semibold flex items-center justify-center`}>
    {name?.trim()?.[0]?.toUpperCase() || '?'}
  </span>
);

const formatDate = (iso) =>
  iso ? new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }) : null;

const SectionHeader = ({ title, subtitle }) => (
  <div className="mb-5">
    <h3 className="font-semibold text-slate-900 dark:text-white">{title}</h3>
    <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">{subtitle}</p>
  </div>
);

const Saved = ({ show, children }) =>
  show ? (
    <p role="status" className="text-sm text-emerald-700 dark:text-emerald-300 flex items-center gap-1.5">
      <Check className="w-4 h-4" /> {children}
    </p>
  ) : null;

// Shared submit handling: busy flag, error message, and a success flag that clears on the next edit
const useFormStatus = () => {
  const [state, setState] = useState({ busy: false, error: '', saved: false });
  const run = async (action) => {
    setState({ busy: true, error: '', saved: false });
    try {
      await action();
      setState({ busy: false, error: '', saved: true });
    } catch (err) {
      setState({ busy: false, error: err.message, saved: false });
    }
  };
  const fail = (error) => setState({ busy: false, error, saved: false });
  const reset = () => setState((s) => (s.saved || s.error ? { ...s, saved: false, error: '' } : s));
  return { ...state, run, fail, reset };
};

function ProfileTab() {
  const { user, updateProfile } = useAuth();
  const [name, setName] = useState(user.name);
  const status = useFormStatus();
  const memberSince = formatDate(user.created_at);
  const unchanged = name.trim() === user.name;

  const handleSubmit = (e) => {
    e.preventDefault();
    status.run(() => updateProfile({ name }));
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      <SectionHeader title="Profile" subtitle="Your name and the email you log in with." />
      <div className="flex items-center gap-3">
        <Avatar name={user.name} size="w-12 h-12 text-base" />
        <div className="min-w-0">
          <p className="font-medium text-slate-900 dark:text-slate-100 truncate">{user.name}</p>
          {memberSince && <p className="text-xs text-slate-500 dark:text-slate-400">Member since {memberSince}</p>}
        </div>
      </div>
      <FormError message={status.error} />
      <TextField
        label="Name"
        id="settings-name"
        type="text"
        autoComplete="name"
        required
        maxLength={100}
        value={name}
        onChange={(e) => { setName(e.target.value); status.reset(); }}
      />
      <div className="space-y-1.5">
        <label htmlFor="settings-email" className="block text-sm font-medium text-slate-700 dark:text-slate-300">Email</label>
        <div className="relative">
          <input
            id="settings-email"
            type="email"
            value={user.email}
            disabled
            className="w-full px-4 py-2.5 pr-10 rounded-xl bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 text-[0.9375rem] text-slate-500 dark:text-slate-400 cursor-not-allowed"
          />
          <Lock className="w-4 h-4 absolute right-3.5 top-1/2 -translate-y-1/2 text-slate-400" aria-hidden="true" />
        </div>
        <p className="text-xs text-slate-500 dark:text-slate-400">Your email can’t be changed.</p>
      </div>
      <div className="flex items-center gap-3">
        <button type="submit" disabled={status.busy || unchanged || !name.trim()} className={PRIMARY_BUTTON}>
          {status.busy ? 'Saving…' : 'Save changes'}
        </button>
        <Saved show={status.saved}>Saved</Saved>
      </div>
    </form>
  );
}

function PasswordTab() {
  const { changePassword } = useAuth();
  const [form, setForm] = useState({ current: '', next: '', confirm: '' });
  const status = useFormStatus();

  const update = (e) => {
    setForm((f) => ({ ...f, [e.target.name]: e.target.value }));
    status.reset();
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    if (form.next.length < MIN_PASSWORD_LENGTH) return status.fail(`New password must be at least ${MIN_PASSWORD_LENGTH} characters.`);
    if (form.next !== form.confirm) return status.fail('New passwords don’t match.');
    status.run(async () => {
      await changePassword({ currentPassword: form.current, newPassword: form.next });
      setForm({ current: '', next: '', confirm: '' });
    });
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <SectionHeader title="Password" subtitle="Enter your current password to choose a new one." />
      <FormError message={status.error} />
      <TextField label="Current password" id="current" type="password" autoComplete="current-password" required value={form.current} onChange={update} />
      <TextField
        label="New password"
        id="next"
        type="password"
        autoComplete="new-password"
        required
        value={form.next}
        onChange={update}
        placeholder={`At least ${MIN_PASSWORD_LENGTH} characters`}
      />
      <TextField label="Confirm new password" id="confirm" type="password" autoComplete="new-password" required value={form.confirm} onChange={update} />
      <div className="flex items-center gap-3 pt-1">
        <button type="submit" disabled={status.busy} className={PRIMARY_BUTTON}>
          {status.busy ? 'Updating…' : 'Update password'}
        </button>
        <Saved show={status.saved}>Password updated</Saved>
      </div>
    </form>
  );
}

function DeleteTab() {
  const { deleteAccount } = useAuth();
  const [password, setPassword] = useState('');
  const status = useFormStatus();

  const handleSubmit = (e) => {
    e.preventDefault();
    // On success the session ends and the app redirects to /login
    status.run(() => deleteAccount({ password }));
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <SectionHeader title="Delete account" subtitle="Permanently remove your account. This can’t be undone." />
      <div className="text-sm text-rose-800 dark:text-rose-200 bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-900 rounded-xl px-4 py-3">
        Your name, email and password will be deleted and you’ll be logged out. You can sign up again with the same email later.
      </div>
      <FormError message={status.error} />
      <TextField
        label="Enter your password to confirm"
        id="delete-password"
        type="password"
        autoComplete="current-password"
        required
        value={password}
        onChange={(e) => { setPassword(e.target.value); status.reset(); }}
      />
      <button
        type="submit"
        disabled={status.busy || !password}
        className="inline-flex items-center justify-center gap-2 px-5 py-2.5 rounded-full bg-rose-600 hover:bg-rose-700 text-white text-sm font-semibold transition disabled:opacity-50 disabled:cursor-not-allowed"
      >
        <UserX className="w-4 h-4" /> {status.busy ? 'Deleting…' : 'Delete my account'}
      </button>
    </form>
  );
}

const TAB_CONTENT = { profile: ProfileTab, password: PasswordTab, delete: DeleteTab };

export default function SettingsModal({ onClose }) {
  const [tab, setTab] = useState('profile');
  const Content = TAB_CONTENT[tab];

  // Close on Escape
  useEffect(() => {
    const onKey = (e) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40 dark:bg-black/60 backdrop-blur-sm"
      onMouseDown={(e) => e.target === e.currentTarget && onClose()}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="settings-title"
        className="w-full max-w-3xl max-h-[90vh] flex flex-col rounded-3xl bg-white dark:bg-slate-900 border border-slate-200/70 dark:border-slate-800 shadow-2xl shadow-indigo-200/30 dark:shadow-black/50 msg-in"
      >
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 dark:border-slate-800">
          <h2 id="settings-title" className="font-semibold text-slate-900 dark:text-white">Settings</h2>
          <button
            onClick={onClose}
            aria-label="Close settings"
            className="p-2 pointer-coarse:p-3 -mr-2 text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white rounded-xl hover:bg-slate-100 dark:hover:bg-slate-800 transition"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="flex flex-col sm:flex-row min-h-0 flex-1">
          {/* Tabs share the width on phones (icon above label) and stack in a column from sm up */}
          <nav className="sm:w-52 shrink-0 p-2 sm:p-3 flex sm:flex-col gap-1 border-b sm:border-b-0 sm:border-r border-slate-100 dark:border-slate-800 bg-slate-50/60 dark:bg-slate-900">
            {TABS.map(({ id, label, shortLabel, icon: Icon, danger }) => {
              const active = tab === id;
              const color = danger
                ? 'text-rose-600 dark:text-rose-400'
                : active
                  ? 'text-indigo-600 dark:text-indigo-300'
                  : 'text-slate-600 dark:text-slate-300';
              return (
                <button
                  key={id}
                  onClick={() => setTab(id)}
                  aria-current={active ? 'page' : undefined}
                  className={`flex-1 sm:flex-none min-w-0 flex flex-col sm:flex-row items-center gap-1 sm:gap-2.5 px-2 sm:px-3 py-2 rounded-xl text-xs sm:text-sm font-medium transition ${color} ${
                    active ? 'bg-white dark:bg-slate-800 shadow-sm' : 'hover:bg-white/70 dark:hover:bg-slate-800/60'
                  }`}
                >
                  <Icon className="w-4 h-4 shrink-0" aria-hidden="true" />
                  {/* Phones get the short label so all three tabs fit in one row */}
                  <span className="truncate max-w-full sm:hidden" aria-hidden="true">{shortLabel ?? label}</span>
                  <span className="truncate max-w-full max-sm:sr-only">{label}</span>
                </button>
              );
            })}
          </nav>
          <div className="flex-1 min-h-[420px] overflow-y-auto p-6">
            <Content key={tab} />
          </div>
        </div>
      </div>
    </div>
  );
}
