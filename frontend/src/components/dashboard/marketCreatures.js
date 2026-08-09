/**
 * Silhouettes for the market-state particle field.
 *
 * Each creature is a union of capsules and ellipses rather than a traced
 * outline. Hand-written outline paths are what produced the previous malformed
 * bull: one bad control point and a leg bends the wrong way. A union of solid
 * limb segments cannot self-intersect, every part is anatomically placed by
 * construction, and the filled region is all a particle field needs.
 *
 * Authored side-on, facing right, in a 100 x 64 box with the ground at y=58.
 */

const capsule = (x1, y1, x2, y2, r) => ({ type: 'capsule', x1, y1, x2, y2, r });
const ellipse = (cx, cy, rx, ry) => ({ type: 'ellipse', cx, cy, rx, ry });

// Charging bull: deep chest, shoulder hump, horns forward, tail up.
export const BULL = [
  ellipse(34, 27, 12.5, 11),          // hindquarter
  capsule(32, 27, 62, 25, 10),        // barrel
  ellipse(63, 26, 11.5, 10.5),        // chest
  capsule(58, 18, 67, 18.5, 5),       // shoulder hump
  capsule(70, 23.5, 79, 29, 5.8),     // neck
  capsule(79, 30, 88, 34, 4.4),       // skull
  ellipse(90, 35.5, 3.2, 2.7),        // muzzle
  capsule(79, 25, 84, 15.5, 1.9),     // near horn, swept high
  capsule(84, 15.5, 90.5, 17.5, 1.5), // near horn tip, curling forward
  capsule(76.5, 25.5, 81, 17, 1.7),   // far horn
  capsule(81, 17, 86.5, 19, 1.3),     // far horn tip
  ellipse(75, 28.5, 2.4, 3.2),        // ear
  capsule(65, 33, 68, 49, 2.9),       // near foreleg
  capsule(68, 49, 67, 57, 2.2),       // near cannon
  ellipse(67, 57.5, 2.9, 1.7),        // hoof
  capsule(60, 33, 62, 49, 2.6),       // far foreleg
  capsule(62, 49, 61, 57, 2),
  ellipse(61, 57.5, 2.6, 1.6),
  capsule(33, 33, 28, 45, 3.3),       // near hind leg, hock kicked back
  capsule(28, 45, 33, 57, 2.4),
  ellipse(33, 57.5, 3, 1.7),
  capsule(39, 33, 35, 45, 2.9),       // far hind leg
  capsule(35, 45, 39, 57, 2.2),
  ellipse(39, 57.5, 2.7, 1.6),
  capsule(23, 24, 17, 15, 1.7),       // tail, raised
  ellipse(16, 13.5, 2.6, 2.2)         // tuft
];

// Bear: heavier barrel, shoulder hump, short thick limbs, rounded ears, no horns.
export const BEAR = [
  ellipse(31, 30, 13, 12.5),          // rump
  capsule(30, 29, 60, 27, 12.5),      // barrel
  ellipse(59, 23, 10.5, 9),           // shoulder hump
  capsule(64, 26, 71, 28, 8.5),       // neck
  ellipse(77, 30, 7.5, 6.5),          // skull
  capsule(81, 32, 88, 33.5, 3.1),     // snout
  ellipse(89, 33.5, 2, 1.8),          // nose
  ellipse(73, 21, 3, 3),              // far ear
  ellipse(79.5, 20.5, 2.8, 2.8),      // near ear
  capsule(62, 34, 63, 52, 4.3),       // near foreleg
  ellipse(64, 55, 4.4, 2.8),          // paw
  capsule(55, 34, 56, 52, 3.9),       // far foreleg
  ellipse(57, 55, 4, 2.6),
  capsule(33, 35, 31, 51, 5),         // near hind leg
  ellipse(33, 55, 4.8, 2.9),          // paw
  capsule(40, 35, 38, 51, 4.4),       // far hind leg
  ellipse(40, 55, 4.3, 2.7),
  ellipse(24, 31, 3, 2.6)             // stub tail
];

export const BOX = { w: 100, h: 64 };

function insideCapsule(px, py, c) {
  const dx = c.x2 - c.x1;
  const dy = c.y2 - c.y1;
  const len2 = dx * dx + dy * dy || 1;
  let t = ((px - c.x1) * dx + (py - c.y1) * dy) / len2;
  t = t < 0 ? 0 : t > 1 ? 1 : t;
  const cx = c.x1 + dx * t;
  const cy = c.y1 + dy * t;
  return (px - cx) ** 2 + (py - cy) ** 2 <= c.r * c.r;
}

function insideEllipse(px, py, e) {
  return ((px - e.cx) / e.rx) ** 2 + ((py - e.cy) / e.ry) ** 2 <= 1;
}

export function isInside(px, py, shape) {
  for (const part of shape) {
    if (part.type === 'capsule' ? insideCapsule(px, py, part) : insideEllipse(px, py, part)) return true;
  }
  return false;
}

/**
 * Rejection-sample `count` points inside the silhouette.
 *
 * Sorted by x so a morph reassigns targets left-to-right: particles slide into
 * the new animal instead of swapping across it in a cloud.
 */
export function sampleShape(shape, count, rng = Math.random) {
  const pts = [];
  let guard = 0;
  while (pts.length < count && guard < count * 200) {
    guard += 1;
    const x = rng() * BOX.w;
    const y = rng() * BOX.h;
    if (isInside(x, y, shape)) pts.push({ x, y });
  }
  pts.sort((a, b) => a.x - b.x);
  return pts;
}

/** Neutral state: a calm elliptical band — deliberately not an animal. */
export function sampleRing(count, rng = Math.random) {
  const pts = [];
  const cx = BOX.w / 2;
  const cy = BOX.h / 2;
  for (let i = 0; i < count; i += 1) {
    const a = (i / count) * Math.PI * 2;
    const jitter = 0.86 + rng() * 0.28;
    pts.push({ x: cx + Math.cos(a) * 30 * jitter, y: cy + Math.sin(a) * 17 * jitter });
  }
  pts.sort((a, b) => a.x - b.x);
  return pts;
}

/**
 * Points along the silhouette's edge, found by scanning a grid and keeping
 * every inside cell that touches an outside one.
 *
 * The contour is what makes these read as a bull and a bear — an even fill of
 * dots is just a blob. Marching the boundary this way handles concave parts
 * (the gap between legs, under the jaw) that an angular sweep around the
 * centroid would cut straight across.
 */
export function traceBoundary(shape, step = 1.05) {
  const pts = [];
  for (let y = 0; y <= BOX.h; y += step) {
    for (let x = 0; x <= BOX.w; x += step) {
      if (!isInside(x, y, shape)) continue;
      if (
        !isInside(x - step, y, shape) ||
        !isInside(x + step, y, shape) ||
        !isInside(x, y - step, shape) ||
        !isInside(x, y + step, shape)
      ) {
        pts.push({ x, y, edge: true });
      }
    }
  }
  return pts;
}

/**
 * Nearest-neighbour edges, built once from the resting layout.
 *
 * Topology is fixed and only the positions animate, so the expensive part
 * happens at mount and each frame just strokes the same index pairs. Rebuilding
 * the graph every frame would be O(n²) on ~700 nodes, which is the difference
 * between 60fps and a slideshow.
 */
export function buildEdges(points, maxDist, maxPerNode = 3) {
  const cell = maxDist || 1;
  const grid = new Map();
  const key = (cx, cy) => `${cx},${cy}`;

  points.forEach((p, i) => {
    const k = key(Math.floor(p.x / cell), Math.floor(p.y / cell));
    if (!grid.has(k)) grid.set(k, []);
    grid.get(k).push(i);
  });

  const edges = [];
  const degree = new Array(points.length).fill(0);
  const seen = new Set();

  for (let i = 0; i < points.length; i += 1) {
    if (degree[i] >= maxPerNode) continue;
    const p = points[i];
    const cx = Math.floor(p.x / cell);
    const cy = Math.floor(p.y / cell);

    const near = [];
    for (let dx = -1; dx <= 1; dx += 1) {
      for (let dy = -1; dy <= 1; dy += 1) {
        const arr = grid.get(key(cx + dx, cy + dy));
        if (arr) near.push(...arr);
      }
    }

    near
      .filter((j) => j !== i)
      .map((j) => ({ j, d: (points[j].x - p.x) ** 2 + (points[j].y - p.y) ** 2 }))
      .sort((a, b) => a.d - b.d)
      .forEach(({ j, d }) => {
        if (degree[i] >= maxPerNode || degree[j] >= maxPerNode) return;
        if (d > maxDist * maxDist) return;
        const a = Math.min(i, j);
        const b = Math.max(i, j);
        const kk = a * 100000 + b;
        if (seen.has(kk)) return;
        seen.add(kk);
        edges.push(a, b);
        degree[i] += 1;
        degree[j] += 1;
      });
  }

  return edges;
}
