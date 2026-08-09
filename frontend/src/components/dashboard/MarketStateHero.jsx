import React, { useEffect, useMemo, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { BULL, BEAR, BOX, sampleShape, traceBoundary, buildEdges } from './marketCreatures';
import { readMarket, nextMarketState } from './marketState';

/**
 * Market state: a wireframe bull and bear charging each other, with the
 * collision between them.
 *
 * Both animals live on one canvas rather than two. The beam crosses the gap
 * between their heads, and coordinating that across two independently sized
 * canvases would mean sharing layout state between components for no gain —
 * one scene keeps the convergence point exact and halves the raf loops.
 *
 * Everything shown is derived from data the dashboard already had: the ARENA 15
 * composite and the advancing/declining breadth of the same `stocks` feed the
 * ticker uses.
 */

// Scene space: bull in the left box, bear mirrored in the right, beam between.
const SCENE = { w: 250, h: 64 };
const BEAR_OFFSET = 150;
const MEET = { x: 125, y: 34 };
// Where each animal's muzzle sits, so the beam leaves the head and not the ribs.
const BULL_MUZZLE = { x: 91, y: 35.5 };
const BEAR_MUZZLE = { x: BEAR_OFFSET + (BOX.w - 89), y: 33.5 };

const TONES = {
  BULLISH: { core: '#22C55E', label: 'BULLISH', blurb: 'The market sentiment is positive.' },
  BEARISH: { core: '#EF4444', label: 'BEARISH', blurb: 'The market sentiment is negative.' },
  NEUTRAL: { core: '#38BDF8', label: 'NEUTRAL', blurb: 'The market is holding its range.' }
};

const BULL_TONE = { core: '#16A34A', line: '#4ADE80', spark: '#D9F99D' };
const BEAR_TONE = { core: '#C2321F', line: '#F0523C', spark: '#FDBA74' };

/**
 * Build one animal's node set and edge topology in scene coordinates.
 *
 * Done once at mount: only positions animate afterwards, so each frame is a
 * few batched strokes instead of an O(n²) neighbour search.
 */
function buildCreature(shape, { mirror = false, offsetX = 0, interior = 210 }) {
  const boundary = traceBoundary(shape, 1.15);
  const inner = sampleShape(shape, interior);

  const place = (p) => ({ x: offsetX + (mirror ? BOX.w - p.x : p.x), y: p.y });
  const nodes = [...boundary.map(place), ...inner.map(place)];

  return {
    nodes,
    boundaryCount: boundary.length,
    contourEdges: buildEdges(nodes.slice(0, boundary.length), 2.2, 3),
    meshEdges: buildEdges(nodes, 7, 3)
  };
}

function ArenaScene({ bullEnergy, bearEnergy, className = '' }) {
  const canvasRef = useRef(null);
  const bullRef = useRef(bullEnergy);
  bullRef.current = bullEnergy;
  const bearRef = useRef(bearEnergy);
  bearRef.current = bearEnergy;

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return undefined;
    const ctx = canvas.getContext('2d');
    if (!ctx) return undefined;

    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    const bull = buildCreature(BULL, { offsetX: 0 });
    const bear = buildCreature(BEAR, { offsetX: BEAR_OFFSET, mirror: true });

    const makeParts = (creature) =>
      creature.nodes.map((p, i) => ({
        sx: p.x,
        sy: p.y,
        x: 0,
        y: 0,
        tx: 0,
        ty: 0,
        edge: i < creature.boundaryCount,
        phase: Math.random() * Math.PI * 2,
        speed: 0.4 + Math.random() * 0.8,
        amp: 0.35 + Math.random() * 0.9,
        bright: Math.random() < (i < creature.boundaryCount ? 0.16 : 0.09)
      }));

    const sides = [
      { creature: bull, parts: makeParts(bull), tone: BULL_TONE, energy: bullRef, lift: -1 },
      { creature: bear, parts: makeParts(bear), tone: BEAR_TONE, energy: bearRef, lift: 1 }
    ];
    let bullE = bullEnergy;
    let bearE = bearEnergy;

    // Beam: each stream runs from a muzzle to the meeting point, spreading wide
    // at the animal and pinching to nothing where they collide.
    const BEAM = 108;
    const beam = Array.from({ length: BEAM }, (_, i) => {
      const fromBull = i % 2 === 0;
      return {
        fromBull,
        t: Math.random(),
        speed: 0.006 + Math.random() * 0.011,
        spread: (Math.random() - 0.5) * 15,
        wob: Math.random() * Math.PI * 2,
        size: Math.random() < 0.2 ? 1.7 : 1.05
      };
    });

    // Sparks thrown off the collision.
    const SPARKS = 34;
    const sparks = Array.from({ length: SPARKS }, () => ({
      a: Math.random() * Math.PI * 2,
      r: Math.random(),
      speed: 0.004 + Math.random() * 0.012,
      fromBull: Math.random() < 0.5
    }));

    let raf = 0;
    let running = true;
    let w = 0;
    let h = 0;
    let scale = 1;
    let ox = 0;
    let oy = 0;
    let seeded = false;

    const fit = () => {
      const rect = canvas.getBoundingClientRect();
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      w = Math.max(1, Math.round(rect.width));
      h = Math.max(1, Math.round(rect.height));
      canvas.width = Math.round(w * dpr);
      canvas.height = Math.round(h * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.lineCap = 'round';

      scale = Math.min(w / SCENE.w, (h * 0.98) / SCENE.h);
      ox = (w - SCENE.w * scale) / 2;
      oy = (h - SCENE.h * scale) / 2;

      sides.forEach((side) =>
        side.parts.forEach((p) => {
          p.tx = ox + p.sx * scale;
          p.ty = oy + p.sy * scale;
          if (!seeded) {
            p.x = p.tx + (Math.random() - 0.5) * 70;
            p.y = p.ty + (Math.random() - 0.5) * 70;
          }
        })
      );
      seeded = true;
    };

    fit();
    const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(fit) : null;
    ro?.observe(canvas);

    const io =
      typeof IntersectionObserver !== 'undefined'
        ? new IntersectionObserver((es) =>
            es.forEach((e) => {
              running = e.isIntersecting && !document.hidden;
            })
          )
        : null;
    io?.observe(canvas);

    const onVis = () => {
      running = !document.hidden;
    };
    document.addEventListener('visibilitychange', onVis);

    const sx = (x) => ox + x * scale;
    const sy = (y) => oy + y * scale;

    const paint = (now) => {
      const t = now / 1000;
      // Eased rather than switched — this is the morph between market states.
      bullE += (bullRef.current - bullE) * 0.045;
      bearE += (bearRef.current - bearE) * 0.045;
      const breathe = 1 + Math.sin(t * 0.5) * 0.01;

      ctx.clearRect(0, 0, w, h);

      sides.forEach((side, si) => {
        const energy = si === 0 ? bullE : bearE;
        const { tone, parts, creature } = side;
        const cx = sx(si === 0 ? BOX.w / 2 : BEAR_OFFSET + BOX.w / 2);
        const cy = sy(SCENE.h / 2);

        const glow = ctx.createRadialGradient(cx, cy, 0, cx, cy, Math.max(w * 0.22, h * 0.5));
        glow.addColorStop(0, `${tone.core}${Math.round(26 * energy).toString(16).padStart(2, '0')}`);
        glow.addColorStop(1, 'rgba(0,0,0,0)');
        ctx.fillStyle = glow;
        ctx.fillRect(0, 0, w, h);

        for (let i = 0; i < parts.length; i += 1) {
          const p = parts[i];
          const bx = cx + (p.tx - cx) * breathe;
          const by = cy + (p.ty - cy) * breathe;
          p.x += (bx - p.x) * 0.07;
          p.y += (by - p.y) * 0.07;
          if (!reduced) {
            const sway = 0.45 + energy * 0.75;
            p.x += Math.sin(t * p.speed + p.phase) * p.amp * sway * 0.32;
            p.y += (Math.cos(t * p.speed * 0.8 + p.phase) * p.amp * sway + side.lift * energy * 0.3) * 0.32;
          }
        }

        ctx.beginPath();
        for (let i = 0; i < creature.meshEdges.length; i += 2) {
          const a = parts[creature.meshEdges[i]];
          const b = parts[creature.meshEdges[i + 1]];
          ctx.moveTo(a.x, a.y);
          ctx.lineTo(b.x, b.y);
        }
        ctx.strokeStyle = tone.core;
        ctx.globalAlpha = 0.1 + energy * 0.16;
        ctx.lineWidth = 0.6;
        ctx.stroke();

        ctx.beginPath();
        for (let i = 0; i < creature.contourEdges.length; i += 2) {
          const a = parts[creature.contourEdges[i]];
          const b = parts[creature.contourEdges[i + 1]];
          ctx.moveTo(a.x, a.y);
          ctx.lineTo(b.x, b.y);
        }
        ctx.strokeStyle = tone.line;
        ctx.globalAlpha = 0.24 + energy * 0.56;
        ctx.lineWidth = 1.05;
        ctx.stroke();

        for (let i = 0; i < parts.length; i += 1) {
          const p = parts[i];
          if (p.bright) {
            ctx.fillStyle = tone.spark;
            ctx.globalAlpha = (0.5 + energy * 0.5) * 0.95;
            ctx.fillRect(p.x - 1, p.y - 1, 2.2, 2.2);
          } else {
            ctx.fillStyle = p.edge ? tone.line : tone.core;
            ctx.globalAlpha = (p.edge ? 0.42 : 0.24) * (0.35 + energy * 0.65);
            ctx.fillRect(p.x, p.y, 1.1, 1.1);
          }
        }
      });

      /* ---- the collision ---- */
      const meetX = sx(MEET.x);
      const meetY = sy(MEET.y);
      const clash = Math.min(bullE, bearE);

      for (let i = 0; i < beam.length; i += 1) {
        const b = beam[i];
        if (!reduced) {
          b.t += b.speed;
          if (b.t > 1) b.t = 0;
        }
        const from = b.fromBull ? BULL_MUZZLE : BEAR_MUZZLE;
        const energy = b.fromBull ? bullE : bearE;
        const tone = b.fromBull ? BULL_TONE : BEAR_TONE;

        // Pinch the cone toward the meeting point.
        const px = from.x + (MEET.x - from.x) * b.t;
        const py =
          from.y + (MEET.y - from.y) * b.t + b.spread * (1 - b.t) ** 1.5 + Math.sin(t * 2 + b.wob) * 0.6 * (1 - b.t);

        ctx.fillStyle = b.t > 0.72 ? tone.spark : tone.line;
        ctx.globalAlpha = Math.min(1, b.t * 1.6) * (0.2 + energy * 0.7);
        ctx.fillRect(sx(px), sy(py), b.size, b.size);
      }

      // Flare where the two streams meet.
      const pulse = 0.75 + Math.sin(t * 3.1) * 0.25;
      const flare = ctx.createRadialGradient(meetX, meetY, 0, meetX, meetY, 34 * scale * pulse);
      flare.addColorStop(0, `rgba(255,255,255,${0.5 * clash})`);
      flare.addColorStop(0.28, `rgba(190,255,200,${0.24 * clash})`);
      flare.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.globalAlpha = 1;
      ctx.fillStyle = flare;
      ctx.fillRect(meetX - 60 * scale, meetY - 60 * scale, 120 * scale, 120 * scale);

      for (let i = 0; i < sparks.length; i += 1) {
        const s = sparks[i];
        if (!reduced) {
          s.r += s.speed;
          if (s.r > 1) {
            s.r = 0;
            s.a = Math.random() * Math.PI * 2;
          }
        }
        const dist = s.r * 26 * scale;
        ctx.fillStyle = s.fromBull ? BULL_TONE.spark : BEAR_TONE.spark;
        ctx.globalAlpha = (1 - s.r) * 0.8 * clash;
        ctx.fillRect(meetX + Math.cos(s.a) * dist, meetY + Math.sin(s.a) * dist * 0.75, 1.3, 1.3);
      }

      ctx.globalAlpha = 1;
    };

    const loop = (now) => {
      raf = requestAnimationFrame(loop);
      if (!running) return;
      paint(now);
    };

    if (reduced) {
      sides.forEach((side) =>
        side.parts.forEach((p) => {
          p.x = p.tx;
          p.y = p.ty;
        })
      );
      bullE = bullRef.current;
      bearE = bearRef.current;
      paint(performance.now());
    } else {
      raf = requestAnimationFrame(loop);
    }

    return () => {
      cancelAnimationFrame(raf);
      ro?.disconnect();
      io?.disconnect();
      document.removeEventListener('visibilitychange', onVis);
    };
    // Topology is fixed; energy flows in through refs.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return <canvas ref={canvasRef} className={className} aria-hidden="true" />;
}

export function MarketStateHero({ stocks = [], index = null, className = '' }) {
  const read = useMemo(() => readMarket(stocks, index), [stocks, index]);

  const [state, setState] = useState('NEUTRAL');
  useEffect(() => {
    setState((prev) => nextMarketState(prev, read.score));
  }, [read.score]);

  const tone = TONES[state];

  // The winning side burns bright; the other dims but never leaves the board.
  const bullEnergy = state === 'BULLISH' ? 1 : state === 'BEARISH' ? 0.34 : 0.64;
  const bearEnergy = state === 'BEARISH' ? 1 : state === 'BULLISH' ? 0.34 : 0.64;

  const showFloor = () => {
    document.getElementById('arena-floor')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  return (
    <div className={`flex min-w-0 items-stretch gap-6 ${className}`}>
      <ArenaScene bullEnergy={bullEnergy} bearEnergy={bearEnergy} className="h-full min-w-0 flex-1" />

      <div className="w-[268px] shrink-0 self-center border-l theme-border pl-6">
        <div className="font-mono text-[11px] font-bold uppercase tracking-[0.14em] theme-text-muted">
          Market state
        </div>

        <div className="mt-1 h-[38px] overflow-hidden">
          <AnimatePresence mode="wait" initial={false}>
            <motion.div
              key={tone.label}
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -12 }}
              transition={{ duration: 0.45, ease: [0.22, 0.9, 0.3, 1] }}
              className="font-heading text-[30px] font-bold leading-none tracking-tight"
              style={{ color: tone.core }}
            >
              {tone.label}
            </motion.div>
          </AnimatePresence>
        </div>

        <AnimatePresence mode="wait" initial={false}>
          <motion.p
            key={tone.blurb}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.35 }}
            className="mt-2 text-[13px] theme-text-muted"
          >
            {tone.blurb}
          </motion.p>
        </AnimatePresence>

        <div className="mt-4 flex h-[7px] overflow-hidden rounded-full">
          {[
            { key: 'adv', pct: read.advPct, colour: '#22C55E' },
            { key: 'flat', pct: read.flatPct, colour: '#3A4C60' },
            { key: 'dec', pct: read.decPct, colour: '#EF4444' }
          ].map((b) => (
            <motion.span
              key={b.key}
              className="h-full"
              style={{ backgroundColor: b.colour }}
              initial={false}
              animate={{ width: `${Math.max(b.pct, b.pct > 0 ? 3 : 0)}%` }}
              transition={{ duration: 0.7, ease: [0.22, 0.9, 0.3, 1] }}
            />
          ))}
        </div>

        <div className="mt-2 flex items-start justify-between">
          {[
            { pct: read.advPct, label: 'Advancing', colour: '#22C55E' },
            { pct: read.flatPct, label: 'Neutral', colour: 'var(--text-muted, #94A3B8)' },
            { pct: read.decPct, label: 'Declining', colour: '#EF4444' }
          ].map((c) => (
            <div key={c.label}>
              <div className="font-mono text-[13px] font-bold tabular-nums" style={{ color: c.colour }}>
                {c.pct}%
              </div>
              <div className="mt-0.5 text-[12px] theme-text-muted">{c.label}</div>
            </div>
          ))}
        </div>

        <button
          type="button"
          onClick={showFloor}
          className="mt-4 font-medium text-[13px] text-[var(--accent)] transition-opacity hover:opacity-75"
        >
          View market details →
        </button>

        <span className="sr-only">
          Market state {tone.label}. {read.advancing} advancing, {read.declining} declining.
        </span>
      </div>
    </div>
  );
}

export default MarketStateHero;
