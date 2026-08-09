import React, { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';

/**
 * The Equity Arena bull — a real WebGL sculpture, not a rotated picture.
 *
 * The anatomy is not primitives glued together; that is what made the previous
 * bull read as disjointed. The torso, neck, head and every leg are *swept
 * surfaces*: an elliptical cross-section carried along a spine curve with its
 * radii eased between anatomical control points. That yields one continuous
 * skin with smooth normals, so chest flows into shoulder and shoulder into
 * neck the way muscle actually does.
 *
 * Those sections are built against a world-aligned frame rather than Frenet
 * frames. Frenet normals roll as a curve bends, which would twist the ellipses
 * and wring out the ribcage. Horns and tail *do* use Frenet frames, but their
 * sections are circular, so the roll is invisible there.
 *
 * Drop a sculpted `public/assets/bull/bull.glb` in and it is probed for at
 * mount, lazily loaded and swapped over this mesh. No code change needed.
 */

/* ------------------------------------------------------------------ *
 * Palette
 * ------------------------------------------------------------------ */
const BODY_COLOR = 0x16264a;
const GOLD_COLOR = 0xd9a441;
const HOOF_COLOR = 0xc9903a;
const EYE_COLOR = 0x7dd3fc;
const CYAN = 0x22d3ee;
const BLUE = 0x3b82f6;

const TARGET_HEIGHT = 1.62;
const AUTO_SPEED = 0.0022;
const GLB_URL = '/assets/bull/bull.glb';

/* ------------------------------------------------------------------ *
 * Geometry helpers
 * ------------------------------------------------------------------ */

/**
 * Catmull-Rom through a list of scalars, sampled with the same parameter
 * mapping THREE uses for an open CatmullRomCurve3 — so a radius lines up with
 * the point it was authored against.
 */
function sampleScalar(values, u) {
  const n = values.length;
  const p = Math.min(Math.max(u, 0), 1) * (n - 1);
  const i = Math.min(Math.floor(p), n - 2);
  const f = p - i;
  const p0 = values[Math.max(0, i - 1)];
  const p1 = values[i];
  const p2 = values[i + 1];
  const p3 = values[Math.min(n - 1, i + 2)];
  const f2 = f * f;
  const f3 = f2 * f;
  return (
    0.5 *
    (2 * p1 + (-p0 + p2) * f + (2 * p0 - 5 * p1 + 4 * p2 - p3) * f2 + (-p0 + 3 * p1 - 3 * p2 + p3) * f3)
  );
}

/**
 * Triangle winding decides which way computeVertexNormals points the skin, and
 * getting it backwards on a metal turns the whole limb inside out. Rather than
 * reason about it per shape, compare the finished normals against the outward
 * direction from the spine and flip the index buffer if the majority disagree.
 */
function enforceOutwardNormals(geometry, centers) {
  geometry.computeVertexNormals();
  const normal = geometry.getAttribute('normal');
  const position = geometry.getAttribute('position');

  let agree = 0;
  let disagree = 0;
  const step = Math.max(1, Math.floor(position.count / 200));

  for (let i = 0; i < position.count; i += step) {
    const c = centers[i];
    if (!c) continue;
    const ox = position.getX(i) - c.x;
    const oy = position.getY(i) - c.y;
    const oz = position.getZ(i) - c.z;
    const dot = ox * normal.getX(i) + oy * normal.getY(i) + oz * normal.getZ(i);
    if (dot >= 0) agree += 1;
    else disagree += 1;
  }

  if (disagree > agree) {
    const index = geometry.getIndex();
    const arr = index.array;
    for (let i = 0; i < arr.length; i += 3) {
      const tmp = arr[i + 1];
      arr[i + 1] = arr[i + 2];
      arr[i + 2] = tmp;
    }
    index.needsUpdate = true;
    geometry.computeVertexNormals();
  }
  return geometry;
}

/**
 * Sweep an ellipse along a curve that lives in the XY plane, offset to `z`.
 *
 * The section's "vertical" axis is the curve normal taken in-plane, so a leg
 * bending at the hock keeps its thickness square to the bone instead of
 * shearing. Controls are `{ x, y, ry, rz }`.
 */
function planarSweep(controls, { z = 0, steps = 84, radial = 30 } = {}) {
  const curve = new THREE.CatmullRomCurve3(
    controls.map((c) => new THREE.Vector3(c.x, c.y, 0)),
    false,
    'catmullrom',
    0.5
  );
  const rys = controls.map((c) => c.ry);
  const rzs = controls.map((c) => c.rz);

  const positions = [];
  const indices = [];
  const centers = [];

  const point = new THREE.Vector3();
  const tangent = new THREE.Vector3();

  for (let i = 0; i <= steps; i += 1) {
    const u = i / steps;
    curve.getPoint(u, point);
    curve.getTangent(u, tangent);

    // In-plane perpendicular: the section's up axis.
    const ux = -tangent.y;
    const uy = tangent.x;

    const ry = sampleScalar(rys, u);
    const rz = sampleScalar(rzs, u);
    const cz = point.z + z;

    for (let j = 0; j < radial; j += 1) {
      const theta = (j / radial) * Math.PI * 2;
      const cos = Math.cos(theta);
      const sin = Math.sin(theta);
      positions.push(point.x + ux * ry * cos, point.y + uy * ry * cos, cz + rz * sin);
      centers.push({ x: point.x, y: point.y, z: cz });
    }
  }

  for (let i = 0; i < steps; i += 1) {
    for (let j = 0; j < radial; j += 1) {
      const jn = (j + 1) % radial;
      const a = i * radial + j;
      const b = i * radial + jn;
      const c = (i + 1) * radial + j;
      const d = (i + 1) * radial + jn;
      indices.push(a, c, b, b, c, d);
    }
  }

  // Caps, so the silhouette never shows a hollow tube end.
  const capStart = positions.length / 3;
  curve.getPoint(0, point);
  positions.push(point.x, point.y, point.z + z);
  centers.push({ x: point.x, y: point.y, z: point.z + z });
  for (let j = 0; j < radial; j += 1) {
    indices.push(capStart, (j + 1) % radial, j);
  }

  const capEnd = positions.length / 3;
  curve.getPoint(1, point);
  positions.push(point.x, point.y, point.z + z);
  centers.push({ x: point.x, y: point.y, z: point.z + z });
  const last = steps * radial;
  for (let j = 0; j < radial; j += 1) {
    indices.push(capEnd, last + j, last + ((j + 1) % radial));
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setIndex(indices);
  return enforceOutwardNormals(geometry, centers);
}

/**
 * Circular sweep along a genuinely 3D curve — horns and tail, which leave the
 * XY plane. Frenet roll is harmless on a circular section.
 */
function tubeSweep(points, radii, { steps = 56, radial = 20 } = {}) {
  const curve = new THREE.CatmullRomCurve3(
    points.map((p) => new THREE.Vector3(p[0], p[1], p[2])),
    false,
    'catmullrom',
    0.5
  );
  const frames = curve.computeFrenetFrames(steps, false);

  const positions = [];
  const indices = [];
  const centers = [];
  const point = new THREE.Vector3();

  for (let i = 0; i <= steps; i += 1) {
    const u = i / steps;
    curve.getPointAt(u, point);
    const normal = frames.normals[i];
    const binormal = frames.binormals[i];
    const r = sampleScalar(radii, u);

    for (let j = 0; j < radial; j += 1) {
      const theta = (j / radial) * Math.PI * 2;
      const cos = Math.cos(theta) * r;
      const sin = Math.sin(theta) * r;
      positions.push(
        point.x + normal.x * cos + binormal.x * sin,
        point.y + normal.y * cos + binormal.y * sin,
        point.z + normal.z * cos + binormal.z * sin
      );
      centers.push({ x: point.x, y: point.y, z: point.z });
    }
  }

  for (let i = 0; i < steps; i += 1) {
    for (let j = 0; j < radial; j += 1) {
      const jn = (j + 1) % radial;
      const a = i * radial + j;
      const b = i * radial + jn;
      const c = (i + 1) * radial + j;
      const d = (i + 1) * radial + jn;
      indices.push(a, c, b, b, c, d);
    }
  }

  const capStart = positions.length / 3;
  curve.getPointAt(0, point);
  positions.push(point.x, point.y, point.z);
  centers.push({ x: point.x, y: point.y, z: point.z });
  for (let j = 0; j < radial; j += 1) {
    indices.push(capStart, (j + 1) % radial, j);
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setIndex(indices);
  return enforceOutwardNormals(geometry, centers);
}

/* ------------------------------------------------------------------ *
 * Anatomy — authored in side view, mirrored across Z
 * ------------------------------------------------------------------ */

// Rear to base-of-neck. The rise at x≈0.70 is the shoulder hump; the widest
// section at x≈0.46 is the chest, which is what sells "powerful" in profile.
const TORSO = [
  { x: -1.2, y: 1.02, ry: 0.15, rz: 0.14 },
  { x: -1.08, y: 1.06, ry: 0.34, rz: 0.31 },
  { x: -0.86, y: 1.07, ry: 0.45, rz: 0.41 },
  { x: -0.56, y: 1.01, ry: 0.46, rz: 0.43 },
  { x: -0.2, y: 0.96, ry: 0.45, rz: 0.44 },
  { x: 0.16, y: 0.95, ry: 0.46, rz: 0.45 },
  { x: 0.46, y: 0.97, ry: 0.49, rz: 0.46 },
  { x: 0.7, y: 1.02, ry: 0.47, rz: 0.42 },
  { x: 0.88, y: 1.03, ry: 0.37, rz: 0.33 },
  { x: 0.99, y: 1.0, ry: 0.27, rz: 0.25 }
];

// Dropped forward — the charging carriage from the reference.
const NECK = [
  { x: 0.95, y: 1.01, ry: 0.3, rz: 0.28 },
  { x: 1.1, y: 0.95, ry: 0.29, rz: 0.27 },
  { x: 1.24, y: 0.87, ry: 0.26, rz: 0.24 },
  { x: 1.36, y: 0.8, ry: 0.23, rz: 0.21 }
];

const HEAD = [
  { x: 1.33, y: 0.82, ry: 0.22, rz: 0.2 },
  { x: 1.45, y: 0.79, ry: 0.23, rz: 0.21 },
  { x: 1.57, y: 0.72, ry: 0.2, rz: 0.18 },
  { x: 1.68, y: 0.64, ry: 0.16, rz: 0.15 },
  { x: 1.76, y: 0.58, ry: 0.13, rz: 0.125 },
  { x: 1.8, y: 0.55, ry: 0.08, rz: 0.08 }
];

const FRONT_LEG = [
  { x: 0.58, y: 1.0, ry: 0.19, rz: 0.19 },
  { x: 0.63, y: 0.72, ry: 0.14, rz: 0.14 },
  { x: 0.61, y: 0.46, ry: 0.098, rz: 0.098 },
  { x: 0.62, y: 0.2, ry: 0.074, rz: 0.074 },
  { x: 0.62, y: 0.08, ry: 0.08, rz: 0.08 }
];

// The kick back at x≈-0.89 is the hock; without it a hind leg reads as a post.
const HIND_LEG = [
  { x: -0.84, y: 1.02, ry: 0.22, rz: 0.22 },
  { x: -0.78, y: 0.73, ry: 0.17, rz: 0.17 },
  { x: -0.89, y: 0.47, ry: 0.108, rz: 0.108 },
  { x: -0.8, y: 0.2, ry: 0.077, rz: 0.077 },
  { x: -0.795, y: 0.08, ry: 0.084, rz: 0.084 }
];

const HORN_POINTS = [
  [1.46, 0.9, 0.11],
  [1.5, 1.0, 0.26],
  [1.53, 1.08, 0.42],
  [1.62, 1.1, 0.54],
  [1.74, 1.05, 0.58]
];
const HORN_RADII = [0.07, 0.056, 0.042, 0.028, 0.01];

const TAIL_POINTS = [
  [-1.18, 1.06, 0.0],
  [-1.34, 1.2, 0.04],
  [-1.42, 1.38, 0.1],
  [-1.36, 1.52, 0.16],
  [-1.22, 1.58, 0.18]
];
const TAIL_RADII = [0.055, 0.045, 0.035, 0.028, 0.02];

function buildBull(materials, registry) {
  const group = new THREE.Group();
  const { body, gold, hoof, eye } = materials;

  const add = (geometry, material) => {
    registry.push(geometry);
    const mesh = new THREE.Mesh(geometry, material);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    group.add(mesh);
    return mesh;
  };

  add(planarSweep(TORSO, { steps: 110, radial: 36 }), body);
  add(planarSweep(NECK, { steps: 50, radial: 32 }), body);
  add(planarSweep(HEAD, { steps: 60, radial: 32 }), body);

  // Legs and hooves, mirrored across the spine.
  [0.26, -0.26].forEach((z) => {
    add(planarSweep(FRONT_LEG, { z, steps: 64, radial: 24 }), body);
    add(planarSweep(HIND_LEG, { z, steps: 64, radial: 24 }), body);

    const frontHoof = add(new THREE.CylinderGeometry(0.088, 0.104, 0.115, 24), hoof);
    frontHoof.position.set(0.62, 0.055, z);

    const hindHoof = add(new THREE.CylinderGeometry(0.092, 0.108, 0.115, 24), hoof);
    hindHoof.position.set(-0.795, 0.055, z);
  });

  // Horns, ears and eyes.
  [1, -1].forEach((side) => {
    const points = HORN_POINTS.map(([x, y, z]) => [x, y, z * side]);
    add(tubeSweep(points, HORN_RADII, { steps: 64, radial: 22 }), gold);

    const ear = add(new THREE.SphereGeometry(0.1, 20, 14), body);
    ear.position.set(1.38, 0.86, 0.25 * side);
    ear.scale.set(0.55, 0.85, 1.5);
    ear.rotation.z = -0.35 * side;

    const eyeMesh = add(new THREE.SphereGeometry(0.036, 16, 12), eye);
    eyeMesh.position.set(1.55, 0.79, 0.16 * side);
    eyeMesh.castShadow = false;
  });

  add(tubeSweep(TAIL_POINTS, TAIL_RADII, { steps: 48, radial: 16 }), body);

  const tuft = add(new THREE.SphereGeometry(0.062, 16, 12), body);
  tuft.position.set(-1.2, 1.59, 0.18);
  tuft.scale.set(1.3, 0.9, 0.9);

  // A brow ridge tying the horns into the skull, so they do not read as
  // spikes pushed into a sphere.
  const brow = add(new THREE.SphereGeometry(0.19, 24, 16), body);
  brow.position.set(1.47, 0.86, 0);
  brow.scale.set(0.75, 0.62, 1.12);

  return group;
}

/* ------------------------------------------------------------------ *
 * Stage
 * ------------------------------------------------------------------ */

function makeSoftDot() {
  const size = 64;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  const gradient = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  gradient.addColorStop(0, 'rgba(255,255,255,1)');
  gradient.addColorStop(0.35, 'rgba(190,225,255,0.55)');
  gradient.addColorStop(1, 'rgba(120,180,255,0)');
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, size, size);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

function makeGlowDisc(color, opacity) {
  return new THREE.ShaderMaterial({
    uniforms: {
      uColor: { value: new THREE.Color(color) },
      uOpacity: { value: opacity }
    },
    vertexShader: `
      varying vec2 vUv;
      void main() {
        vUv = uv;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: `
      uniform vec3 uColor;
      uniform float uOpacity;
      varying vec2 vUv;
      void main() {
        float d = distance(vUv, vec2(0.5));
        float a = smoothstep(0.5, 0.03, d);
        gl_FragColor = vec4(uColor, a * a * uOpacity);
      }
    `,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending
  });
}

/* ------------------------------------------------------------------ *
 * Component
 * ------------------------------------------------------------------ */

export function Bull3D({
  width = 300,
  height = 220,
  autoSpin = true,
  showDegrees = true,
  showHint = true,
  className = ''
}) {
  const hostRef = useRef(null);
  const degreeRef = useRef(null);
  const [dragging, setDragging] = useState(false);
  const [failed, setFailed] = useState(false);
  const [visible, setVisible] = useState(false);

  // Live rotation state lives in a ref: a 60fps spin must never re-render the
  // dashboard around it.
  const ctl = useRef({ angle: -0.5, velocity: AUTO_SPEED, dragging: false });

  // Lazy: no WebGL context until the bull is actually on screen.
  useEffect(() => {
    const host = hostRef.current;
    if (!host) return undefined;
    if (typeof IntersectionObserver === 'undefined') {
      setVisible(true);
      return undefined;
    }
    const observer = new IntersectionObserver(
      (entries) => entries.forEach((entry) => entry.isIntersecting && setVisible(true)),
      { rootMargin: '200px' }
    );
    observer.observe(host);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (!visible) return undefined;
    const host = hostRef.current;
    if (!host) return undefined;

    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    let renderer;
    try {
      renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: 'high-performance' });
    } catch {
      setFailed(true);
      return undefined;
    }

    const geometries = [];
    const materials = [];
    const textures = [];
    let frame = 0;
    let disposed = false;

    // 1.75 cap: bloom is fragment-bound, and a full retina buffer quadruples
    // that cost for a difference nobody sees at dashboard size.
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.75));
    renderer.setSize(width, height, false);
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.05;
    renderer.domElement.style.width = '100%';
    renderer.domElement.style.height = '100%';
    renderer.domElement.style.display = 'block';
    renderer.domElement.style.touchAction = 'pan-y';
    renderer.domElement.style.cursor = 'grab';
    host.appendChild(renderer.domElement);

    const scene = new THREE.Scene();
    scene.fog = new THREE.FogExp2(0x05080f, 0.085);

    const camera = new THREE.PerspectiveCamera(32, width / height, 0.1, 100);
    camera.position.set(3.0, 1.5, 3.85);
    camera.lookAt(0, 0.8, 0);

    // Real reflections. Without an environment a metal has nothing to mirror
    // and just goes flat black.
    const pmrem = new THREE.PMREMGenerator(renderer);
    const envRT = pmrem.fromScene(new RoomEnvironment(), 0.04);
    scene.environment = envRT.texture;

    /* ---- materials ---- */
    const bodyMaterial = new THREE.MeshPhysicalMaterial({
      color: BODY_COLOR,
      metalness: 0.86,
      roughness: 0.32,
      clearcoat: 0.6,
      clearcoatRoughness: 0.28,
      envMapIntensity: 1.25
    });
    const goldMaterial = new THREE.MeshPhysicalMaterial({
      color: GOLD_COLOR,
      metalness: 1.0,
      roughness: 0.3,
      envMapIntensity: 1.45
    });
    const hoofMaterial = new THREE.MeshPhysicalMaterial({
      color: HOOF_COLOR,
      metalness: 1.0,
      roughness: 0.36,
      envMapIntensity: 1.3
    });
    const eyeMaterial = new THREE.MeshBasicMaterial({ color: EYE_COLOR });
    materials.push(bodyMaterial, goldMaterial, hoofMaterial, eyeMaterial);

    /* ---- bull ---- */
    const pivot = new THREE.Group();
    scene.add(pivot);

    const bull = buildBull(
      { body: bodyMaterial, gold: goldMaterial, hoof: hoofMaterial, eye: eyeMaterial },
      geometries
    );
    pivot.add(bull);

    // Normalise: stand the feet on the podium and spin about the true centre,
    // so hand-authored coordinates never dictate framing.
    const box = new THREE.Box3().setFromObject(bull);
    const size = box.getSize(new THREE.Vector3());
    bull.scale.setScalar(TARGET_HEIGHT / size.y);

    const scaled = new THREE.Box3().setFromObject(bull);
    const centre = scaled.getCenter(new THREE.Vector3());
    bull.position.x -= centre.x;
    bull.position.z -= centre.z;
    bull.position.y -= scaled.min.y;

    /* ---- podium ---- */
    const podium = new THREE.Group();
    scene.add(podium);

    const podiumMaterial = new THREE.MeshPhysicalMaterial({
      color: 0x0a1226,
      metalness: 0.7,
      roughness: 0.42,
      envMapIntensity: 0.8
    });
    materials.push(podiumMaterial);

    const topGeo = new THREE.CylinderGeometry(1.62, 1.68, 0.11, 96);
    const baseGeo = new THREE.CylinderGeometry(1.88, 1.96, 0.1, 96);
    geometries.push(topGeo, baseGeo);

    const top = new THREE.Mesh(topGeo, podiumMaterial);
    top.position.y = -0.055;
    top.receiveShadow = true;
    podium.add(top);

    const base = new THREE.Mesh(baseGeo, podiumMaterial);
    base.position.y = -0.17;
    base.receiveShadow = true;
    podium.add(base);

    const ringMaterial = new THREE.MeshBasicMaterial({ color: CYAN, transparent: true, opacity: 0.9 });
    materials.push(ringMaterial);
    [
      [1.63, 0.004, 0.012],
      [1.9, -0.115, 0.009]
    ].forEach(([radius, y, thickness]) => {
      const ringGeo = new THREE.TorusGeometry(radius, thickness, 8, 128);
      geometries.push(ringGeo);
      const ring = new THREE.Mesh(ringGeo, ringMaterial);
      ring.rotation.x = -Math.PI / 2;
      ring.position.y = y;
      podium.add(ring);
    });

    const glowGeo = new THREE.CircleGeometry(2.5, 64);
    const glowMaterial = makeGlowDisc(0x2f6fe0, 0.5);
    geometries.push(glowGeo);
    materials.push(glowMaterial);
    const glow = new THREE.Mesh(glowGeo, glowMaterial);
    glow.rotation.x = -Math.PI / 2;
    glow.position.y = 0.012;
    scene.add(glow);

    /* ---- orbiting energy ribbons ---- */
    const ribbons = [];
    const ribbonMaterial = new THREE.MeshBasicMaterial({
      color: BLUE,
      transparent: true,
      opacity: 0.32,
      blending: THREE.AdditiveBlending,
      depthWrite: false
    });
    materials.push(ribbonMaterial);
    [
      [1.35, 0.55, 0.22],
      [1.62, 0.95, -0.3]
    ].forEach(([radius, y, tilt]) => {
      const geo = new THREE.TorusGeometry(radius, 0.006, 6, 140);
      geometries.push(geo);
      const ribbon = new THREE.Mesh(geo, ribbonMaterial);
      ribbon.rotation.set(-Math.PI / 2 + tilt, 0, 0);
      ribbon.position.y = y;
      scene.add(ribbon);
      ribbons.push(ribbon);
    });

    /* ---- floating shards ---- */
    const shards = [];
    const shardGeo = new THREE.OctahedronGeometry(0.055, 0);
    geometries.push(shardGeo);
    for (let i = 0; i < 9; i += 1) {
      const shard = new THREE.Mesh(shardGeo, bodyMaterial);
      const angle = (i / 9) * Math.PI * 2;
      const radius = 1.15 + (i % 3) * 0.28;
      shard.position.set(Math.cos(angle) * radius, 0.16 + (i % 4) * 0.16, Math.sin(angle) * radius);
      shard.rotation.set(i, i * 1.7, 0);
      shard.scale.setScalar(0.6 + (i % 3) * 0.22);
      scene.add(shard);
      shards.push({ mesh: shard, phase: i * 0.7, baseY: shard.position.y });
    }

    /* ---- particles ---- */
    const COUNT = 130;
    const particlePositions = new Float32Array(COUNT * 3);
    const drift = new Float32Array(COUNT);
    for (let i = 0; i < COUNT; i += 1) {
      const angle = Math.random() * Math.PI * 2;
      const radius = 0.5 + Math.random() * 1.9;
      particlePositions[i * 3] = Math.cos(angle) * radius;
      particlePositions[i * 3 + 1] = Math.random() * 2.2;
      particlePositions[i * 3 + 2] = Math.sin(angle) * radius;
      drift[i] = 0.0009 + Math.random() * 0.0022;
    }
    const particleGeo = new THREE.BufferGeometry();
    particleGeo.setAttribute('position', new THREE.BufferAttribute(particlePositions, 3));
    const dotTexture = makeSoftDot();
    textures.push(dotTexture);
    const particleMaterial = new THREE.PointsMaterial({
      size: 0.03,
      map: dotTexture,
      color: 0x9ed0ff,
      transparent: true,
      opacity: 0.75,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      sizeAttenuation: true
    });
    geometries.push(particleGeo);
    materials.push(particleMaterial);
    const particles = new THREE.Points(particleGeo, particleMaterial);
    scene.add(particles);

    /* ---- lighting ---- */
    scene.add(new THREE.HemisphereLight(0x2a4a80, 0x04070e, 0.55));

    const key = new THREE.DirectionalLight(0xdbe9ff, 2.0);
    key.position.set(3.2, 4.5, 3.0);
    key.castShadow = true;
    key.shadow.mapSize.set(1024, 1024);
    key.shadow.camera.near = 0.5;
    key.shadow.camera.far = 14;
    key.shadow.camera.left = -3;
    key.shadow.camera.right = 3;
    key.shadow.camera.top = 3;
    key.shadow.camera.bottom = -3;
    key.shadow.bias = -0.0012;
    scene.add(key);

    const rimCyan = new THREE.PointLight(CYAN, 3.2, 12, 2);
    rimCyan.position.set(-3.2, 2.0, -2.6);
    scene.add(rimCyan);

    const rimBlue = new THREE.PointLight(BLUE, 2.4, 12, 2);
    rimBlue.position.set(-1.5, 1.4, 3.2);
    scene.add(rimBlue);

    const goldKick = new THREE.PointLight(0xffc978, 1.1, 10, 2);
    goldKick.position.set(2.6, 2.4, -1.2);
    scene.add(goldKick);

    const underGlow = new THREE.PointLight(BLUE, 2.2, 5, 2);
    underGlow.position.set(0, 0.16, 0);
    scene.add(underGlow);

    /* ---- composer ---- */
    const composer = new EffectComposer(renderer);
    composer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.75));
    composer.setSize(width, height);
    composer.addPass(new RenderPass(scene, camera));
    const bloom = new UnrealBloomPass(new THREE.Vector2(width, height), 0.62, 0.62, 0.68);
    composer.addPass(bloom);
    composer.addPass(new OutputPass());

    /* ---- optional sculpted GLB ---- */
    let cancelledGlb = false;
    (async () => {
      try {
        const head = await fetch(GLB_URL, { method: 'HEAD' });
        const type = head.headers.get('content-type') || '';
        // A dev server answers 200 + index.html for missing files, so a bare
        // ok check would try to parse HTML as GLB.
        if (!head.ok || type.includes('text/html')) return;

        const { GLTFLoader } = await import('three/examples/jsm/loaders/GLTFLoader.js');
        if (cancelledGlb || disposed) return;

        const gltf = await new GLTFLoader().loadAsync(GLB_URL);
        if (cancelledGlb || disposed) return;

        const model = gltf.scene;
        model.traverse((child) => {
          if (child.isMesh) {
            child.castShadow = true;
            child.receiveShadow = true;
          }
        });

        const modelBox = new THREE.Box3().setFromObject(model);
        const modelSize = modelBox.getSize(new THREE.Vector3());
        model.scale.setScalar(TARGET_HEIGHT / modelSize.y);

        const fitted = new THREE.Box3().setFromObject(model);
        const fittedCentre = fitted.getCenter(new THREE.Vector3());
        model.position.x -= fittedCentre.x;
        model.position.z -= fittedCentre.z;
        model.position.y -= fitted.min.y;

        pivot.remove(bull);
        bull.visible = false;
        pivot.add(model);
      } catch {
        // No GLB, or an unreadable one: the procedural bull stands in.
      }
    })();

    /* ---- interaction ---- */
    let pointerId = null;
    let lastX = 0;

    const onPointerDown = (event) => {
      pointerId = event.pointerId;
      lastX = event.clientX;
      ctl.current.dragging = true;
      setDragging(true);
      renderer.domElement.style.cursor = 'grabbing';
      renderer.domElement.setPointerCapture?.(event.pointerId);
    };

    const onPointerMove = (event) => {
      if (!ctl.current.dragging || event.pointerId !== pointerId) return;
      const dx = event.clientX - lastX;
      lastX = event.clientX;
      ctl.current.angle += dx * 0.0075;
      ctl.current.velocity = dx * 0.0075;
    };

    const endDrag = (event) => {
      if (event && pointerId !== null && event.pointerId !== pointerId) return;
      if (!ctl.current.dragging) return;
      ctl.current.dragging = false;
      setDragging(false);
      renderer.domElement.style.cursor = 'grab';
      if (pointerId !== null) renderer.domElement.releasePointerCapture?.(pointerId);
      pointerId = null;
    };

    const canvas = renderer.domElement;
    canvas.addEventListener('pointerdown', onPointerDown);
    canvas.addEventListener('pointermove', onPointerMove);
    canvas.addEventListener('pointerup', endDrag);
    canvas.addEventListener('pointercancel', endDrag);
    canvas.addEventListener('pointerleave', endDrag);

    /* ---- loop ---- */
    let running = true;
    const clock = new THREE.Clock();

    const onVisibility = () => {
      running = !document.hidden;
      if (running) clock.getDelta();
    };
    document.addEventListener('visibilitychange', onVisibility);

    const pauseObserver =
      typeof IntersectionObserver !== 'undefined'
        ? new IntersectionObserver((entries) =>
            entries.forEach((e) => {
              running = e.isIntersecting && !document.hidden;
            })
          )
        : null;
    pauseObserver?.observe(host);

    let elapsed = 0;

    const tick = () => {
      frame = requestAnimationFrame(tick);
      if (!running) return;

      const delta = Math.min(clock.getDelta(), 0.05);
      elapsed += delta;
      const state = ctl.current;

      if (!reduced) {
        if (!state.dragging) {
          // Inertia bleeding into the idle spin: decay what the drag left
          // behind while pulling toward AUTO_SPEED, so release settles instead
          // of stopping dead.
          const target = autoSpin ? AUTO_SPEED : 0;
          state.velocity = state.velocity * 0.94 + target * 0.06;
          state.angle += state.velocity;
        }

        pivot.rotation.y = state.angle;
        // Breathing, not bouncing.
        pivot.position.y = Math.sin(elapsed * 0.9) * 0.014;
        pivot.rotation.z = Math.sin(elapsed * 0.65) * 0.006;

        ribbons[0].rotation.z = elapsed * 0.12;
        ribbons[1].rotation.z = -elapsed * 0.09;

        shards.forEach((shard, i) => {
          shard.mesh.position.y = shard.baseY + Math.sin(elapsed * 0.5 + shard.phase) * 0.05;
          shard.mesh.rotation.y += 0.0022 + i * 0.0002;
          shard.mesh.rotation.x += 0.0014;
        });

        const array = particleGeo.getAttribute('position').array;
        for (let i = 0; i < COUNT; i += 1) {
          array[i * 3 + 1] += drift[i];
          if (array[i * 3 + 1] > 2.3) array[i * 3 + 1] = 0;
        }
        particleGeo.getAttribute('position').needsUpdate = true;

        underGlow.intensity = 2.0 + Math.sin(elapsed * 1.4) * 0.35;
      } else {
        pivot.rotation.y = state.angle;
      }

      if (degreeRef.current) {
        const deg = Math.round(((((-state.angle * 180) / Math.PI) % 360) + 360) % 360);
        degreeRef.current.textContent = `${deg}°`;
      }

      composer.render();
    };
    tick();

    /* ---- resize ---- */
    const resize = () => {
      const w = host.clientWidth || width;
      const h = host.clientHeight || height;
      if (!w || !h) return;
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      renderer.setSize(w, h, false);
      composer.setSize(w, h);
      bloom.setSize(w, h);
    };
    const resizeObserver = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(resize) : null;
    resizeObserver?.observe(host);
    resize();

    /* ---- teardown ---- */
    return () => {
      disposed = true;
      cancelledGlb = true;
      cancelAnimationFrame(frame);
      document.removeEventListener('visibilitychange', onVisibility);
      pauseObserver?.disconnect();
      resizeObserver?.disconnect();

      canvas.removeEventListener('pointerdown', onPointerDown);
      canvas.removeEventListener('pointermove', onPointerMove);
      canvas.removeEventListener('pointerup', endDrag);
      canvas.removeEventListener('pointercancel', endDrag);
      canvas.removeEventListener('pointerleave', endDrag);

      geometries.forEach((g) => g.dispose());
      materials.forEach((m) => m.dispose());
      textures.forEach((t) => t.dispose());
      envRT.texture.dispose();
      pmrem.dispose();
      composer.dispose();
      renderer.dispose();
      if (canvas.parentNode === host) host.removeChild(canvas);
    };
  }, [visible, width, height, autoSpin]);

  if (failed) {
    return (
      <div
        className={`relative grid place-items-center rounded-2xl border border-[var(--accent-ring)] bg-[var(--accent-soft)] ${className}`}
        style={{ width, height }}
      >
        <span className="font-mono text-[10px] uppercase tracking-wider theme-text-dim">Bull unavailable</span>
      </div>
    );
  }

  return (
    <div className={`relative select-none ${className}`} style={{ width, height }}>
      <div ref={hostRef} className="h-full w-full" />

      {showHint && !dragging && (
        <div className="pointer-events-none absolute bottom-1.5 left-1/2 -translate-x-1/2 font-mono text-[9px] font-bold uppercase tracking-[0.14em] text-[var(--accent)] opacity-60">
          Drag to rotate
        </div>
      )}

      {showDegrees && (
        <div
          ref={degreeRef}
          className="pointer-events-none absolute right-2 top-2 rounded-full border border-[var(--accent-ring)] bg-[var(--accent-soft)] px-2 py-0.5 font-mono text-[9px] font-bold tracking-wider text-[var(--accent)]"
        >
          0°
        </div>
      )}
    </div>
  );
}

export default Bull3D;
