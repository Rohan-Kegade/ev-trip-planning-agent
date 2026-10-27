import { Link } from 'react-router-dom';
import { Sun, Moon } from 'lucide-react';

export const Logo = ({ to = '/' }) => (
  <Link to={to} className="text-xl font-bold tracking-tight flex items-center gap-2.5 text-slate-900 dark:text-white">
    <img src="/logo.svg" alt="" className="w-9 h-9 rounded-xl shadow-md shadow-indigo-300/50" />
    <span>
      EV<span className="bg-gradient-to-r from-indigo-600 to-cyan-600 dark:from-indigo-400 dark:to-cyan-300 bg-clip-text text-transparent">Pilot</span>
    </span>
  </Link>
);

export const ThemeToggle = ({ theme, onToggle }) => (
  <button
    onClick={onToggle}
    title={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
    aria-label="Toggle theme"
    className="p-2 text-slate-500 dark:text-slate-400 hover:text-indigo-600 dark:hover:text-indigo-300 rounded-xl hover:bg-indigo-50 dark:hover:bg-slate-800 transition"
  >
    {theme === 'dark' ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
  </button>
);
