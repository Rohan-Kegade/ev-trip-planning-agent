import { useEffect, useRef, useState } from 'react';
import { ChevronRight, PencilLine, X, Battery, Gauge } from 'lucide-react';
import { PRIMARY_BUTTON } from '../styles';

const RANGE_PRESETS = [50, 100, 150, 200, 300];
const MAX_RANGE_KM = 2000;

// Number keys pick an option unless the user is typing; an empty chat input still counts as not typing
const isTyping = (el) => {
  if (!el || !(el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.isContentEditable)) return false;
  return !('chatInput' in el.dataset && el.value === '');
};

const CardShell = ({ title, onDismiss, children }) => (
  <div className="max-w-4xl mx-auto mb-3 rounded-2xl bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 shadow-lg shadow-indigo-100/50 dark:shadow-black/30 overflow-hidden msg-in">
    <div className="flex items-center justify-between pl-4 pr-1.5 py-1 border-b border-slate-200 dark:border-slate-800">
      <p className="text-[11px] font-semibold uppercase tracking-widest text-slate-500 dark:text-slate-400">{title}</p>
      <button
        onClick={onDismiss}
        aria-label="Hide and type instead"
        title="Hide"
        className="p-1 pointer-coarse:p-2.5 text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 transition"
      >
        <X className="w-4 h-4" />
      </button>
    </div>
    {children}
  </div>
);

// Numbered options plus "Something else"; 1-9 picks an option, arrow keys move between rows.
// An option with an action (e.g. "new_trip") is handled by the page instead of being sent as a message.
function ChoiceCard({ options, onSubmit, onAction, onTypeInstead, onDismiss }) {
  const rowRefs = useRef([]);
  const rowCount = options.length + 1;
  const pick = (option) => (option.action ? onAction(option.action) : onSubmit(option.label));

  useEffect(() => {
    const onKey = (e) => {
      if (isTyping(document.activeElement) || e.metaKey || e.ctrlKey || e.altKey) return;
      const n = Number(e.key);
      if (n >= 1 && n <= options.length) {
        e.preventDefault();
        pick(options[n - 1]);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  const moveFocus = (e, index) => {
    if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return;
    e.preventDefault();
    const next = (index + (e.key === 'ArrowDown' ? 1 : -1) + rowCount) % rowCount;
    rowRefs.current[next]?.focus();
  };

  const rowClass =
    'group w-full flex items-center gap-2.5 px-4 py-1.5 pointer-coarse:py-3 text-left transition hover:bg-indigo-50/70 dark:hover:bg-slate-800 focus:outline-none focus-visible:bg-indigo-50 dark:focus-visible:bg-slate-800';

  return (
    <CardShell title="Choose an answer" onDismiss={onDismiss}>
      <ul className="py-0.5" aria-label="Answer options">
        {options.map((option, i) => (
          <li key={option.label}>
            <button
              ref={(el) => (rowRefs.current[i] = el)}
              onClick={() => pick(option)}
              onKeyDown={(e) => moveFocus(e, i)}
              className={rowClass}
            >
              <span className="w-5 h-5 shrink-0 rounded-md bg-slate-100 dark:bg-slate-800 group-hover:bg-indigo-600 group-hover:text-white group-focus-visible:bg-indigo-600 group-focus-visible:text-white text-xs font-semibold text-slate-600 dark:text-slate-300 flex items-center justify-center transition">
                {i + 1}
              </span>
              <span className="min-w-0 flex-1 truncate text-sm" title={option.description || undefined}>
                <span className="font-medium text-slate-900 dark:text-slate-100">{option.label}</span>
                {option.description && <span className="text-xs text-slate-500 dark:text-slate-400"> · {option.description}</span>}
              </span>
              <ChevronRight className="w-4 h-4 shrink-0 text-slate-300 dark:text-slate-600 group-hover:text-indigo-500 transition" />
            </button>
          </li>
        ))}
        <li className="border-t border-slate-200 dark:border-slate-800 mt-0.5 pt-0.5">
          <button
            ref={(el) => (rowRefs.current[options.length] = el)}
            onClick={onTypeInstead}
            onKeyDown={(e) => moveFocus(e, options.length)}
            className={rowClass}
          >
            <span className="w-5 h-5 shrink-0 rounded-md border border-dashed border-slate-300 dark:border-slate-600 text-slate-400 flex items-center justify-center">
              <PencilLine className="w-3.5 h-3.5" />
            </span>
            <span className="min-w-0 flex-1 truncate text-sm">
              <span className="font-medium text-slate-700 dark:text-slate-200">Something else</span>
              <span className="text-xs text-slate-500 dark:text-slate-400"> · Type your own answer</span>
            </span>
          </button>
        </li>
      </ul>
    </CardShell>
  );
}

// Battery slider and range field; only the fields the backend still needs are shown
function VehicleCard({ fields, onSubmit, onTypeInstead, onDismiss }) {
  const askBattery = fields.includes('battery');
  const askRange = fields.includes('range');
  const [battery, setBattery] = useState(50);
  const [range, setRange] = useState('');

  const rangeKm = Number(range);
  const rangeValid = !askRange || (Number.isInteger(rangeKm) && rangeKm > 0 && rangeKm <= MAX_RANGE_KM);
  const batteryColor = battery > 50 ? 'text-emerald-600 dark:text-emerald-400' : battery > 20 ? 'text-amber-600 dark:text-amber-400' : 'text-rose-600 dark:text-rose-400';

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!rangeValid) return;
    // Worded so the backend parses it without the LLM ("Battery 20%, range 50 km")
    const parts = [];
    if (askBattery) parts.push(`Battery ${battery}%`);
    if (askRange) parts.push(`${askBattery ? 'range' : 'Range'} ${rangeKm} km`);
    onSubmit(parts.join(', '));
  };

  return (
    <CardShell title={askBattery && askRange ? 'Your battery and range' : askBattery ? 'Your battery' : 'Your range'} onDismiss={onDismiss}>
      <form onSubmit={handleSubmit} className="px-4 py-3 space-y-3">
        {askBattery && (
          <div>
            <div className="flex items-end justify-between mb-2">
              <label htmlFor="battery-input" className="text-sm font-medium text-slate-700 dark:text-slate-300 flex items-center gap-1.5">
                <Battery className="w-4 h-4 text-indigo-500" /> Battery level
              </label>
              <span className={`text-xl font-bold leading-none ${batteryColor}`}>{battery}%</span>
            </div>
            <input
              id="battery-input"
              type="range"
              min="0"
              max="100"
              step="1"
              value={battery}
              onChange={(e) => setBattery(Number(e.target.value))}
              className="w-full accent-indigo-600 cursor-pointer"
            />
            <div className="flex justify-between text-[11px] text-slate-400 mt-0.5">
              <span>0%</span><span>50%</span><span>100%</span>
            </div>
          </div>
        )}

        {askRange && (
          <div>
            <label htmlFor="range-input" className="text-sm font-medium text-slate-700 dark:text-slate-300 flex items-center gap-1.5 mb-2">
              <Gauge className="w-4 h-4 text-indigo-500" /> Range left (as shown in your car)
            </label>
            <div className="flex flex-wrap items-center gap-2">
              <div className="relative w-36">
                <input
                  id="range-input"
                  type="number"
                  inputMode="numeric"
                  min="1"
                  max={MAX_RANGE_KM}
                  step="1"
                  placeholder="e.g. 120"
                  value={range}
                  onChange={(e) => setRange(e.target.value)}
                  className="w-full pl-3 pr-10 py-2 rounded-xl bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 text-[0.9375rem] pointer-coarse:text-[16px] text-slate-900 dark:text-slate-100 placeholder:text-slate-400 focus:outline-none focus:border-indigo-300 dark:focus:border-indigo-500 focus:ring-4 focus:ring-indigo-100 dark:focus:ring-indigo-500/20 transition"
                />
                <span className="absolute right-3 top-1/2 -translate-y-1/2 text-sm text-slate-400">km</span>
              </div>
              {RANGE_PRESETS.map((km) => (
                <button
                  key={km}
                  type="button"
                  onClick={() => setRange(String(km))}
                  className={`px-3 py-1.5 pointer-coarse:py-2.5 rounded-full text-sm border transition ${
                    rangeKm === km
                      ? 'bg-indigo-600 border-indigo-600 text-white'
                      : 'bg-white dark:bg-slate-800 border-slate-300 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:border-indigo-300 dark:hover:border-indigo-400'
                  }`}
                >
                  {km}
                </button>
              ))}
            </div>
            {range !== '' && !rangeValid && (
              <p className="mt-1.5 text-xs text-rose-600 dark:text-rose-400">Enter a whole number between 1 and {MAX_RANGE_KM} km.</p>
            )}
          </div>
        )}

        <div className="flex items-center justify-between gap-3 pt-1">
          <button type="button" onClick={onTypeInstead} className="pointer-coarse:py-2.5 pointer-coarse:pr-3 text-sm text-slate-500 dark:text-slate-400 hover:text-indigo-600 dark:hover:text-indigo-300 flex items-center gap-1.5 transition">
            <PencilLine className="w-3.5 h-3.5" /> Type instead
          </button>
          <button type="submit" disabled={!rangeValid || (askRange && range === '')} className={PRIMARY_BUTTON}>
            Continue
          </button>
        </div>
      </form>
    </CardShell>
  );
}

export default function InputRequest({ request, onSubmit, onAction, onTypeInstead, onDismiss }) {
  if (request.type === 'choice' && request.options?.length) {
    return (
      <ChoiceCard options={request.options} onSubmit={onSubmit} onAction={onAction} onTypeInstead={onTypeInstead} onDismiss={onDismiss} />
    );
  }
  if (request.type === 'vehicle' && request.fields?.length) {
    return <VehicleCard fields={request.fields} onSubmit={onSubmit} onTypeInstead={onTypeInstead} onDismiss={onDismiss} />;
  }
  return null;
}
