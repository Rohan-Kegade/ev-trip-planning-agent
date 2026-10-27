import { useEffect, useRef, useState } from 'react';
import { MapPin, Route, Battery, Plug, ChevronDown } from 'lucide-react';
import { formatTime } from '../format';

const isSet = (value) => value !== null && value !== undefined;

// One line per stat: icon, value, then the detail. A stat with details is a button that opens them in a
// small panel under it, floating over the chat; the full text is in the tooltip when it is cut off.
// align keeps the panel on screen: cards on the right of the row open it towards the left.
const Stat = ({ id, icon: Icon, label, value, detail, children, tone = 'default', expandable, expanded, onToggle, panel, align, wide }) => {
  const toneClass =
    tone === 'warning'
      ? 'bg-amber-50 border-amber-200/80 dark:bg-amber-950/40 dark:border-amber-900'
      : 'bg-white dark:bg-slate-800/60 border-slate-200/80 dark:border-slate-700/60';
  const content = (
    <>
      <Icon className="w-3.5 h-3.5 shrink-0 text-indigo-500" aria-hidden="true" />
      <span className="sr-only">{label}:</span>
      <span className="min-w-0 flex-1 truncate text-xs">
        <span className={`font-semibold ${value ? 'text-slate-900 dark:text-slate-100' : 'text-slate-400 dark:text-slate-500'}`}>{value || '—'}</span>
        {detail && <span className="text-slate-500 dark:text-slate-400"> · {detail}</span>}
      </span>
      {children}
    </>
  );
  const base = `min-w-0 flex items-center gap-2 px-3 py-2 pointer-coarse:py-3 rounded-xl border text-left ${toneClass}`;
  const title = [label, value, detail].filter(Boolean).join(': ');

  if (!expandable) {
    return <div title={title} className={base}>{content}</div>;
  }
  return (
    <div className="relative min-w-0 flex">
      <button
        onClick={() => onToggle(id)}
        title={title}
        aria-expanded={expanded}
        aria-controls={`trip-details-${id}`}
        className={`${base} flex-1 transition hover:border-indigo-300 dark:hover:border-indigo-400 ${
          expanded ? 'ring-2 ring-indigo-200 dark:ring-indigo-500/40 border-indigo-300 dark:border-indigo-400' : ''
        }`}
      >
        {content}
        <ChevronDown className={`w-3.5 h-3.5 shrink-0 text-slate-400 transition-transform ${expanded ? 'rotate-180' : ''}`} aria-hidden="true" />
      </button>
      {expanded && (
        <div
          id={`trip-details-${id}`}
          className={`absolute top-full mt-2 z-10 ${wide ? 'w-96' : 'w-80'} max-w-[calc(100vw-2rem)] max-h-[min(20rem,50vh)] overflow-y-auto
            p-3 rounded-xl bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 shadow-xl shadow-slate-900/10 dark:shadow-black/40 msg-in ${align}`}
        >
          {panel}
        </div>
      )}
    </div>
  );
};

// Which edge each card's panel lines up with: 2 cards per row on small screens, 4 on large ones
const ALIGN = {
  trip: 'left-0',
  route: 'right-0 lg:right-auto lg:left-0',
  battery: 'left-0 lg:left-auto lg:right-0',
  charging: 'right-0',
};

// A label/value row in the details panel
const Row = ({ label, children }) => (
  <div className="flex items-baseline justify-between gap-3 py-1 text-xs border-b border-slate-100 dark:border-slate-700/60 last:border-0">
    <dt className="text-slate-500 dark:text-slate-400">{label}</dt>
    <dd className="font-medium text-slate-900 dark:text-slate-100 text-right">{children}</dd>
  </div>
);

const TripDetails = ({ trip, tripType }) => (
  <dl>
    <Row label="From">{trip.origin || '—'}</Row>
    <Row label="To">{trip.destination || '—'}</Row>
    <Row label="Trip type">{tripType || '—'}</Row>
  </dl>
);

const RouteDetails = ({ route, roundTrip }) => (
  <dl>
    <Row label={roundTrip ? 'Total distance (both ways)' : 'Distance'}>{route.distance} km</Row>
    {roundTrip && <Row label="Each way">{Math.round((route.distance / 2) * 10) / 10} km</Row>}
    <Row label="Driving time">{formatTime(route.time)}</Row>
    {route.time > 0 && <Row label="Average speed">{Math.round(route.distance / (route.time / 60))} km/h</Row>}
  </dl>
);

const BatteryDetails = ({ soc, range, route, plan }) => {
  const shortBy = route && isSet(range) ? Math.round((route.distance - range) * 10) / 10 : null;
  return (
    <dl>
      <Row label="Battery now">{isSet(soc) ? `${soc}%` : '—'}</Row>
      <Row label="Range left">{isSet(range) ? `${range} km` : '—'}</Row>
      {shortBy !== null && (
        <Row label="Range for this trip">
          {shortBy > 0 ? <span className="text-amber-700 dark:text-amber-300">{shortBy} km short</span> : 'Enough, no charging needed'}
        </Row>
      )}
      {plan?.feasible && <Row label="Battery on arrival">{plan.arrival_soc}%</Row>}
    </dl>
  );
};

const ChargingDetails = ({ stations, plan }) => (
  <div className="space-y-2">
    <dl>
      {Array.isArray(stations) && <Row label="Stations along the route">{stations.length}</Row>}
      {plan?.feasible && (
        <>
          <Row label="Charging stops">{plan.stops.length}</Row>
          <Row label="Time charging">{formatTime(plan.charge_minutes)}</Row>
          <Row label="Total trip time">{formatTime(plan.total_minutes)} ({formatTime(plan.drive_minutes)} driving)</Row>
        </>
      )}
      {plan && !plan.feasible && (
        <Row label="Problem">
          <span className="text-amber-700 dark:text-amber-300">No reachable stations km {plan.gap?.from_km}–{plan.gap?.to_km}</span>
        </Row>
      )}
    </dl>
    {plan?.stops?.length > 0 && (
      <ol className="space-y-2">
        {plan.stops.map((stop, i) => (
          <li key={`${stop.id}-${stop.km}`} className="flex gap-3 p-2.5 rounded-xl bg-slate-50 dark:bg-slate-900/60 border border-slate-200/80 dark:border-slate-700/60">
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
    {plan?.feasible && <p className="text-[11px] text-slate-400 dark:text-slate-500">Charging times assume a ~50 kW fast charger.</p>}
  </div>
);

// What the trip looks like so far, shown under the chat title; each card can open its details
export default function TripInfoBar({ state }) {
  const [openCard, setOpenCard] = useState(null);
  const [cardsOpen, setCardsOpen] = useState(false); // phones only; the cards are always shown from sm up
  const barRef = useRef(null);
  const { trip, route, vehicle_state: vehicle, charging_station: stations, charging_plan: plan } = state;

  const tripType = !isSet(trip.is_round_trip) ? null : trip.is_round_trip ? 'Round trip' : 'One way';
  const soc = vehicle?.battery_soc;
  const hasSoc = isSet(soc);
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

  // A card opens only once there is something to show
  const available = {
    trip: Boolean(trip.origin || trip.destination),
    route: Boolean(route),
    battery: hasSoc || isSet(range),
    charging: Boolean(plan) || Array.isArray(stations),
  };
  // Closes by itself if its data goes away (e.g. after "make changes")
  const shown = openCard && available[openCard] ? openCard : null;
  const toggle = (id) => setOpenCard((current) => (current === id ? null : id));
  const cardProps = (id) => ({ id, expandable: available[id], expanded: shown === id, onToggle: toggle, align: ALIGN[id] });

  // On phones the cards start collapsed behind a one-line summary, leaving room for the chat
  const tripLabel = trip.origin && trip.destination ? `${trip.origin} → ${trip.destination}` : trip.origin || trip.destination;
  const summary = [
    tripLabel,
    route && `${route.distance} km`,
    hasSoc && `${soc}%`,
    plan?.feasible && (plan.stops.length === 0 ? 'No stops' : `${plan.stops.length} stop${plan.stops.length !== 1 ? 's' : ''}`),
  ].filter(Boolean).join(' · ');
  const toggleCards = () => {
    setOpenCard(null);
    setCardsOpen((open) => !open);
  };

  // The details float over the chat, so a click outside them or Escape closes them
  useEffect(() => {
    if (!shown) return;
    const onPointerDown = (e) => {
      if (!barRef.current?.contains(e.target)) setOpenCard(null);
    };
    const onKeyDown = (e) => {
      if (e.key === 'Escape') setOpenCard(null);
    };
    document.addEventListener('pointerdown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('pointerdown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [shown]);

  return (
    <div ref={barRef} className="relative z-20 border-b border-slate-200/70 dark:border-slate-800 px-4 sm:px-6 py-2">
      <div className="relative max-w-5xl mx-auto">
        <button
          onClick={toggleCards}
          aria-expanded={cardsOpen}
          aria-controls="trip-cards"
          className="sm:hidden w-full flex items-center gap-2 px-3 py-2 pointer-coarse:py-3 rounded-xl border bg-white dark:bg-slate-800/60 border-slate-200/80 dark:border-slate-700/60 text-left"
        >
          <MapPin className="w-3.5 h-3.5 shrink-0 text-indigo-500" aria-hidden="true" />
          <span className={`min-w-0 flex-1 truncate text-xs font-semibold ${summary ? 'text-slate-900 dark:text-slate-100' : 'text-slate-500 dark:text-slate-400'}`}>
            {summary || 'Trip details'}
          </span>
          <span className="shrink-0 text-[11px] text-slate-500 dark:text-slate-400">{cardsOpen ? 'Less' : 'More'}</span>
          <ChevronDown className={`w-3.5 h-3.5 shrink-0 text-slate-400 transition-transform ${cardsOpen ? 'rotate-180' : ''}`} aria-hidden="true" />
        </button>

        <div className="flex flex-col lg:flex-row lg:items-center gap-2">
          <div id="trip-cards" className={`flex-1 min-w-0 grid-cols-2 lg:grid-cols-4 gap-2 sm:grid ${cardsOpen ? 'grid mt-2 sm:mt-0' : 'hidden'}`}>
            <Stat
              {...cardProps('trip')}
              icon={MapPin}
              label="Trip"
              value={trip.origin && trip.destination ? `${trip.origin} → ${trip.destination}` : trip.origin || trip.destination}
              detail={tripType}
              panel={<TripDetails trip={trip} tripType={tripType} />}
            />
            <Stat
              {...cardProps('route')}
              icon={Route}
              label="Route"
              value={route ? `${route.distance} km` : null}
              detail={route ? `${formatTime(route.time)} driving${trip.is_round_trip ? ', both ways' : ''}` : null}
              panel={route && <RouteDetails route={route} roundTrip={Boolean(trip.is_round_trip)} />}
            />
            <Stat
              {...cardProps('battery')}
              icon={Battery}
              label="Battery"
              value={hasSoc ? `${soc}%` : null}
              detail={isSet(range) ? `${range} km range` : null}
              panel={<BatteryDetails soc={soc} range={range} route={route} plan={plan} />}
            >
              {hasSoc && (
                <span className="w-8 h-1.5 shrink-0 rounded-full bg-slate-100 dark:bg-slate-700 overflow-hidden" aria-hidden="true">
                  <span className={`block h-full rounded-full transition-all duration-700 ${socColor}`} style={{ width: `${socWidth}%` }} />
                </span>
              )}
            </Stat>
            <Stat
              {...cardProps('charging')}
              icon={Plug}
              label="Charging"
              value={charging.value}
              detail={charging.detail}
              tone={charging.tone}
              wide
              panel={<ChargingDetails stations={stations} plan={plan} />}
            />
          </div>
        </div>
      </div>
    </div>
  );
}
