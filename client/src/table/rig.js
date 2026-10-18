import * as THREE from "three";

// Camera moves for keys, joysticks, and buttons. Each one changes the camera
// position and its orbit target (Three Vector3s) in place, the same way
// OrbitControls would, so pointer and key control share one camera.

const PAN_SPEED = 0.8; // fraction of the camera's distance per second
const TURN_SPEED = Math.PI / 2; // radians per second
const TILT_SPEED = Math.PI / 4; // radians per second
const ZOOM_SPEED = 1.2; // distance shrinks by e^ZOOM_SPEED per second

const UP = new THREE.Vector3(0, 1, 0);

// turn: radians, positive turns the view left. tilt: radians, positive tilts
// toward top-down. zoom: distance multiplier, below 1 moves closer.
export function orbit(position, target, { turn = 0, tilt = 0, zoom = 1 }, limits) {
  const spherical = new THREE.Spherical().setFromVector3(position.clone().sub(target));
  spherical.theta += turn;
  spherical.phi = clamp(spherical.phi - tilt, limits.minPolarAngle, limits.maxPolarAngle);
  spherical.radius = clamp(spherical.radius * zoom, limits.minDistance, limits.maxDistance);
  position.copy(target).add(new THREE.Vector3().setFromSpherical(spherical));
}

// Slides camera and target across the table, relative to where the camera
// faces. right and forward are in scene units.
export function pan(position, target, right, forward) {
  const ahead = target.clone().sub(position).setY(0).normalize();
  const side = ahead.clone().cross(UP);
  const delta = side.multiplyScalar(right).add(ahead.multiplyScalar(forward));
  position.add(delta);
  target.add(delta);
}

// motion holds rates from -1 to 1: { pan: [right, forward], turn, tilt, zoom }.
export function applyMotion(position, target, motion, dt, limits) {
  const [right, forward] = motion.pan;
  if (right || forward) {
    const step = position.distanceTo(target) * PAN_SPEED * dt;
    pan(position, target, right * step, forward * step);
  }
  if (motion.turn || motion.tilt || motion.zoom) {
    orbit(position, target, {
      turn: motion.turn * TURN_SPEED * dt,
      tilt: motion.tilt * TILT_SPEED * dt,
      zoom: Math.exp(-motion.zoom * ZOOM_SPEED * dt),
    }, limits);
  }
}

// Keeps the orbit target over the table, moving the camera along with it.
export function clampTarget(position, target, bounds) {
  const x = clamp(target.x, bounds.minX, bounds.maxX);
  const z = clamp(target.z, bounds.minZ, bounds.maxZ);
  const delta = new THREE.Vector3(x - target.x, 0, z - target.z);
  position.add(delta);
  target.add(delta);
}

export function sumMotions(motions) {
  const total = { pan: [0, 0], turn: 0, tilt: 0, zoom: 0 };
  for (const motion of motions) {
    total.pan[0] += motion.pan?.[0] || 0;
    total.pan[1] += motion.pan?.[1] || 0;
    total.turn += motion.turn || 0;
    total.tilt += motion.tilt || 0;
    total.zoom += motion.zoom || 0;
  }
  total.pan = total.pan.map((value) => clamp(value, -1, 1));
  for (const key of ["turn", "tilt", "zoom"]) total[key] = clamp(total[key], -1, 1);
  return total;
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}
