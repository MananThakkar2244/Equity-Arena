import React from 'react';
import { Newspaper, Radio } from 'lucide-react';

function timeAgo(timestamp) {
  if (!timestamp) return '';
  const diff = Date.now() - new Date(timestamp).getTime();
  if (!Number.isFinite(diff) || diff < 0) return 'just now';
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  return `${hrs}h ago`;
}

/**
 * The wire. News is what moves this market, so the newest item is given the
 * full-width treatment and everything else stacks below it.
 */
export function NewsSection({ newsFeed = [] }) {
  const feed = Array.isArray(newsFeed) ? newsFeed : [];

  if (!feed.length) {
    return (
      <div className="arena-card arena-rise flex flex-col items-center justify-center p-14 text-center">
        <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-[var(--accent-soft)]">
          <Radio className="h-7 w-7 text-[var(--accent)]" />
        </div>
        <h2 className="font-heading text-[20px] font-bold theme-text-main">The wire is quiet</h2>
        <p className="mt-1.5 max-w-[340px] text-[13.5px] theme-text-muted">
          When the analyst desk breaks a story, it lands here — and prices move within seconds.
        </p>
      </div>
    );
  }

  const [lead, ...rest] = feed;

  return (
    <div className="space-y-4">
      {/* Lead story */}
      <article className="arena-card arena-rise relative overflow-hidden p-6">
        <div className="absolute inset-x-0 top-0 h-[3px]" style={{ background: 'var(--accent)' }} />
        <div className="flex flex-wrap items-center gap-2">
          <span className="rounded-full bg-[var(--loss-red)] px-2 py-0.5 font-mono text-[10px] font-bold uppercase tracking-wider text-white">
            Breaking
          </span>
          {lead.stockSymbol && (
            <span className="rounded-full border theme-border px-2 py-0.5 font-mono text-[10px] uppercase tracking-wider theme-text-muted">
              {lead.stockSymbol}
            </span>
          )}
          <span className="font-mono text-[11px] theme-text-dim">{timeAgo(lead.timestamp || lead.createdAt)}</span>
        </div>

        <h2 className="font-heading mt-3 max-w-[70ch] text-[20px] font-bold leading-snug tracking-tight theme-text-main">
          {lead.message || lead.headline || lead.title}
        </h2>
      </article>

      {/* Earlier */}
      <div className="arena-card arena-rise p-5" style={{ animationDelay: '70ms' }}>
        <div className="mb-3 flex items-center gap-2">
          <Newspaper className="h-4 w-4 theme-text-dim" />
          <h3 className="font-heading text-[15px] font-bold theme-text-main">Earlier on the wire</h3>
        </div>

        {rest.length === 0 ? (
          <p className="py-5 text-center text-[13px] theme-text-dim">That is the only story so far.</p>
        ) : (
          <div className="divide-y" style={{ borderColor: 'var(--border-card)' }}>
            {rest.map((n, i) => (
              <div key={n.id || i} className="flex gap-3 py-3">
                <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-[var(--accent)]" />
                <div className="min-w-0 flex-1">
                  <p className="text-[13.5px] leading-snug theme-text-main">{n.message || n.headline || n.title}</p>
                  <div className="mt-1 flex flex-wrap items-center gap-2 font-mono text-[10.5px] theme-text-dim">
                    <span>{timeAgo(n.timestamp || n.createdAt)}</span>
                    {n.stockSymbol && <span>· {n.stockSymbol}</span>}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

export default NewsSection;
