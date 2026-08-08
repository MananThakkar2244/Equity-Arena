import React, { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import { BullProfile } from './NeonBull';

/**
 * The Equity Arena bull — a real low-poly crystal sculpture in WebGL.
 *
 * Every angle you drag to is genuine geometry lit in real time, so the facets
 * catch highlights as the animal turns. The previous version cross-faded two
 * flat SVG views, which read as cardboard the moment you turned it side-on.
 *
 * Built entirely in code: no model file to ship, no texture to fetch. The mesh
 * is lofted from a handful of cross-section tables below, flat-shaded so each
 * quad reads as a cut face, with its own edges drawn over the top in a lighter
 * blue — that pairing is what makes it look faceted rather than merely smooth.
 */

/* ------------------------------------------------------------------ *
 * Geometry helpers
 * ------------------------------------------------------------------ */

/**
 * Loft a ring of `sides` points along a list of stations to make a tube.
 *
 * Each station carries its own frame (`u` vertical, `v` sideways) and a radius
 * per axis, so a cross-section can be an ellipse — a bull's barrel is deeper
 * than it is wide, and a circular sweep would read as a sausage.
 *
 * Indexed on purpose: EdgesGeometry needs shared vertices to find the real
 * facet edges instead of outlining every single triangle.
 */
function loft(stations, sides, jitter = 0) {
  const pos = [];
  const idx = [];

  // Deterministic per-vertex wobble. Perfectly regular rings read as machined
  // pipe; real cut crystal never has two faces at exactly the same radius.
  const wobble = (si, s) => {
    if (!jitter) return 1;
    const x = Math.sin(si * 12.9898 + s * 78.233) * 43758.5453;
    return 1 + jitter * (x - Math.floor(x) - 0.5);
  };

  stations.forEach((st, si) => {
    for (let s = 0; s < sides; s++) {
      const a = (s / sides) * Math.PI * 2;
      const j = wobble(si, s);
      const c = Math.cos(a) * st.ru * j;
      const d = Math.sin(a) * st.rv * j;
      pos.push(
        st.c.x + st.u.x * c + st.v.x * d,
        st.c.y + st.u.y * c + st.v.y * d,
        st.c.z + st.u.z * c + st.v.z * d
      );
    }
  });

  for (let i = 0; i < stations.length - 1; i++) {
    for (let s = 0; s < sides; s++) {
      const n = (s + 1) % sides;
      const a = i * sides + s;
      const b = i * sides + n;
      const c = (i + 1) * sides + n;
      const d = (i + 1) * sides + s;
      idx.push(a, b, c, a, c, d);
    }
  }

  // Cap both ends with a fan so the tube reads as a solid, not a pipe.
  const capStart = pos.length / 3;
  pos.push(stations[0].c.x, stations[0].c.y, stations[0].c.z);
  for (let s = 0; s < sides; s++) idx.push(capStart, (s + 1) % sides, s);

  const last = stations.length - 1;
  const capEnd = pos.length / 3;
  pos.push(stations[last].c.x, stations[last].c.y, stations[last].c.z);
  for (let s = 0; s < sides; s++) {
    idx.push(capEnd, last * sides + s, last * sides + ((s + 1) % sides));
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setIndex(idx);
  geo.computeVertexNormals();
  return geo;
}

const UP = new THREE.Vector3(0, 1, 0);
const SIDE = new THREE.Vector3(0, 0, 1);
const FWD = new THREE.Vector3(1, 0, 0);

/** Body / neck / head: rings stand upright in the YZ plane, marching along X. */
function alongX(rows, sides, jitter = 0.05) {
  return loft(
    rows.map(([x, y, ru, rv]) => ({
      c: new THREE.Vector3(x, y, 0),
      u: UP,
      v: SIDE,
      ru,
      rv
    })),
    sides,
    jitter
  );
}

/** Legs: rings lie flat in the XZ plane, marching down Y. */
function alongY(rows, sides, jitter = 0.04) {
  return loft(
    rows.map(([y, x, z, r]) => ({
      c: new THREE.Vector3(x, y, z),
      u: FWD,
      v: SIDE,
      ru: r,
      rv: r
    })),
    sides,
    jitter
  );
}

/**
 * Horns and tail curve through all three axes, so their frames are carried
 * along the path by minimal rotation. Frenet frames flip at inflection points
 * and would put a visible twist halfway up a horn.
 */
function alongPath(points, radii, sides, samples = 22) {
  const curve = new THREE.CatmullRomCurve3(
    points.map((p) => new THREE.Vector3(...p)),
    false,
    'catmullrom',
    0.4
  );

  const pts = [];
  const tangents = [];
  for (let i = 0; i <= samples; i++) {
    const t = i / samples;
    pts.push(curve.getPointAt(t));
    tangents.push(curve.getTangentAt(t).normalize());
  }

  // Seed a frame perpendicular to the first tangent, then carry it forward.
  let u = new THREE.Vector3(0, 0, 1).cross(tangents[0]);
  if (u.lengthSq() < 1e-6) u = new THREE.Vector3(1, 0, 0).cross(tangents[0]);
  u.normalize();

  const stations = [];
  for (let i = 0; i <= samples; i++) {
    if (i > 0) {
      const axis = new THREE.Vector3().crossVectors(tangents[i - 1], tangents[i]);
      if (axis.lengthSq() > 1e-9) {
        const angle = Math.acos(THREE.MathUtils.clamp(tangents[i - 1].dot(tangents[i]), -1, 1));
        u.applyAxisAngle(axis.normalize(), angle);
      }
      u.addScaledVector(tangents[i], -u.dot(tangents[i])).normalize();
    }
    const v = new THREE.Vector3().crossVectors(tangents[i], u).normalize();

    // Radii are given per control point; walk them smoothly across the sweep.
    const f = (i / samples) * (radii.length - 1);
    const lo = Math.floor(f);
    const r = THREE.MathUtils.lerp(radii[lo], radii[Math.min(lo + 1, radii.length - 1)], f - lo);

    stations.push({ c: pts[i], u: u.clone(), v, ru: r, rv: r });
  }
  return loft(stations, sides);
}

/** A faceted blob — shoulders, brisket, ears, tail tuft. */
function blob(cx, cy, cz, sx, sy, sz) {
  const geo = new THREE.SphereGeometry(1, 7, 5);
  geo.scale(sx, sy, sz);
  geo.translate(cx, cy, cz);
  return geo;
}

/* ------------------------------------------------------------------ *
 * The animal, in cross-sections. Bull faces +X, up is +Y, width is Z.
 * ------------------------------------------------------------------ */

/**
 * [x, y, verticalRadius, horizontalRadius]
 *
 * A bull carries its weight at the front: the barrel deepens toward the chest,
 * the withers stand proud of the backline, and the legs are only about as long
 * as the body is deep. Give it even proportions and it reads as a dog.
 */
const BODY = [
  [-1.75, 1.42, 0.28, 0.24],
  [-1.45, 1.4, 0.46, 0.4],
  [-0.95, 1.38, 0.54, 0.5],
  [-0.3, 1.38, 0.55, 0.52],
  [0.3, 1.45, 0.6, 0.55],
  [0.72, 1.52, 0.66, 0.57], // withers — swelled into the backline, not bolted on
  [1.1, 1.52, 0.56, 0.5]
];

// Short and thick — the neck is nearly as deep as the chest it grows out of.
const NECK = [
  [1.06, 1.52, 0.56, 0.5],
  [1.42, 1.48, 0.46, 0.41],
  [1.75, 1.44, 0.38, 0.34]
];

// Broad at the skull, tapering hard to the muzzle.
const HEAD = [
  [1.72, 1.44, 0.36, 0.32],
  [1.95, 1.42, 0.34, 0.31],
  [2.2, 1.34, 0.28, 0.26],
  [2.45, 1.26, 0.22, 0.21],
  [2.62, 1.22, 0.17, 0.17]
];

// [y, x, z, radius] — heavy at the shoulder and haunch, fining down to the
// cannon bone. The front pair strides and the rear pair pushes off, because a
// square four-square stance reads as a toy.
const LEGS = [
  [
    [1.55, 0.8, 0.3, 0.36],
    [1.05, 0.88, 0.32, 0.24],
    [0.6, 0.96, 0.33, 0.145],
    [0.22, 1.0, 0.33, 0.11],
    [0.06, 1.01, 0.33, 0.105]
  ],
  [
    [1.55, 0.78, -0.3, 0.36],
    [1.05, 0.7, -0.32, 0.24],
    [0.6, 0.6, -0.33, 0.145],
    [0.22, 0.54, -0.33, 0.11],
    [0.06, 0.53, -0.33, 0.105]
  ],
  [
    [1.6, -1.1, 0.3, 0.44],
    [1.1, -1.25, 0.32, 0.28],
    [0.62, -1.14, 0.33, 0.15],
    [0.22, -1.08, 0.33, 0.11],
    [0.06, -1.07, 0.33, 0.105]
  ],
  [
    [1.6, -1.14, -0.3, 0.44],
    [1.1, -1.34, -0.32, 0.28],
    [0.62, -1.32, -0.33, 0.15],
    [0.22, -1.3, -0.33, 0.11],
    [0.06, -1.29, -0.33, 0.105]
  ]
];

// Out of the poll, sweeping wide, tips finishing UP. Let the tips fall forward
// instead and the pair closes into a ram's curl — a handle, not a weapon.
const HORN_RADII = [0.12, 0.09, 0.062, 0.034, 0.01];
const hornPath = (s) => [
  [1.9, 1.66, 0.18 * s],
  [2.02, 1.84, 0.36 * s],
  [2.16, 1.98, 0.46 * s],
  [2.3, 2.16, 0.44 * s],
  [2.38, 2.36, 0.36 * s]
];

// Hung close to the rump; swung out wide it reads as a stray wire.
const TAIL = [
  [-1.7, 1.6, 0],
  [-1.86, 1.24, 0.03],
  [-1.88, 0.88, 0.05],
  [-1.82, 0.6, 0.04]
];

const HEAD_PIVOT = new THREE.Vector3(1.78, 1.44, 0);

/* ------------------------------------------------------------------ *
 * Procedural textures — kept in code so the component ships alone.
 * ------------------------------------------------------------------ */

function softDot() {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d');
  const grd = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  grd.addColorStop(0, 'rgba(255,255,255,1)');
  grd.addColorStop(0.35, 'rgba(191,219,254,0.7)');
  grd.addColorStop(1, 'rgba(147,197,253,0)');
  g.fillStyle = grd;
  g.fillRect(0, 0, 64, 64);
  return new THREE.CanvasTexture(c);
}

function floorGlow() {
  const c = document.createElement('canvas');
  c.width = c.height = 256;
  const g = c.getContext('2d');
  const grd = g.createRadialGradient(128, 128, 0, 128, 128, 128);
  // Kept well off full brightness: additive blending plus bloom turns anything
  // stronger into a white hole in the middle of the podium.
  grd.addColorStop(0, 'rgba(96,165,250,0.5)');
  grd.addColorStop(0.32, 'rgba(59,130,246,0.2)');
  grd.addColorStop(0.62, 'rgba(37,99,235,0.07)');
  grd.addColorStop(1, 'rgba(0,0,0,0)');
  g.fillStyle = grd;
  g.fillRect(0, 0, 256, 256);
  return new THREE.CanvasTexture(c);
}

/**
 * A gradient sky used only as a reflection source. Polished facets need
 * something to mirror or they render as flat colour regardless of the lights.
 */
function studioEnv() {
  const c = document.createElement('canvas');
  c.width = 256;
  c.height = 128;
  const g = c.getContext('2d');
  const grd = g.createLinearGradient(0, 0, 0, 128);
  grd.addColorStop(0, '#0a1230');
  grd.addColorStop(0.46, '#3b82f6');
  grd.addColorStop(0.54, '#1e3a8a');
  grd.addColorStop(1, '#04070f');
  g.fillStyle = grd;
  g.fillRect(0, 0, 256, 128);
  // A cool highlight the crystal can catch as it turns.
  const spot = g.createRadialGradient(70, 40, 0, 70, 40, 46);
  spot.addColorStop(0, 'rgba(219,234,254,0.95)');
  spot.addColorStop(1, 'rgba(219,234,254,0)');
  g.fillStyle = spot;
  g.fillRect(0, 0, 256, 128);
  const tex = new THREE.CanvasTexture(c);
  tex.mapping = THREE.EquirectangularReflectionMapping;
  return tex;
}

/* ------------------------------------------------------------------ *
 * Component
 * ------------------------------------------------------------------ */

const AUTO_SPIN = 0.32; // rad/s — a slow showroom turntable, not a fidget toy
const DRAG_SENS = 0.0085; // rad per pixel
const DAMPING = 0.93;

export function Bull360({
  width = 300,
  height = 220,
  autoSpin = true,
  showDegrees = true,
  showHint = true,
  className = ''
}) {
  const hostRef = useRef(null);
  const degRef = useRef(null);
  const needleRef = useRef(null);
  const [dragging, setDragging] = useState(false);
  const [spinning, setSpinning] = useState(autoSpin);
  const [failed, setFailed] = useState(false);

  // Live values the render loop owns. Kept off React state so a 60fps turn
  // never re-renders the dashboard around it.
  const ctl = useRef({ angle: -0.42, velocity: 0, pitch: 0.16, spin: autoSpin, drag: false });

  useEffect(() => {
    ctl.current.spin = spinning;
  }, [spinning]);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return undefined;

    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const dispose = [];
    let renderer;

    try {
      renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
    } catch {
      setFailed(true);
      return undefined;
    }

    // Capped at 1.5: bloom is fragment-bound, and a retina 2x buffer quadruples
    // that cost for a difference nobody can see at this size.
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));
    renderer.setSize(host.clientWidth || width, host.clientHeight || height, false);
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.06;
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.domElement.style.width = '100%';
    renderer.domElement.style.height = '100%';
    renderer.domElement.style.display = 'block';
    renderer.domElement.style.touchAction = 'none';
    host.appendChild(renderer.domElement);

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x04070f);

    const env = studioEnv();
    const pmrem = new THREE.PMREMGenerator(renderer);
    scene.environment = pmrem.fromEquirectangular(env).texture;
    env.dispose();
    pmrem.dispose();
    dispose.push(scene.environment);

    const camera = new THREE.PerspectiveCamera(32, 1, 0.1, 100);
    const target = new THREE.Vector3(0, 1.1, 0);

    /* ---- Materials ---- */
    // Metallic on purpose: it is the reflected studio gradient, not the lights,
    // that gives each facet its own value — which is what separates cut crystal
    // from a smoothly shaded blue blob.
    const crystal = new THREE.MeshStandardMaterial({
      color: 0x1d4ed8,
      metalness: 0.74,
      roughness: 0.16,
      flatShading: true,
      emissive: 0x0b1e52,
      emissiveIntensity: 0.35,
      envMapIntensity: 2.2,
      side: THREE.DoubleSide
    });
    // Lighter than the body but still the same crystal — near-white horns read
    // as a plastic part stuck onto the sculpture.
    const hornMat = new THREE.MeshStandardMaterial({
      color: 0x60a5fa,
      metalness: 0.65,
      roughness: 0.15,
      flatShading: true,
      emissive: 0x1e3a8a,
      emissiveIntensity: 0.4,
      envMapIntensity: 2.2,
      side: THREE.DoubleSide
    });
    // Only the hard creases. Outline every facet and the sculpture turns into a
    // wireframe cage instead of a solid with lit edges.
    const edgeMat = new THREE.LineBasicMaterial({
      color: 0x9fc6ff,
      transparent: true,
      opacity: 0.26,
      blending: THREE.AdditiveBlending,
      depthWrite: false
    });
    dispose.push(crystal, hornMat, edgeMat);

    /* ---- Bull ---- */
    const bull = new THREE.Group();
    const headGroup = new THREE.Group();

    const add = (geo, mat, group) => {
      dispose.push(geo);
      group.add(new THREE.Mesh(geo, mat));
      const eg = new THREE.EdgesGeometry(geo, 26);
      dispose.push(eg);
      group.add(new THREE.LineSegments(eg, edgeMat));
    };

    add(alongX(BODY, 6), crystal, bull);
    add(alongX(NECK, 6), crystal, bull);
    add(blob(0.95, 1.1, 0, 0.34, 0.42, 0.42), crystal, bull); // brisket
    add(blob(1.45, 1.12, 0, 0.32, 0.26, 0.28), crystal, bull); // dewlap
    LEGS.forEach((leg) => {
      add(alongY(leg, 5), crystal, bull);
      const [, hx, hz] = leg[leg.length - 1];
      const hoof = new THREE.CylinderGeometry(0.13, 0.115, 0.14, 6);
      hoof.translate(hx, 0.06, hz);
      add(hoof, crystal, bull);
    });
    add(alongPath(TAIL, [0.08, 0.05, 0.038, 0.028], 5), crystal, bull);
    add(blob(-1.81, 0.54, 0.04, 0.075, 0.12, 0.075), crystal, bull); // tail tuft

    // Head parts are modelled in world space, then shifted onto the pivot so
    // the whole skull can drop into a lowered, ready-to-charge angle.
    const headParts = [
      [alongX(HEAD, 6), crystal],
      [alongPath(hornPath(1), HORN_RADII, 5), hornMat],
      [alongPath(hornPath(-1), HORN_RADII, 5), hornMat],
      [blob(1.86, 1.52, 0.36, 0.14, 0.07, 0.18), crystal],
      [blob(1.86, 1.52, -0.36, 0.14, 0.07, 0.18), crystal]
    ];
    headParts.forEach(([geo, mat]) => {
      geo.translate(-HEAD_PIVOT.x, -HEAD_PIVOT.y, -HEAD_PIVOT.z);
      add(geo, mat, headGroup);
    });
    headGroup.position.copy(HEAD_PIVOT);
    headGroup.rotation.z = -0.28;
    bull.add(headGroup);

    // Sit the animal on the podium, centred on the turntable axis so it spins
    // about itself rather than orbiting off-frame.
    const box = new THREE.Box3().setFromObject(bull);
    const size = box.getSize(new THREE.Vector3());
    const centre = box.getCenter(new THREE.Vector3());
    const scale = 3.55 / Math.max(size.x, size.z);
    const pivot = new THREE.Group();
    bull.position.set(-centre.x, -box.min.y, -centre.z);
    pivot.add(bull);
    pivot.scale.setScalar(scale);
    scene.add(pivot);

    /* ---- Podium ---- */
    const stage = new THREE.Group();
    const discMat = new THREE.MeshStandardMaterial({
      color: 0x0b1330,
      metalness: 0.92,
      roughness: 0.28,
      envMapIntensity: 1.3
    });
    dispose.push(discMat);

    const disc = new THREE.CylinderGeometry(1.86, 1.94, 0.17, 64);
    disc.translate(0, -0.085, 0);
    dispose.push(disc);
    stage.add(new THREE.Mesh(disc, discMat));

    const ring = (radius, tube, colour, opacity, y) => {
      const geo = new THREE.TorusGeometry(radius, tube, 8, 96);
      geo.rotateX(-Math.PI / 2);
      geo.translate(0, y, 0);
      const mat = new THREE.MeshBasicMaterial({
        color: colour,
        transparent: opacity < 1,
        opacity,
        blending: THREE.AdditiveBlending,
        depthWrite: false
      });
      dispose.push(geo, mat);
      stage.add(new THREE.Mesh(geo, mat));
    };
    ring(1.9, 0.03, 0x93c5fd, 1, 0.005);
    ring(1.62, 0.016, 0x60a5fa, 0.85, -0.055);
    ring(2.2, 0.012, 0x3b82f6, 0.5, -0.16);

    const glowTex = floorGlow();
    const glowMat = new THREE.MeshBasicMaterial({
      map: glowTex,
      transparent: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false
    });
    const glowGeo = new THREE.PlaneGeometry(11, 11);
    glowGeo.rotateX(-Math.PI / 2);
    glowGeo.translate(0, -0.19, 0);
    dispose.push(glowTex, glowMat, glowGeo);
    stage.add(new THREE.Mesh(glowGeo, glowMat));
    scene.add(stage);

    /* ---- Motes drifting up out of the podium ---- */
    const COUNT = 140;
    const motePos = new Float32Array(COUNT * 3);
    const moteSpeed = new Float32Array(COUNT);
    for (let i = 0; i < COUNT; i++) {
      const a = Math.random() * Math.PI * 2;
      const r = 0.5 + Math.random() * 1.9;
      motePos[i * 3] = Math.cos(a) * r;
      motePos[i * 3 + 1] = Math.random() * 3.2;
      motePos[i * 3 + 2] = Math.sin(a) * r;
      moteSpeed[i] = 0.06 + Math.random() * 0.16;
    }
    const moteGeo = new THREE.BufferGeometry();
    moteGeo.setAttribute('position', new THREE.BufferAttribute(motePos, 3));
    const dotTex = softDot();
    const moteMat = new THREE.PointsMaterial({
      size: 0.04,
      map: dotTex,
      transparent: true,
      opacity: 0.7,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      sizeAttenuation: true
    });
    dispose.push(moteGeo, dotTex, moteMat);
    scene.add(new THREE.Points(moteGeo, moteMat));

    /* ---- Light rain falling behind the sculpture ---- */
    const streakMat = new THREE.MeshBasicMaterial({
      color: 0x93c5fd,
      transparent: true,
      opacity: 0.15,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      side: THREE.DoubleSide
    });
    dispose.push(streakMat);
    const streaks = [];
    for (let i = 0; i < 16; i++) {
      const geo = new THREE.PlaneGeometry(0.012, 0.6 + Math.random() * 1.5);
      dispose.push(geo);
      const mesh = new THREE.Mesh(geo, streakMat);
      const a = Math.random() * Math.PI * 2;
      const r = 1.5 + Math.random() * 1.9;
      mesh.position.set(Math.cos(a) * r, Math.random() * 3.2, Math.sin(a) * r);
      mesh.userData.speed = 0.5 + Math.random() * 1.1;
      streaks.push(mesh);
      scene.add(mesh);
    }

    /* ---- Lights ---- */
    // Deliberately little ambient: the contrast between a facet catching the key
    // and one falling into shadow is the whole effect. Fill it evenly and the
    // sculpture flattens into a single blue silhouette.
    const key = new THREE.DirectionalLight(0xdbeafe, 3.4);
    key.position.set(3.2, 5.2, 4.0);
    const rim = new THREE.DirectionalLight(0x3b82f6, 3.6);
    rim.position.set(-4.2, 2.6, -3.4);
    const fill = new THREE.DirectionalLight(0x93c5fd, 0.7);
    fill.position.set(1.6, 0.6, 5.0);
    const bounce = new THREE.PointLight(0x60a5fa, 3.5, 9, 2);
    bounce.position.set(0, 0.12, 0);
    scene.add(key, rim, fill, bounce, new THREE.HemisphereLight(0x60a5fa, 0x070b18, 0.35));

    /* ---- Composer ---- */
    const composer = new EffectComposer(renderer);
    composer.addPass(new RenderPass(scene, camera));
    // High threshold on purpose — bloom the neon rings and the hot facets, not
    // the whole animal, or the silhouette softens into a smudge.
    const bloom = new UnrealBloomPass(new THREE.Vector2(1, 1), 0.6, 0.55, 0.8);
    composer.addPass(bloom);
    composer.addPass(new OutputPass());

    /** Frame the turntable whatever shape the host box happens to be. */
    const resize = () => {
      const w = host.clientWidth || width;
      const h = host.clientHeight || height;
      if (!w || !h) return;
      const aspect = w / h;
      camera.aspect = aspect;
      const halfFov = (camera.fov * Math.PI) / 360;
      const distH = 1.95 / Math.tan(halfFov);
      const distW = 2.25 / (Math.tan(halfFov) * aspect);
      camera.userData.dist = Math.max(distH, distW);
      camera.updateProjectionMatrix();
      renderer.setSize(w, h, false);
      composer.setSize(w, h);
      bloom.resolution.set(w, h);
    };
    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(host);

    /* ---- Interaction ---- */
    const canvas = renderer.domElement;
    const drag = { x: 0, y: 0, angle: 0, pitch: 0, moved: false, id: null };

    const onDown = (e) => {
      drag.id = e.pointerId;
      drag.x = e.clientX;
      drag.y = e.clientY;
      drag.angle = ctl.current.angle;
      drag.pitch = ctl.current.pitch;
      drag.moved = false;
      ctl.current.drag = true;
      ctl.current.velocity = 0;
      setDragging(true);
      canvas.setPointerCapture?.(e.pointerId);
    };
    const onMove = (e) => {
      if (!ctl.current.drag || e.pointerId !== drag.id) return;
      const dx = e.clientX - drag.x;
      const dy = e.clientY - drag.y;
      if (Math.abs(dx) > 3 || Math.abs(dy) > 3) drag.moved = true;
      const next = drag.angle + dx * DRAG_SENS;
      ctl.current.velocity = next - ctl.current.angle;
      ctl.current.angle = next;
      ctl.current.pitch = THREE.MathUtils.clamp(drag.pitch + dy * 0.004, -0.05, 0.5);
    };
    const onUp = (e) => {
      if (e.pointerId !== drag.id) return;
      ctl.current.drag = false;
      setDragging(false);
      canvas.releasePointerCapture?.(e.pointerId);
      // A tap with no travel toggles the turntable; a real drag parks it.
      if (!drag.moved) setSpinning((v) => !v);
    };
    canvas.addEventListener('pointerdown', onDown);
    canvas.addEventListener('pointermove', onMove);
    canvas.addEventListener('pointerup', onUp);
    canvas.addEventListener('pointercancel', onUp);

    /* ---- Loop ---- */
    let raf = 0;
    let visible = true;
    let last = performance.now();

    const io = new IntersectionObserver(([entry]) => {
      visible = entry.isIntersecting;
    });
    io.observe(host);

    const frame = (now) => {
      raf = requestAnimationFrame(frame);
      const dt = Math.min((now - last) / 1000, 0.05);
      last = now;
      if (!visible || document.hidden) return;

      const c = ctl.current;
      if (!c.drag) {
        if (Math.abs(c.velocity) > 0.0002) {
          // Let the throw carry, then hand back to the turntable.
          c.angle += c.velocity;
          c.velocity *= DAMPING;
        } else if (c.spin && !reduced) {
          c.angle += AUTO_SPIN * dt;
        }
      }

      pivot.rotation.y = c.angle;

      const dist = camera.userData.dist || 6.5;
      camera.position.set(0, target.y + dist * Math.sin(c.pitch), dist * Math.cos(c.pitch));
      camera.lookAt(target);

      if (!reduced) {
        const arr = moteGeo.attributes.position.array;
        for (let i = 0; i < COUNT; i++) {
          arr[i * 3 + 1] += moteSpeed[i] * dt;
          if (arr[i * 3 + 1] > 3.5) arr[i * 3 + 1] = 0;
        }
        moteGeo.attributes.position.needsUpdate = true;

        streaks.forEach((s) => {
          s.position.y -= s.userData.speed * dt;
          if (s.position.y < -0.3) s.position.y = 3.5;
        });
      }

      composer.render();

      // Written straight to the DOM: routing a per-frame angle through React
      // state would re-render the whole dashboard sixty times a second.
      const deg = ((((c.angle * 180) / Math.PI) % 360) + 360) % 360;
      if (degRef.current) degRef.current.textContent = String(Math.round(deg)).padStart(3, '0');
      if (needleRef.current) needleRef.current.style.transform = `translate(-50%,-100%) rotate(${deg}deg)`;
    };
    raf = requestAnimationFrame(frame);

    return () => {
      cancelAnimationFrame(raf);
      io.disconnect();
      ro.disconnect();
      canvas.removeEventListener('pointerdown', onDown);
      canvas.removeEventListener('pointermove', onMove);
      canvas.removeEventListener('pointerup', onUp);
      canvas.removeEventListener('pointercancel', onUp);
      dispose.forEach((d) => d.dispose?.());
      composer.dispose?.();
      // dispose() alone leaves the GL context alive until GC gets around to it.
      // This component remounts on every filled trade, and browsers only allow
      // a handful of live contexts before they start killing the oldest.
      renderer.forceContextLoss?.();
      renderer.dispose();
      if (canvas.parentNode === host) host.removeChild(canvas);
    };
    // Built once. Size changes are handled by the ResizeObserver above, and
    // rebuilding the scene on every prop tick would thrash the GPU.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (failed) {
    return (
      <div className={`relative select-none ${className}`} style={{ width, height }}>
        <BullProfile tone="crystal" idPrefix="bull-fallback" />
      </div>
    );
  }

  return (
    <div
      className={`relative select-none ${className}`}
      style={{ width, height }}
      role="img"
      aria-label="Equity Arena bull — drag to turn through 360 degrees"
    >
      <div
        ref={hostRef}
        className="h-full w-full overflow-hidden rounded-2xl"
        style={{
          cursor: dragging ? 'grabbing' : 'grab',
          // Feathered so the dark showroom melts into whatever card holds it,
          // rather than stamping a hard black rectangle on a light dashboard.
          maskImage: 'radial-gradient(ellipse at 50% 55%, #000 46%, transparent 80%)',
          WebkitMaskImage: 'radial-gradient(ellipse at 50% 55%, #000 46%, transparent 80%)'
        }}
      />

      {showDegrees && (
        <div className="pointer-events-none absolute bottom-0 right-0 flex items-center gap-1.5">
          <span className="relative block h-4 w-4 rounded-full border" style={{ borderColor: 'rgba(96,165,250,0.5)' }}>
            <span
              ref={needleRef}
              className="absolute left-1/2 top-1/2 block h-[7px] w-px origin-bottom"
              style={{ background: 'var(--accent)', transformOrigin: '50% 100%' }}
            />
          </span>
          <span
            className="rounded-md border px-1.5 py-0.5 font-mono text-[10px] font-bold tabular-nums"
            style={{
              borderColor: 'var(--border-card)',
              backgroundColor: 'var(--bg-card)',
              color: 'var(--accent)'
            }}
          >
            <span ref={degRef}>000</span>°
          </span>
        </div>
      )}

      {showHint && !dragging && (
        <span className="pointer-events-none absolute left-0 top-0 font-mono text-[9px] uppercase tracking-[0.14em] theme-text-dim">
          {spinning ? 'Drag to turn' : 'Tap to spin'}
        </span>
      )}
    </div>
  );
}

export default Bull360;
