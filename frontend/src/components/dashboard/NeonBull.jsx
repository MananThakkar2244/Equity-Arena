import React from 'react';

/**
 * The Equity Arena bull: a crystalline low-poly sculpture, drawn as individual
 * glass facets so light breaks across it the way it does on cut stone.
 *
 * Two views are modelled because you cannot turn a flat drawing:
 *   BullProfile — the side, the hero read
 *   BullFront   — head-on, horns spread
 * Bull360 rotates both in CSS 3D and cross-fades on |cos| / |sin|, which makes
 * the full 360° honest: past 90° the browser mirrors the profile for you (that
 * IS the far side), and past 180° the front view mirrors into the rear.
 *
 * `tone`: 'crystal' is the lit front shell. 'core' is the dark extruded body
 * stacked behind it along Z so the sculpture has real thickness.
 */

const RAMP = [
  ['#F2F8FF', '#A9CCFF'], // 1 — brightest facet
  ['#9EC7FF', '#3B82F6'], // 2
  ['#5C9BFB', '#1D4ED8'], // 3
  ['#2E63D8', '#16327E'], // 4
  ['#1A3573', '#0A1740'] // 5 — deepest
];

function Defs({ p }) {
  return (
    <defs>
      {RAMP.map(([a, b], i) => (
        <linearGradient key={i} id={`${p}-g${i + 1}`} x1="0" y1="0" x2="0.85" y2="1">
          <stop offset="0%" stopColor={a} />
          <stop offset="100%" stopColor={b} />
        </linearGradient>
      ))}
      <linearGradient id={`${p}-sheen`} x1="0" y1="0" x2="1" y2="1">
        <stop offset="0%" stopColor="#FFFFFF" stopOpacity="0.5" />
        <stop offset="55%" stopColor="#BFDBFE" stopOpacity="0.08" />
        <stop offset="100%" stopColor="#3B82F6" stopOpacity="0" />
      </linearGradient>
    </defs>
  );
}

/** One facet. `s` picks the ramp step; edges are hairline so the cut reads. */
function F({ d, s, p, tone, o }) {
  if (tone === 'core') {
    return <path d={d} fill="#0A1740" stroke="#0A1740" strokeWidth="1.2" />;
  }
  return (
    <path
      d={d}
      fill={`url(#${p}-g${s})`}
      fillOpacity={o ?? 1}
      stroke="rgba(198,224,255,0.42)"
      strokeWidth="0.7"
      strokeLinejoin="round"
    />
  );
}

/* ------------------------------------------------------------------ *
 * SIDE PROFILE — bull facing left, head lowered, mid-stride.
 * Drawn back-to-front so the near legs read in front of the barrel.
 * Ground line sits at y ≈ 270.
 * ------------------------------------------------------------------ */
const PROFILE = [
  // ---- far horn & ear: the far horn sits just above and behind its
  // partner, the way it does when the head is turned a few degrees in.
  ['M104 96 L70 58 L40 34 L62 66 Z', 4],
  ['M104 96 L62 66 L92 100 Z', 5],
  ['M108 106 L136 96 L124 126 Z', 4],

  // ---- far legs, sunk behind the barrel ----
  ['M210 150 L232 156 L230 200 L208 198 Z', 5],
  ['M208 198 L230 200 L234 256 L214 256 Z', 5],
  ['M213 252 L235 252 L237 270 L212 270 Z', 5],
  ['M258 158 L284 152 L292 200 L268 204 Z', 5],
  ['M268 204 L292 200 L296 256 L278 256 Z', 5],
  ['M277 252 L297 252 L299 270 L276 270 Z', 5],

  // ---- tail: one continuous strip off the rump ----
  ['M322 96 L346 86 L346 100 L328 108 Z', 3],
  ['M346 86 L360 104 L352 120 L346 100 Z', 3],
  ['M360 104 L362 138 L352 142 L352 120 Z', 4],
  ['M362 138 L352 166 L346 164 L352 142 Z', 4],
  ['M352 166 L364 186 L342 188 L346 164 Z', 3],

  // ---- hindquarters ----
  ['M320 94 L346 116 L340 156 L312 132 Z', 2],
  ['M312 132 L340 156 L334 186 L300 182 Z', 3],
  ['M320 94 L346 116 L332 108 Z', 1],
  ['M300 182 L334 186 L326 196 L296 194 Z', 5],

  // ---- barrel: top catches the key, belly falls away ----
  ['M182 96 L216 70 L256 76 L232 118 L180 132 Z', 2],
  ['M256 76 L320 94 L312 132 L232 118 Z', 2],
  ['M180 132 L232 118 L236 178 L176 172 Z', 3],
  ['M232 118 L312 132 L302 176 L236 178 Z', 3],
  ['M176 172 L236 178 L234 198 L172 188 Z', 5],
  ['M236 178 L302 176 L296 192 L234 198 Z', 5],
  // spine highlight running the length of the back
  ['M216 70 L256 76 L320 94 L316 102 L254 86 L214 80 Z', 1],
  // specular band across the flank
  ['M200 108 L258 92 L268 108 L212 128 Z', 1, 0.18],

  // ---- withers / shoulder hump ----
  ['M150 80 L184 58 L216 70 L182 96 L168 106 Z', 1],
  ['M184 58 L216 70 L204 82 Z', 2],

  // ---- neck, dropping steeply into the charge ----
  ['M104 132 L150 80 L156 88 L112 140 Z', 1],
  ['M112 140 L156 88 L168 106 L122 148 Z', 2],
  ['M122 148 L168 106 L176 134 L128 170 Z', 3],
  ['M128 170 L176 134 L182 158 L122 182 Z', 4],
  ['M122 182 L182 158 L176 178 L110 202 Z', 4],

  // ---- skull, carried low ----
  ['M94 106 L104 132 L116 118 L106 102 Z', 3],
  ['M94 106 L64 120 L80 148 L104 132 Z', 1],
  ['M64 120 L26 156 L48 170 L80 148 Z', 2],
  ['M80 148 L104 132 L106 166 L82 174 Z', 3],
  ['M48 170 L80 148 L82 174 L92 188 L54 190 Z', 3],
  ['M92 188 L106 166 L122 182 L110 202 Z', 4],
  // muzzle driving forward
  ['M26 156 L48 170 L52 190 L22 180 Z', 2],
  ['M22 180 L52 190 L46 200 L20 190 Z', 5],
  ['M52 190 L92 188 L86 200 L46 200 Z', 4],
  // eye
  ['M70 132 L86 136 L74 148 Z', 5],

  // ---- near horn: the line that says "bull" ----
  ['M94 108 L54 74 L12 56 L42 86 Z', 1],
  ['M94 108 L42 86 L78 120 Z', 3],

  // ---- near legs, tapered through knee and cannon ----
  ['M174 138 L206 146 L200 196 L176 192 Z', 3],
  ['M176 192 L200 196 L198 210 L177 206 Z', 2],
  ['M177 206 L198 210 L196 256 L180 254 Z', 2],
  ['M179 252 L197 254 L198 270 L177 270 Z', 5],
  ['M288 148 L320 140 L328 196 L302 204 Z', 3],
  ['M302 204 L328 196 L330 214 L306 220 Z', 2],
  ['M306 220 L330 214 L332 256 L314 256 Z', 2],
  ['M313 252 L333 252 L335 270 L312 270 Z', 5]
];

/* ------------------------------------------------------------------ *
 * HEAD-ON — carries the 90° / 270° quarters of the turn.
 * A centre ridge splits every panel so the face catches light on one
 * side only, which is what keeps it from reading as a box.
 * ------------------------------------------------------------------ */
const FRONT = [
  // ---- horns, arcing wide ----
  ['M168 90 L130 74 L70 40 L142 88 Z', 1],
  ['M168 90 L142 88 L188 106 Z', 3],
  ['M232 90 L270 74 L330 40 L258 88 Z', 2],
  ['M232 90 L258 88 L212 106 Z', 4],
  // ---- ears ----
  ['M166 108 L126 98 L158 132 Z', 3],
  ['M234 108 L274 98 L242 132 Z', 4],
  // ---- shoulder ridge behind the head ----
  ['M176 118 L200 108 L224 118 L200 130 Z', 2],

  // ---- barrel edges peeking past the chest ----
  ['M128 186 L120 218 L142 230 L140 200 Z', 5],
  ['M272 186 L280 218 L258 230 L260 200 Z', 5],

  // ---- chest, split on the centre line ----
  ['M162 150 L200 146 L200 200 L140 200 Z', 2],
  ['M238 150 L200 146 L200 200 L260 200 Z', 3],
  ['M140 200 L200 200 L200 236 L148 234 Z', 3],
  ['M260 200 L200 200 L200 236 L252 234 Z', 4],
  ['M162 150 L140 200 L128 186 L150 156 Z', 4],
  ['M238 150 L260 200 L272 186 L250 156 Z', 4],
  ['M148 234 L252 234 L246 250 L154 250 Z', 5],
  ['M176 156 L200 152 L200 196 L182 198 Z', 1, 0.28],

  // ---- skull ----
  ['M168 96 L200 90 L200 140 L172 146 Z', 1],
  ['M232 96 L200 90 L200 140 L228 146 Z', 2],
  ['M172 146 L200 140 L200 178 L180 176 Z', 2],
  ['M228 146 L200 140 L200 178 L220 176 Z', 3],
  ['M180 176 L200 178 L200 208 L184 206 Z', 1],
  ['M220 176 L200 178 L200 208 L216 206 Z', 2],
  ['M184 206 L216 206 L212 218 L188 218 Z', 5],
  // eyes
  ['M174 122 L190 126 L178 138 Z', 5],
  ['M226 122 L210 126 L222 138 Z', 5],

  // ---- front legs ----
  ['M156 230 L182 232 L178 262 L154 260 Z', 3],
  ['M218 232 L244 230 L246 260 L222 262 Z', 4],
  ['M153 258 L179 260 L180 272 L152 270 Z', 5],
  ['M221 260 L247 258 L248 270 L220 272 Z', 5]
];

function FacetSet({ list, p, tone }) {
  return list.map(([d, s, o], i) => <F key={i} d={d} s={s} o={o} p={p} tone={tone} />);
}

export function BullProfile({ tone = 'crystal', idPrefix = 'bp' }) {
  return (
    <svg viewBox="0 0 400 300" className="h-full w-full" aria-hidden="true">
      <Defs p={idPrefix} />
      <FacetSet list={PROFILE} p={idPrefix} tone={tone} />
      {tone === 'crystal' && (
        <path d="M150 80 L216 70 L240 124 L168 106 Z" fill={`url(#${idPrefix}-sheen)`} />
      )}
    </svg>
  );
}

export function BullFront({ tone = 'crystal', idPrefix = 'bf' }) {
  return (
    <svg viewBox="0 0 400 300" className="h-full w-full" aria-hidden="true">
      <Defs p={idPrefix} />
      <FacetSet list={FRONT} p={idPrefix} tone={tone} />
      {tone === 'crystal' && (
        <path d="M168 96 L232 96 L238 150 L162 150 Z" fill={`url(#${idPrefix}-sheen)`} />
      )}
    </svg>
  );
}

/** Kept for callers that just want the side view. */
export function BullBody({ tone = 'lit', idPrefix = 'bull' }) {
  return <BullProfile tone={tone === 'lit' ? 'crystal' : 'core'} idPrefix={idPrefix} />;
}

/**
 * Static neon presentation — bloom behind, light pooled underneath, slow float.
 */
export function NeonBull({ className = '', width = 260, height = 182, float = true }) {
  return (
    <div className={`relative ${className}`} style={{ width, height }}>
      <div
        className="pointer-events-none absolute inset-0 blur-2xl"
        style={{
          background:
            'radial-gradient(closest-side, rgba(59,130,246,0.55), rgba(59,130,246,0.12) 60%, transparent 75%)'
        }}
      />
      <div className={float ? 'animate-float-slow relative h-full w-full' : 'relative h-full w-full'}>
        <BullProfile idPrefix="hero-bull" />
      </div>
      <div
        className="animate-podium-glow pointer-events-none absolute bottom-0 left-1/2 h-3 w-[78%] -translate-x-1/2 rounded-[50%] blur-md"
        style={{ background: 'rgba(59,130,246,0.75)' }}
      />
    </div>
  );
}

export default NeonBull;
