import { useState } from 'react';
import { MapPin, Route, Battery, Plug, ChevronDown } from 'lucide-react';
import { MapsButton } from './MessageContent';
import { formatTime } from '../format';

const Stat = ({ icon: Icon, label, value, detail, children, tone = 'default' }) => (
  <div
    className={`min-w-0 p-3 rounded-xl border ${
      tone === 'warning'
        ? 'bg-amber-50 border-amber-200/80 dark:bg-amber-950/40 dark:border-amber-900'
        : 'bg-white dark:bg-slate-800/60 border-slate-200/80 dark:border-slate-700/60'
    }`}
  >
    <p className="text-[11px] font-semibold uppercase tracking-widest text-slate-500 dark:text-slate-400 flex items-center gap-1.5">
      <Icon className="w-3.5 h-3.5 text-indigo-500" /> {label}
    </p>
    <p className={`mt-1 text-sm font-semibold truncate ${value ? 'text-slate-900 dark:text-slate-100' : 'text-slate-400 dark:text-slate-500'}`}>
      {value || '—'}
    </p>
    {detail && <p className="text-xs text-slate-500 dark:text-slate-400 truncate">{detail}</p>}
    {children}
  </div>
);

// What the trip looks like so far, shown under the chat title
export default function TripInfoBar({ state }) {
  const [showStops, setShowStops] = useState(false);
  const { trip, route, vehicle_state: vehicle, charging_station: stations, charging_plan: plan, maps_url: mapsUrl } = state;

  const tripType = trip.is_round_trip === null || trip.is_round_trip === undefined ? null : trip.is_round_trip ? 'Round trip' : 'One way';
  const soc = vehicle?.battery_soc;
  const hasSoc = soc !== null && soc !== undefined;
  const socWidth = hasSoc ? Math.max(0, Math.min(100, soc)) : 0;
  const socColor = socWidth > 50 ? 'bg-emerald-500' : socWidth > 20 ? 'bg-amber-500' : 'bg-rose-500';
  const range = vehicle?.range_left;

  let charging = { value: null, detail: null, tone: 'default' };
  if (plan?.feasible) {
    charging = {
      value: plan.stops.length === 0 ? 'No stops needed' : `${plan.stops.length} stop${plan.stops.length !== 1 ? 's' : ''} · ${formatTime(plan.charge_minutes)} charging`,
      detail: `${formatTime(plan.total_minutes)} total · finish with ${plan.arrival_soc}%`,
    };
  } else if (plan) {
    charging = { value: 'Plan incomplete', detail: `No reachable stations km ${plan.gap?.from_km}–${plan.gap?.to_km}`, tone: 'warning' };
  } else if (Array.isArray(stations) && stations.length === 0) {
    charging = { value: 'No stations found', detail: 'along your route', tone: 'warning' };
  } else if (stations?.length) {
    charging = { value: `${stations.length} station${stations.length !== 1 ? 's' : ''} found`, detail: 'along your route' };
  }

  return (
    <div className="border-b border-slate-200/70 dark:border-slate-800 px-4 sm:px-6 py-3">
      <div className="max-w-5xl mx-auto">
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-2">
          <Stat
            icon={MapPin}
            label="Trip"
            value={trip.origin && trip.destination ? `${trip.origin} → ${trip.destination}` : trip.origin || trip.destination}
            detail={tripType}
          />
          <Stat
            icon={Route}
            label="Route"
            value={route ? `${route.distance} km` : null}
            detail={route ? `${formatTime(route.time)} driving${trip.is_round_trip ? ', both ways' : ''}` : null}
          />
          <Stat icon={Battery} label="Battery" value={hasSoc ? `${soc}%` : null} detail={range !== null && range !== undefined ? `${range} km range` : null}>
            {hasSoc && (
              <div className="mt-1.5 h-1.5 rounded-full bg-slate-100 dark:bg-slate-700 overflow-hidden">
                <div className={`h-full rounded-full transition-all duration-700 ${socColor}`} style={{ width: `${socWidth}%` }} />
              </div>
            )}
          </Stat>
          <Stat icon={Plug} label="Charging" value={charging.value} detail={charging.detail} tone={charging.tone} />
        </div>

        {(plan?.stops?.length > 0 || mapsUrl) && (
          <div className="mt-2 flex flex-wrap items-center gap-2">
            {plan?.stops?.length > 0 && (
              <button
                onClick={() => setShowStops((v) => !v)}
                aria-expanded={showStops}
                className="px-3 py-1.5 rounded-full text-xs font-medium text-slate-600 dark:text-slate-300 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 hover:border-indigo-300 dark:hover:border-indigo-400 flex items-center gap-1 transition"
              >
                {showStops ? 'Hide' : 'Show'} charging stops
                <ChevronDown className={`w-3.5 h-3.5 transition-transform ${showStops ? 'rotate-180' : ''}`} />
              </button>
            )}
            {mapsUrl && <MapsButton href={mapsUrl} variant="compact" />}
          </div>
        )}

        {showStops && plan?.stops?.length > 0 && (
          <ol className="mt-2 grid sm:grid-cols-2 gap-2 msg-in">
            {plan.stops.map((stop, i) => (
              <li key={`${stop.id}-${stop.km}`} className="flex gap-3 p-3 rounded-xl bg-white dark:bg-slate-800/60 border border-slate-200/80 dark:border-slate-700/60">
                <span className="w-6 h-6 shrink-0 rounded-full bg-indigo-600 text-white text-xs font-bold flex items-center justify-center">{i + 1}</span>
                <div className="min-w-0 text-sm">
                  <p className="font-medium text-slate-900 dark:text-slate-100 truncate">{stop.name || 'Charging station'}</p>
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    {[stop.town, `km ${stop.km}`, plan.round_trip ? `${stop.leg} leg` : null].filter(Boolean).join(' · ')}
                  </p>
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    {stop.arrival_soc}% → {stop.charge_to}% · ~{formatTime(stop.charge_minutes)}
                  </p>
                </div>
              </li>
            ))}
          </ol>
        )}
      </div>
    </div>
  );
}
