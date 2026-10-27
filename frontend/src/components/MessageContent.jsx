import ReactMarkdown from 'react-markdown';
import remarkBreaks from 'remark-breaks';
import remarkGfm from 'remark-gfm';
import { Navigation, ExternalLink } from 'lucide-react';

const MAPS_URL_PREFIX = 'https://www.google.com/maps/';

const MAPS_BUTTON_VARIANTS = {
  // In a chat bubble
  primary: 'gap-2 px-4 py-2.5 rounded-xl text-sm shadow-md shadow-indigo-300/40 dark:shadow-black/30',
  // In the chat header; just the icon on small screens
  compact: 'shrink-0 gap-1.5 p-2 sm:px-3 sm:py-1.5 rounded-full text-xs shadow-sm',
};

export const MapsButton = ({ href, variant = 'primary' }) => {
  const compact = variant === 'compact';
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      title="Open the route in Google Maps"
      className={`inline-flex items-center bg-gradient-to-br from-indigo-600 to-cyan-600 text-white font-semibold hover:scale-[1.02] active:scale-95 transition ${MAPS_BUTTON_VARIANTS[variant]}`}
    >
      <Navigation className="w-4 h-4" aria-hidden="true" />
      <span className={compact ? 'sr-only sm:not-sr-only' : ''}>Open in Google Maps</span>
      <ExternalLink className={`w-3.5 h-3.5 opacity-80 ${compact ? 'hidden sm:block' : ''}`} aria-hidden="true" />
    </a>
  );
};

const REMARK_PLUGINS = [remarkGfm, remarkBreaks];

// Links in replies open in a new tab, away from the chat
const MARKDOWN_COMPONENTS = {
  a: ({ href, children }) => (
    <a href={href} target="_blank" rel="noopener noreferrer">
      {children}
    </a>
  ),
};

// Chat text, with a Google Maps link on its own line shown as a button instead of a long URL.
// Assistant replies are Markdown (raw HTML is not rendered); the user's own text is shown as typed.
export default function MessageContent({ content, markdown = false }) {
  const lines = content.split('\n');
  const text = lines.filter((line) => !line.trim().startsWith(MAPS_URL_PREFIX)).join('\n');
  const mapsUrl = lines.map((line) => line.trim()).find((line) => line.startsWith(MAPS_URL_PREFIX));

  return (
    <>
      {markdown ? (
        <div className="prose prose-sm prose-slate dark:prose-invert max-w-none prose-p:my-1.5 prose-ol:my-1.5 prose-ul:my-1.5 prose-li:my-0.5 prose-headings:my-2 prose-a:text-indigo-600 dark:prose-a:text-indigo-300">
          <ReactMarkdown remarkPlugins={REMARK_PLUGINS} components={MARKDOWN_COMPONENTS}>
            {text}
          </ReactMarkdown>
        </div>
      ) : (
        <span className="whitespace-pre-wrap">{text}</span>
      )}
      {mapsUrl && (
        <span className="block mt-3">
          <MapsButton href={mapsUrl} />
        </span>
      )}
    </>
  );
}
