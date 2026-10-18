import * as THREE from "three";

// The solids dice are made of, scaled so their widest point is 1 across.
// Each face knows its outward normal, its center, and which way its label's
// top points. A d4 also splits each face into three corner sections, since
// its rolled number shows at its top corner.

const PHI = (1 + Math.sqrt(5)) / 2;
const PLANE_TOLERANCE = 1e-6;

const VERTICES = {
  4: [[1, 1, 1], [1, -1, -1], [-1, 1, -1], [-1, -1, 1]],
  6: [-1, 1].flatMap((x) => [-1, 1].flatMap((y) => [-1, 1].map((z) => [x, y, z]))),
  8: [[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1]],
  10: trapezohedron(),
  12: [
    ...[-1, 1].flatMap((x) => [-1, 1].flatMap((y) => [-1, 1].map((z) => [x, y, z]))),
    ...[-1, 1].flatMap((a) => [-1, 1].flatMap((b) => [
      [0, a / PHI, b * PHI], [a / PHI, b * PHI, 0], [b * PHI, 0, a / PHI],
    ])),
  ],
  20: [-1, 1].flatMap((a) => [-1, 1].flatMap((b) => [[0, a, b * PHI], [a, b * PHI, 0], [b * PHI, 0, a]])),
};

const cache = new Map();

// { vertices, faces: [{ corners, normal, center, up }], inradius } for a die
// with `sides` faces. For a d4, faces are numbered by the vertex opposite
// them, since its value is the vertex on top.
export function solid(sides) {
  if (!cache.has(sides)) cache.set(sides, buildSolid(sides));
  return cache.get(sides);
}

// The rotation that puts face `value` on top (for a d4, vertex `value`),
// with its label reading from the near edge, then turned `yaw` radians.
export function orientation(sides, value, yaw = 0) {
  const shape = solid(sides);
  const up = sides === 4 ? shape.vertices[value].clone().normalize() : shape.faces[value].normal;
  const labelUp = sides === 4 ? shape.faces[(value + 1) % 4].center.clone().sub(up) : shape.faces[value].up;
  const tilt = new THREE.Quaternion().setFromUnitVectors(up, new THREE.Vector3(0, 1, 0));
  const turned = labelUp.clone().applyQuaternion(tilt);
  // Spin about the vertical so the label's top points away from you (-z),
  // then by yaw.
  const spin = new THREE.Quaternion().setFromAxisAngle(
    new THREE.Vector3(0, 1, 0),
    Math.PI - Math.atan2(turned.x, turned.z) + yaw
  );
  return spin.multiply(tilt);
}

// How far the die's center sits above whatever it rests on.
export function restHeight(sides) {
  return solid(sides).inradius;
}

// The three corner sections of a d4 face: [{ vertex, polygon }], where
// polygon runs corner, edge middle, face center, edge middle.
export function cornerSections(face) {
  const [a, b, c] = face.corners.map((i) => solid(4).vertices[i]);
  const mid = (p, q) => p.clone().add(q).multiplyScalar(0.5);
  return [[a, b, c], [b, c, a], [c, a, b]].map(([corner, next, previous], i) => ({
    vertex: face.corners[i],
    polygon: [corner, mid(corner, next), face.center, mid(previous, corner)],
  }));
}

// The pieces a die's surface is drawn in: whole faces, or for a d4, each
// face's three corner sections. label is the face index (for a d4, the
// vertex) whose number or image it shows.
export function dieRegions(sides) {
  const shape = solid(sides);
  if (sides !== 4) {
    return shape.faces.map((face, i) => ({
      label: i,
      polygon: face.corners.map((index) => shape.vertices[index]),
      normal: face.normal,
      center: sides === 10 ? kiteLabelCenter(shape, face) : face.center,
      up: face.up,
    }));
  }
  return shape.faces.flatMap((face) => cornerSections(face).map((section) => {
    const center = section.polygon.reduce((sum, p) => sum.add(p), new THREE.Vector3()).divideScalar(4);
    return {
      label: section.vertex,
      polygon: section.polygon,
      normal: face.normal,
      center,
      up: section.polygon[0].clone().sub(center).normalize(),
    };
  }));
}

// The face a die shows on top, laid flat for drawing in 2D: for a d4, a face
// touching the top corner, turned so that corner points up. Points are
// [x, y] with y down, in the same units as solid(). Each region keeps its
// label, and carries its center, its label's up direction, and how wide its
// label art is (as dieRegions' textures span it).
export function topFace(sides, value) {
  const shape = solid(sides);
  const face = sides === 4 ? shape.faces[(value + 1) % 4] : shape.faces[value];
  const regions = dieRegions(sides).filter((region) => region.normal === face.normal);
  const up = sides === 4 ? shape.vertices[value].clone().sub(face.center).normalize() : face.up;
  const right = new THREE.Vector3().crossVectors(up, face.normal).normalize();
  const flat = (p) => {
    const d = p.clone().sub(face.center);
    return [d.dot(right), -d.dot(up)];
  };
  return {
    outline: face.corners.map((index) => flat(shape.vertices[index])),
    regions: regions.map((region) => {
      const regionRight = new THREE.Vector3().crossVectors(region.up, region.normal).normalize();
      const reach = Math.max(...region.polygon.flatMap((p) => {
        const d = p.clone().sub(region.center);
        return [Math.abs(d.dot(regionRight)), Math.abs(d.dot(region.up))];
      }));
      return {
        label: region.label,
        polygon: region.polygon.map(flat),
        center: flat(region.center),
        // Degrees clockwise from straight up.
        turn: (Math.atan2(region.up.dot(right), region.up.dot(up)) * 180) / Math.PI,
        extent: reach * 2,
      };
    }),
  };
}

// Halfway from a d10 kite's middle to the line across its widest part,
// where its number has the most room.
function kiteLabelCenter(shape, face) {
  const along = (p) => p.clone().sub(face.center).dot(face.up);
  // Sorted along the label's up: bottom corner, the two side corners, tip.
  const corners = face.corners.map((index) => shape.vertices[index]).sort((a, b) => along(a) - along(b));
  const wide = corners[1].clone().add(corners[2]).multiplyScalar(0.5);
  return face.center.clone().add(wide).multiplyScalar(0.5);
}

function buildSolid(sides) {
  const points = VERTICES[sides].map(([x, y, z]) => new THREE.Vector3(x, y, z));
  const widest = Math.max(...points.map((p) => p.length()));
  const vertices = points.map((p) => p.multiplyScalar(0.5 / widest));
  let faces = findFaces(vertices, sides);
  // A d4's faces go by the vertex they don't touch.
  if (sides === 4) faces = vertices.map((_, v) => faces.find((face) => !face.corners.includes(v)));
  const inradius = Math.min(...faces.map((face) => face.center.dot(face.normal)));
  return { vertices, faces, inradius };
}

// The faces of a convex solid: every plane through three vertices with all
// the others behind it, its corners in order around it.
function findFaces(vertices, sides) {
  const faces = [];
  const seen = new Set();
  for (let i = 0; i < vertices.length; i++) {
    for (let j = i + 1; j < vertices.length; j++) {
      for (let k = j + 1; k < vertices.length; k++) {
        const normal = new THREE.Vector3()
          .subVectors(vertices[j], vertices[i])
          .cross(new THREE.Vector3().subVectors(vertices[k], vertices[i]));
        if (normal.lengthSq() < PLANE_TOLERANCE) continue;
        normal.normalize();
        const offset = normal.dot(vertices[i]);
        if (offset < 0) normal.negate();
        const distance = Math.abs(offset);
        const on = vertices.map((v, index) => [v, index]).filter(([v]) => Math.abs(normal.dot(v) - distance) < 1e-4);
        if (vertices.some((v) => normal.dot(v) > distance + 1e-4)) continue;
        const key = on.map(([, index]) => index).sort((a, b) => a - b).join(",");
        if (seen.has(key)) continue;
        seen.add(key);
        faces.push(makeFace(on, normal, sides));
      }
    }
  }
  // Highest faces first, then around, so numbering is the same every time.
  return faces.sort((a, b) => b.normal.y - a.normal.y || Math.atan2(a.normal.z, a.normal.x) - Math.atan2(b.normal.z, b.normal.x));
}

function makeFace(on, normal, sides) {
  const center = on.reduce((sum, [v]) => sum.add(v), new THREE.Vector3()).divideScalar(on.length);
  // Order corners counterclockwise seen from outside.
  const axisU = new THREE.Vector3().subVectors(on[0][0], center).normalize();
  const axisV = new THREE.Vector3().crossVectors(normal, axisU);
  const angle = ([v]) => {
    const d = new THREE.Vector3().subVectors(v, center);
    return Math.atan2(d.dot(axisV), d.dot(axisU));
  };
  const corners = [...on].sort((a, b) => angle(a) - angle(b)).map(([, index]) => index);
  const points = corners.map((index) => on.find(([, i]) => i === index)[0]);

  // A d6 label stands square to an edge. Others point at their farthest
  // corner: the tip of a d10's kite, or any corner of a triangle or pentagon.
  let target;
  if (sides === 6) {
    target = points[0].clone().add(points[1]).multiplyScalar(0.5);
  } else {
    const far = Math.max(...points.map((p) => p.distanceTo(center)));
    target = points.find((p) => p.distanceTo(center) > far - 1e-6);
  }
  const up = new THREE.Vector3().subVectors(target, center).normalize();
  return { corners, normal, center, up };
}

// A d10: two points with a zigzag ring of ten corners between them, set so
// each kite face is flat.
function trapezohedron() {
  const ringHeight = 0.1;
  const cos36 = Math.cos(Math.PI / 5);
  const tip = (ringHeight * (1 + cos36)) / (1 - cos36);
  const ring = Array.from({ length: 10 }, (_, i) => {
    const angle = (i * Math.PI) / 5;
    return [Math.cos(angle), i % 2 ? -ringHeight : ringHeight, Math.sin(angle)];
  });
  return [[0, tip, 0], [0, -tip, 0], ...ring];
}
