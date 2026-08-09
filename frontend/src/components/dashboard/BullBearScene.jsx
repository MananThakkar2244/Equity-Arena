import React, { useEffect, useRef } from 'react';

/**
 * A single particle creature — see BullBearGauge's original for the technique
 * write-up. Duplicated here (rather than shared) so this file stays a
 * self-contained drop-in for the hero.
 */
function ParticleCreature({ glyph, color, intensity = 1, width, height, flip = false }) {
  const canvasRef = useRef(null);
  const particlesRef = useRef(null);
  const rafRef = useRef(null);
  const intensityRef = useRef(intensity);
  intensityRef.current = intensity;

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = width * dpr;
    canvas.height = height * dpr;
    const ctx = canvas.getContext('2d');
    ctx.scale(dpr, dpr);

    if (!particlesRef.current) {
      const sample = document.createElement('canvas');
      const SAMPLE_SIZE = 220;
      sample.width = SAMPLE_SIZE;
      sample.height = SAMPLE_SIZE;
      const sctx = sample.getContext('2d');
      sctx.clearRect(0, 0, SAMPLE_SIZE, SAMPLE_SIZE);
      sctx.save();
      if (flip) {
        sctx.translate(SAMPLE_SIZE, 0);
        sctx.scale(-1, 1);
      }
      sctx.font = `${SAMPLE_SIZE * 0.82}px sans-serif`;
      sctx.textAlign = 'center';
      sctx.textBaseline = 'middle';
      sctx.fillText(glyph, SAMPLE_SIZE / 2, SAMPLE_SIZE / 2 + SAMPLE_SIZE * 0.05);
      sctx.restore();

      const { data } = sctx.getImageData(0, 0, SAMPLE_SIZE, SAMPLE_SIZE);
      const points = [];
      const STEP = 2;
      for (let y = 0; y < SAMPLE_SIZE; y += STEP) {
        for (let x = 0; x < SAMPLE_SIZE; x += STEP) {
          const alpha = data[(y * SAMPLE_SIZE + x) * 4 + 3];
          if (alpha > 80) {
            points.push({
              x: (x / SAMPLE_SIZE) * width,
              y: (y / SAMPLE_SIZE) * height,
              r: 0.8 + Math.random() * 1.3,
              phase: Math.random() * Math.PI * 2,
              speed: 0.6 + Math.random() * 0.8,
              driftX: (Math.random() - 0.5) * 3.5,
              driftY: (Math.random() - 0.5) * 3.5
            });
          }
        }
      }
      particlesRef.current = points;
    }

    let t = 0;
    const draw = () => {
      t += 0.016;
      ctx.clearRect(0, 0, width, height);
      const glow = intensityRef.current;

      for (const p of particlesRef.current) {
        const twinkle = 0.55 + 0.45 * Math.sin(t * p.speed + p.phase);
        const px = p.x + Math.sin(t * 0.4 + p.phase) * p.driftX;
        const py = p.y + Math.cos(t * 0.35 + p.phase) * p.driftY;

        ctx.beginPath();
        ctx.arc(px, py, p.r * (0.85 + glow * 0.35), 0, Math.PI * 2);
        ctx.fillStyle = color;
        ctx.globalAlpha = twinkle * (0.35 + glow * 0.65);
        ctx.shadowColor = color;
        ctx.shadowBlur = 6 + glow * 5;
        ctx.fill();
      }
      ctx.globalAlpha = 1;
      ctx.shadowBlur = 0;

      rafRef.current = requestAnimationFrame(draw);
    };
    draw();

    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [glyph, color, width, height, flip]);

  return <canvas ref={canvasRef} style={{ width, height }} aria-hidden="true" />;
}

/**
 * Full-width scene for the hero card: bull anchored left, bear anchored
 * right, a glowing beam where their momentum "collides" in the middle.
 * The beam leans toward whichever side currently has the upper hand.
 */
export function BullBearScene({ advPct = 50, decPct = 50, className = '' }) {
  const meetPoint = Math.max(30, Math.min(70, advPct)); // % from left, clamped so it never hits the edges

  return (
    <div className={`relative h-[190px] w-full overflow-hidden ${className}`} aria-hidden="true">
      {/* Convergence beam */}
      <div
        className="absolute left-0 right-0 top-1/2 h-[3px] -translate-y-1/2"
        style={{
          background: `linear-gradient(90deg,
            transparent 0%,
            var(--gain-green) ${Math.max(meetPoint - 22, 0)}%,
            #ffffff ${meetPoint}%,
            var(--loss-red) ${Math.min(meetPoint + 22, 100)}%,
            transparent 100%)`,
          filter: 'blur(1.5px)',
          opacity: 0.85
        }}
      />
      <div
        className="arena-pulse absolute top-1/2 h-4 w-4 -translate-y-1/2 -translate-x-1/2 rounded-full bg-white"
        style={{ left: `${meetPoint}%`, filter: 'blur(6px)' }}
      />

      <div className="absolute bottom-2 left-2 sm:left-6">
        <ParticleCreature glyph="🐂" color="#22C55E" intensity={advPct / 100} width={230} height={170} />
      </div>
      <div className="absolute bottom-2 right-2 sm:right-6">
        <ParticleCreature glyph="🐻" color="#EF4444" intensity={decPct / 100} width={230} height={170} flip />
      </div>
    </div>
  );
}

export default BullBearScene;
