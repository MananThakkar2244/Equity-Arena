import React, { useMemo, useState } from 'react';
import { motion } from 'framer-motion';

/**
 * The board itself, drawn as a live constellation.
 *
 * Every node is one of the fifteen listings. Height is today's move — winners
 * rise, losers sink — size is price on a log scale, and colour is direction.
 * The whole lattice tilts with market breadth. Nothing here is decorative:
 * move a price and the picture moves with it.
 *
 * SVG rather than canvas. Fifteen nodes and ~27 links is nothing to lay out,
 * and in exchange hover and click come for free, it stays crisp on any
 * display, and Framer Motion springs the positions instead of a hand-rolled
 * animation loop.
 *
 * Listings are one-per-sector in this game, so sector links would draw nothing.
 * Nodes are chained by their (stable) horizontal order instead, which makes the
 * lattice read left-to-right as a skyline of the whole market.
 */

const W = 520;
const H = 200;
const PAD_X = 34;
const CY = H / 2;
const SPREAD = 62;

const UP = '#22C55E';
const DOWN = '#EF4444';
const FLAT = '#64748B';

/** Stable pseudo-random from the symbol, so nodes never jump between renders. */
function jitter(symbol) {
  let h = 0;
  for (let i = 0; i < symbol.length; i += 1) h = (h * 31 + symbol.charCodeAt(i)) % 1000;
  return (h / 1000 - 0.5) * 2;
}

export function MarketConstellation({ stocks = [], score = 0, onSelect, className = '' }) {
  const [hover, setHover] = useState(null);

  const { nodes, links } = useMemo(() => {
    const list = (Array.isArray(stocks) ? stocks : []).filter((s) => s && s.symbol);
    if (!list.length) return { nodes: [], links: [] };

    // Alphabetical keeps horizontal position fixed while prices move, so only
    // height animates — sorting by performance would make nodes swap places on
    // every tick and read as noise.
    const ordered = [...list].sort((a, b) => a.symbol.localeCompare(b.symbol));

    const maxAbs = Math.max(1, ...ordered.map((s) => Math.abs(s.percentChange || 0)));
    const prices = ordered.map((s) => Math.log10(Math.max(1, s.currentPrice || 1)));
    const loP = Math.min(...prices);
    const hiP = Math.max(...prices);

    const built = ordered.map((s, i) => {
      const chg = s.percentChange || 0;
      const strength = Math.max(-1, Math.min(1, chg / maxAbs));
      const j = jitter(s.symbol);

      const x =
        ordered.length === 1
          ? W / 2
          : PAD_X + (i / (ordered.length - 1)) * (W - PAD_X * 2);
      const y = CY - strength * SPREAD + j * 9;

      const pNorm = hiP > loP ? (prices[i] - loP) / (hiP - loP) : 0.5;

      return {
        stock: s,
        symbol: s.symbol,
        x,
        y,
        r: 3.6 + pNorm * 5.4,
        chg,
        strength,
        colour: chg > 0 ? UP : chg < 0 ? DOWN : FLAT,
        delay: i * 0.04
      };
    });

    // Chain neighbours, plus a second-order link for lattice depth. Both are
    // fixed topology, so lines never flicker as prices move.
    const pairs = [];
    for (let i = 0; i < built.length - 1; i += 1) pairs.push([i, i + 1]);
    for (let i = 0; i < built.length - 2; i += 2) pairs.push([i, i + 2]);

    return { nodes: built, links: pairs };
  }, [stocks]);

  if (!nodes.length) {
    return (
      <div className={`grid place-items-center ${className}`}>
        <span className="font-mono text-[11px] uppercase tracking-wider theme-text-dim">
          Waiting for the tape…
        </span>
      </div>
    );
  }

  const tilt = Math.max(-1, Math.min(1, score)) * 2.4;
  const active = hover != null ? nodes[hover] : null;

  return (
    <div className={className}>
      <svg viewBox={`0 0 ${W} ${H}`} className="h-full w-full" role="img" aria-label="Live market constellation">
        <defs>
          <radialGradient id="mc-halo-up">
            <stop offset="0%" stopColor={UP} stopOpacity="0.5" />
            <stop offset="100%" stopColor={UP} stopOpacity="0" />
          </radialGradient>
          <radialGradient id="mc-halo-down">
            <stop offset="0%" stopColor={DOWN} stopOpacity="0.5" />
            <stop offset="100%" stopColor={DOWN} stopOpacity="0" />
          </radialGradient>
          <radialGradient id="mc-halo-flat">
            <stop offset="0%" stopColor={FLAT} stopOpacity="0.4" />
            <stop offset="100%" stopColor={FLAT} stopOpacity="0" />
          </radialGradient>
        </defs>

        <motion.g
          animate={{ rotate: tilt }}
          transition={{ type: 'spring', stiffness: 40, damping: 18 }}
          style={{ originX: '50%', originY: '50%' }}
        >
          {/* the open line: nodes above it are up on the session */}
          <line
            x1={PAD_X - 14}
            x2={W - PAD_X + 14}
            y1={CY}
            y2={CY}
            stroke="currentColor"
            strokeOpacity="0.13"
            strokeDasharray="3 6"
            strokeWidth="1"
          />

          {links.map(([a, b]) => {
            const na = nodes[a];
            const nb = nodes[b];
            const lit = hover === a || hover === b;
            return (
              <motion.line
                key={`${na.symbol}-${nb.symbol}`}
                stroke={na.strength + nb.strength >= 0 ? UP : DOWN}
                strokeWidth={lit ? 1.4 : 0.8}
                initial={false}
                animate={{ x1: na.x, y1: na.y, x2: nb.x, y2: nb.y, opacity: lit ? 0.75 : 0.22 }}
                transition={{ type: 'spring', stiffness: 55, damping: 16 }}
              />
            );
          })}

          {nodes.map((n, i) => (
            <motion.g
              key={n.symbol}
              initial={false}
              animate={{ x: n.x, y: n.y }}
              transition={{ type: 'spring', stiffness: 55, damping: 16 }}
              onMouseEnter={() => setHover(i)}
              onMouseLeave={() => setHover((h) => (h === i ? null : h))}
              onClick={() => onSelect?.(n.stock)}
              style={{ cursor: onSelect ? 'pointer' : 'default' }}
            >
              <circle
                r={n.r * 3.4}
                fill={`url(#mc-halo-${n.chg > 0 ? 'up' : n.chg < 0 ? 'down' : 'flat'})`}
                opacity={0.34 + Math.abs(n.strength) * 0.5}
              />
              {/* breathing, staggered so the field never pulses in unison */}
              <motion.circle
                r={n.r}
                fill={n.colour}
                animate={{ scale: [1, 1.09, 1], opacity: [0.85, 1, 0.85] }}
                transition={{ duration: 3.2 + i * 0.17, repeat: Infinity, ease: 'easeInOut' }}
              />
              <circle r={n.r * 0.42} fill="#fff" opacity={0.85} />
              {hover === i && <circle r={n.r + 5} fill="none" stroke={n.colour} strokeWidth="1" opacity="0.7" />}
            </motion.g>
          ))}
        </motion.g>

        {active && (
          <g transform={`translate(${Math.min(Math.max(active.x, 60), W - 60)}, ${active.y < CY ? active.y + 26 : active.y - 34})`}>
            <rect x="-52" y="-13" width="104" height="30" rx="7" fill="#0B1120" stroke={active.colour} strokeOpacity="0.45" />
            <text textAnchor="middle" y="-1" fill="#E2E8F0" style={{ fontSize: 11, fontWeight: 700, fontFamily: 'monospace' }}>
              {active.symbol} {(active.stock.currentPrice || 0).toFixed(2)}
            </text>
            <text textAnchor="middle" y="11" fill={active.colour} style={{ fontSize: 10, fontFamily: 'monospace' }}>
              {active.chg >= 0 ? '+' : ''}
              {active.chg.toFixed(2)}%
            </text>
          </g>
        )}
      </svg>
    </div>
  );
}

export default MarketConstellation;
