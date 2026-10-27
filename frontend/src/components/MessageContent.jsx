import { Navigation, ExternalLink } from 'lucide-react';

const MAPS_URL_PREFIX = 'https://www.google.com/maps/';

const MAPS_BUTTON_VARIANTS = {
  // In a chat bubble
  primary: 'gap-2 px-4 py-2.5 rounded-xl text-sm shadow-md shadow-indigo-300/40 dark:shadow-black/30',
  // In the trip info bar under the chat title
  compact: 'gap-1.5 px-3 py-1.5 rounded-full text-xs shadow-sm',
};

export const MapsButton = ({ href, variant = 'primary' }) => (
  <a
    href={href}
    target="_blank"
    rel="noopener noreferrer"
    className={`inline-flex items-center bg-gradient-to-br from-indigo-600 to-cyan-600 text-white font-semibold hover:scale-[1.02] active:scale-95 transition ${MAPS_BUTTON_VARIANTS[variant]}`}
  >
    <Navigation className="w-4 h-4" /> Open in Google Maps <ExternalLink className="w-3.5 h-3.5 opacity-80" />
  </a>
);

// Chat text, with a Google Maps link on its own line shown as a button instead of a long URL
export default function MessageContent({ content }) {
  const lines = content.split('\n');
  const text = lines.filter((line) => !line.trim().startsWith(MAPS_URL_PREFIX)).join('\n');
  const mapsUrl = lines.map((line) => line.trim()).find((line) => line.startsWith(MAPS_URL_PREFIX));

  return (
    <>
      {text}
      {mapsUrl && (
        <span className="block mt-3">
          <MapsButton href={mapsUrl} />
        </span>
      )}
    </>
  );
}
