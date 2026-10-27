import { Logo, ThemeToggle } from './Brand';
import { PAGE_BG } from '../styles';
import { useTheme } from '../theme';

export const AuthLayout = ({ title, subtitle, children, footer }) => {
  const [theme, toggleTheme] = useTheme();

  return (
    <div className={`${PAGE_BG} flex flex-col`}>
      <header className="max-w-6xl w-full mx-auto px-4 sm:px-6 py-5 flex items-center justify-between">
        <Logo />
        <ThemeToggle theme={theme} onToggle={toggleTheme} />
      </header>
      <main className="flex-1 flex items-center justify-center px-4 pb-16">
        <div className="w-full max-w-sm">
          <div className="text-center mb-6">
            <h1 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-white">{title}</h1>
            <p className="mt-1.5 text-sm text-slate-500 dark:text-slate-400">{subtitle}</p>
          </div>
          <div className="rounded-3xl bg-white/80 dark:bg-slate-900/80 backdrop-blur border border-slate-200/70 dark:border-slate-800 shadow-xl shadow-indigo-100/40 dark:shadow-black/30 p-6">
            {children}
          </div>
          <p className="mt-6 text-center text-sm text-slate-500 dark:text-slate-400">{footer}</p>
        </div>
      </main>
    </div>
  );
};

export const TextField = ({ label, id, ...props }) => (
  <div className="space-y-1.5">
    <label htmlFor={id} className="block text-sm font-medium text-slate-700 dark:text-slate-300">{label}</label>
    <input
      id={id}
      name={id}
      {...props}
      className="w-full px-4 py-2.5 rounded-xl bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-[0.9375rem] pointer-coarse:text-[16px] text-slate-900 dark:text-slate-100 placeholder:text-slate-400 dark:placeholder:text-slate-500 focus:outline-none focus:border-indigo-300 dark:focus:border-indigo-500 focus:ring-4 focus:ring-indigo-100 dark:focus:ring-indigo-500/20 transition"
    />
  </div>
);

export const FormError = ({ message }) =>
  message ? (
    <p role="alert" className="text-sm text-rose-700 dark:text-rose-300 bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-900 rounded-xl px-3 py-2">
      {message}
    </p>
  ) : null;
