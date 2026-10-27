import { Plug, MapPin, Flag, RotateCcw, Clock, BatteryCharging, TriangleAlert } from 'lucide-react';
import { formatTime } from '../format';

const isSet = (value) => value !== null && value !== undefined;

const levelColor = (soc) => (soc > 50 ? 'bg-emerald-500' : soc > 20 ? 'bg-amber-500' : 'bg-rose-500');

// Arrival level, then the part added by charging in a lighter shade
const ChargeBar = ({ from, to }) => (
  <div
    className="relative h-1.5 w-full rounded-full bg-slate-200 dark:bg-slate-700 overflow-hidden"
    role="img"
    aria-label={`Arrive with ${from}%, charge to ${to}%`}
  >
    <div className="absolute inset-y-0 left-0 bg-emerald-300/70 dark:bg-emerald-400/40" style={{ width: `${Math.min(100, to)}%` }} />
    <div className={`absolute inset-y-0 left-0 ${levelColor(from)}`} style={{ width: `${Math.max(0, from)}%` }} />
  </div>
);

const Chip = ({ icon: Icon, label, value }) => (
  <div className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-slate-50 dark:bg-slate-900/60 border border-slate-300/80 dark:border-slate-700/60">
    <Icon className="w-3.5 h-3.5 shrink-0 text-indigo-500" aria-hidden="true" />
    <span className="text-[11px] text-slate-500 dark:text-slate-400">{label}</span>
    <span className="text-xs font-semibold text-slate-900 dark:text-slate-100 tabular-nums">{value}</span>
  </div>
);

// One row of the timeline: a marker on the line, then its content
const Point = ({ marker, last, children }) => (
  <li className="relative flex gap-3 pb-4 last:pb-0">
    {!last && <span className="absolute left-3 top-6 bottom-0 w-px bg-slate-300 dark:bg-slate-700" aria-hidden="true" />}
    <span className="relative z-10 w-6 h-6 shrink-0 rounded-full flex items-center justify-center text-xs font-bold">{marker}</span>
    <div className="min-w-0 flex-1 pt-0.5">{children}</div>
  </li>
);

const placeMarker = (Icon, tone) => (
  <span className={`w-6 h-6 rounded-full flex items-center justify-center ${tone}`}>
    <Icon className="w-3.5 h-3.5" aria-hidden="true" />
  </span>
);

// The charging plan drawn as a card: start, stops in route order, finish, and the totals
export default function PlanCard({ card }) {
  const { plan, origin, destination, start_soc: startSoc } = card;
  const roundTrip = plan.round_trip;
  const outbound = plan.stops.filter((s) => s.leg !== 'return');
  const returning = plan.stops.filter((s) => s.leg === 'return');
  const finishPlace = roundTrip ? origin : destination;

  // Stops are numbered in route order: outbound first, then the way back
  const renderStop = (stop, number) => {
    return (
      <Point key={`${stop.id}-${stop.km}`} marker={<span className="w-6 h-6 rounded-full bg-indigo-600 text-white flex items-center justify-center">{number}</span>}>
        <p className="text-sm font-semibold text-slate-900 dark:text-slate-100 truncate">{stop.name || 'Charging station'}</p>
        <p className="text-xs text-slate-500 dark:text-slate-400 truncate">
          {[stop.town, `km ${stop.km}`, stop.detour_km >= 0.5 ? `${stop.detour_km} km off route` : null].filter(Boolean).join(' · ')}
        </p>
        <div className="mt-1.5 flex items-center gap-2">
          <div className="flex-1 min-w-0"><ChargeBar from={stop.arrival_soc} to={stop.charge_to} /></div>
          <span className="shrink-0 text-xs font-medium text-slate-700 dark:text-slate-200 tabular-nums">
            {stop.arrival_soc}% → {stop.charge_to}%
          </span>
        </div>
        <p className="mt-1 text-xs text-slate-500 dark:text-slate-400 flex items-center gap-1">
          <Clock className="w-3 h-3" aria-hidden="true" /> about {formatTime(stop.charge_minutes)} charging
        </p>
      </Point>
    );
  };

  return (
    <div className="not-prose space-y-3">
      <div className="flex items-start gap-2.5">
        <span className="w-8 h-8 shrink-0 rounded-xl bg-indigo-50 dark:bg-indigo-500/15 text-indigo-600 dark:text-indigo-300 flex items-center justify-center">
          <Plug className="w-4 h-4" aria-hidden="true" />
        </span>
        <div className="min-w-0">
          <p className="text-sm font-semibold text-slate-900 dark:text-white">
            {plan.feasible ? 'Your charging plan' : 'Charging plan incomplete'}
          </p>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            {plan.total_km} km{roundTrip ? ' round trip' : ''} · {plan.stops.length} charging stop{plan.stops.length !== 1 ? 's' : ''}
          </p>
        </div>
      </div>

      {plan.feasible && (
        <div className="flex flex-wrap gap-1.5">
          <Chip icon={Clock} label="Total" value={formatTime(plan.total_minutes)} />
          <Chip icon={Clock} label="Driving" value={formatTime(plan.drive_minutes)} />
          <Chip icon={BatteryCharging} label="Charging" value={formatTime(plan.charge_minutes)} />
        </div>
      )}

      <ol aria-label="Route with charging stops">
        <Point marker={placeMarker(MapPin, 'bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-200')}>
          <p className="text-sm font-medium text-slate-900 dark:text-slate-100">{origin}</p>
          {isSet(startSoc) && <p className="text-xs text-slate-500 dark:text-slate-400">Start with {startSoc}%</p>}
        </Point>

        {outbound.map((stop, i) => renderStop(stop, i + 1))}

        {roundTrip && (
          <Point marker={placeMarker(RotateCcw, 'bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-200')}>
            <p className="text-sm font-medium text-slate-900 dark:text-slate-100">{destination}</p>
            <p className="text-xs text-slate-500 dark:text-slate-400">Turn around</p>
          </Point>
        )}

        {returning.map((stop, i) => renderStop(stop, outbound.length + i + 1))}

        {plan.feasible ? (
          <Point last marker={placeMarker(Flag, 'bg-emerald-100 dark:bg-emerald-500/20 text-emerald-700 dark:text-emerald-300')}>
            <p className="text-sm font-medium text-slate-900 dark:text-slate-100">{finishPlace}</p>
            <p className="text-xs text-slate-500 dark:text-slate-400">Arrive with about {plan.arrival_soc}%</p>
          </Point>
        ) : (
          <Point last marker={placeMarker(TriangleAlert, 'bg-amber-100 dark:bg-amber-500/20 text-amber-700 dark:text-amber-300')}>
            <p className="text-sm font-medium text-amber-800 dark:text-amber-200">
              No reachable stations between km {plan.gap?.from_km} and km {plan.gap?.to_km}
            </p>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Charge more before you leave, or try a different route.
            </p>
          </Point>
        )}
      </ol>

      {plan.feasible && (
        <p className="text-[11px] text-slate-400 dark:text-slate-500">Charging times assume a ~50 kW fast charger and are approximate.</p>
      )}
    </div>
  );
}
