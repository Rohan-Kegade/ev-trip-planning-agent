import { Link } from 'react-router-dom';
import { ArrowRight, Battery, MapPin, Plug, Route, MessageSquare, Calculator } from 'lucide-react';
import { Logo, ThemeToggle } from '../components/Brand';
import PlanCard from '../components/PlanCard';
import { PAGE_BG, PRIMARY_BUTTON } from '../styles';
import { useTheme } from '../theme';
import { useAuth } from '../auth';

const FEATURES = [
  {
    icon: Route,
    title: 'Route & distance',
    text: 'Real road distance and drive time for one-way and round trips, from OpenRouteService.',
  },
  {
    icon: Battery,
    title: 'Range check',
    text: 'Tell it your battery level and it works out whether you can make it without stopping.',
  },
  {
    icon: Plug,
    title: 'Charging stops',
    text: 'Finds stations along your route and plans where to stop and how long to charge.',
  },
];

const STEPS = [
  { icon: MessageSquare, title: 'Say where you’re going', text: '“I want to drive from Pune to Mumbai.”' },
  { icon: MapPin, title: 'Confirm the route', text: 'Check the distance and time before anything else is planned.' },
  { icon: Calculator, title: 'Get a charging plan', text: 'Stops, charge times and total travel time, computed in code rather than guessed by the AI.' },
];

// Sample plan for the preview, in the same shape the backend sends, so it is drawn by the real PlanCard
const EXAMPLE_PLAN_CARD = {
  type: 'plan',
  origin: 'Pune',
  destination: 'Mumbai',
  start_soc: 40,
  plan: {
    feasible: true,
    round_trip: false,
    total_km: 148,
    drive_minutes: 150,
    charge_minutes: 30,
    total_minutes: 180,
    arrival_soc: 28,
    gap: null,
    stops: [
      { id: 'example', name: 'Highway fast charger', town: 'Lonavala', km: 64, detour_km: 0.8, leg: 'outbound', arrival_soc: 22, charge_to: 80, charge_minutes: 30 },
    ],
  },
};

// Static preview of the chat, so visitors see what they're signing up for
const ChatPreview = () => (
  <div className="w-full max-w-md rounded-3xl bg-white/80 dark:bg-slate-900/80 backdrop-blur border border-slate-300/70 dark:border-slate-800 shadow-2xl shadow-indigo-200/50 dark:shadow-black/40 p-5 space-y-3">
    <div className="flex justify-end">
      <p className="max-w-[80%] px-4 py-2.5 text-sm bg-gradient-to-br from-indigo-700 to-indigo-600 text-white rounded-2xl rounded-br-md">
        Pune to Mumbai, battery at 40%
      </p>
    </div>
    <div className="flex justify-start">
      <div className="w-full max-w-[92%] px-3.5 py-3 text-sm bg-white dark:bg-slate-800 border border-slate-300/80 dark:border-slate-700 rounded-2xl rounded-bl-md">
        <PlanCard card={EXAMPLE_PLAN_CARD} />
      </div>
    </div>
    <p className="text-[11px] text-center text-slate-500 dark:text-slate-400">Example conversation</p>
  </div>
);

export default function Landing() {
  const [theme, toggleTheme] = useTheme();
  const { user } = useAuth();

  return (
    <div className={PAGE_BG}>
      {/* Full-width line under the nav bar; the content inside stays centred */}
      <header className="border-b border-slate-300/70 dark:border-slate-800">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 py-5 flex items-center justify-between">
          <Logo />
          <nav className="flex items-center gap-1 sm:gap-2">
            <ThemeToggle theme={theme} onToggle={toggleTheme} />
            {user ? (
              <Link to="/app" className={PRIMARY_BUTTON}>Open planner</Link>
            ) : (
              <>
                <Link to="/login" className="px-3 sm:px-4 py-2 text-sm font-medium text-slate-600 dark:text-slate-300 hover:text-indigo-600 dark:hover:text-indigo-300 transition">
                  Log in
                </Link>
                <Link to="/signup" className={PRIMARY_BUTTON}>Sign up</Link>
              </>
            )}
          </nav>
        </div>
      </header>

      <main>
        {/* Hero */}
        <section className="max-w-6xl mx-auto px-4 sm:px-6 pt-10 pb-20 lg:pt-20 grid lg:grid-cols-2 gap-12 items-center">
          <div>
            <p className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-white/80 dark:bg-slate-800/80 border border-slate-300 dark:border-slate-700 text-xs font-medium text-slate-600 dark:text-slate-300">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" /> AI trip planning for EV drivers
            </p>
            <h1 className="mt-5 text-4xl sm:text-5xl font-bold tracking-tight text-slate-900 dark:text-white leading-tight">
              Plan your EV road trip{' '}
              <span className="bg-gradient-to-r from-indigo-600 to-cyan-600 dark:from-indigo-400 dark:to-cyan-300 bg-clip-text text-transparent">
                in one conversation
              </span>
            </h1>
            <p className="mt-5 text-lg text-slate-600 dark:text-slate-400 max-w-xl">
              Tell EVPilot where you’re headed. It works out the route, checks your range, and plans charging stops if you need them.
            </p>
            <div className="mt-8 flex flex-wrap items-center gap-3">
              <Link to={user ? '/app' : '/signup'} className={`${PRIMARY_BUTTON} px-6 py-3 text-base`}>
                {user ? 'Open planner' : 'Start planning, free'} <ArrowRight className="w-4 h-4" />
              </Link>
              {!user && (
                <Link to="/login" className="px-6 py-3 rounded-full text-sm font-semibold text-slate-700 dark:text-slate-200 bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 hover:border-indigo-300 dark:hover:border-indigo-400 transition">
                  I have an account
                </Link>
              )}
            </div>
          </div>
          <div className="flex justify-center lg:justify-end">
            <ChatPreview />
          </div>
        </section>

        {/* Features */}
        <section className="max-w-6xl mx-auto px-4 sm:px-6 pb-20">
          <div className="grid sm:grid-cols-3 gap-4">
            {FEATURES.map(({ icon: Icon, title, text }) => (
              <div key={title} className="p-6 rounded-2xl bg-white/80 dark:bg-slate-900/70 border border-slate-300/80 dark:border-slate-800 shadow-sm">
                <span className="inline-flex p-2.5 rounded-xl bg-indigo-50 dark:bg-indigo-500/10 text-indigo-600 dark:text-indigo-300">
                  <Icon className="w-5 h-5" />
                </span>
                <h3 className="mt-4 font-semibold text-slate-900 dark:text-white">{title}</h3>
                <p className="mt-1.5 text-sm text-slate-600 dark:text-slate-400 leading-relaxed">{text}</p>
              </div>
            ))}
          </div>
        </section>

        {/* How it works */}
        <section className="max-w-6xl mx-auto px-4 sm:px-6 pb-24">
          <h2 className="text-2xl sm:text-3xl font-bold tracking-tight text-slate-900 dark:text-white text-center">How it works</h2>
          <ol className="mt-10 grid sm:grid-cols-3 gap-8">
            {STEPS.map(({ icon: Icon, title, text }, i) => (
              <li key={title} className="text-center">
                <span className="relative inline-flex w-12 h-12 rounded-2xl bg-gradient-to-br from-indigo-600 to-cyan-600 text-white items-center justify-center shadow-md shadow-indigo-300/50 dark:shadow-black/30">
                  <Icon className="w-5 h-5" />
                  <span className="absolute -top-2 -right-2 w-5 h-5 rounded-full bg-white dark:bg-slate-900 text-indigo-600 dark:text-indigo-300 text-[11px] font-bold flex items-center justify-center border border-slate-300 dark:border-slate-700">
                    {i + 1}
                  </span>
                </span>
                <h3 className="mt-4 font-semibold text-slate-900 dark:text-white">{title}</h3>
                <p className="mt-1.5 text-sm text-slate-600 dark:text-slate-400 max-w-xs mx-auto">{text}</p>
              </li>
            ))}
          </ol>
        </section>
      </main>

      <footer className="border-t border-slate-300/70 dark:border-slate-800">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 py-6 flex flex-wrap items-center justify-between gap-3 text-xs text-slate-500 dark:text-slate-400">
          <span>EVPilot · AI EV Trip Planning Agent</span>
          <span>Routes by OpenRouteService · Stations by OpenChargeMap</span>
        </div>
      </footer>
    </div>
  );
}
