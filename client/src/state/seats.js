// Seats and where they sit. A module either lists its seats, or the table
// makes up to eight: one per side at first ("four" seating), splitting each
// side in two when a fifth player joins ("eight" seating). Made-up seats are
// always the eight half-sides; with four seating, the left halves stand for
// whole sides.

export const SIDES = ["south", "north", "east", "west"];
export const HALF_SIDES = SIDES.flatMap((side) => [`${side}-left`, `${side}-right`]);
// The order made-up seats open in: a whole side each, then the other halves.
export const SEAT_ORDER = [...SIDES.map((side) => `${side}-left`), ...SIDES.map((side) => `${side}-right`)];

const HAND_GAP = 2; // cm between the table edge and a default hand tray
const HAND_WIDTH = 0.8; // of the seat's stretch of edge
const MAX_HAND_WIDTH = 60;
const HAND_DEPTH = 1.4; // times the deepest card
const DEFAULT_CARD_DEPTH = 9;

export const handId = (seatId) => `hand-${seatId}`;

export function seatOf(state, playerId) {
  return state.players[playerId]?.seatId || null;
}

// The seats that exist right now.
export function activeSeats(manifest, state) {
  if (manifest.listedSeats) return manifest.seats;
  const count = state.seating === "eight" ? manifest.maxSeats : Math.min(4, manifest.maxSeats);
  return manifest.seats.slice(0, count);
}

// Seats a joining player can pick. Once the four sides are taken, the other
// halves open up, and picking one splits the table.
export function openSeats(manifest, state) {
  const taken = new Set(Object.values(state.players).map((player) => player.seatId));
  const free = (seats) => seats.filter((seat) => !taken.has(seat.id));
  const active = free(activeSeats(manifest, state));
  if (manifest.listedSeats || state.seating === "eight" || active.length) return active;
  return free(manifest.seats.slice(0, manifest.maxSeats));
}

// The side a seat sits on: whole with four seating, or as listed.
export function seatSide(manifest, state, seat) {
  if (manifest.listedSeats || state.seating === "eight") return seat.side;
  return seat.side.replace(/-left$/, "");
}

export function seatName(manifest, state, seat) {
  if (manifest.listedSeats) return seat.name;
  const [side, half] = seatSide(manifest, state, seat).split("-");
  const name = side[0].toUpperCase() + side.slice(1);
  return half ? `${name} ${half}` : name;
}

// The seat's stretch of table edge: its middle, length, the direction away
// from the table, and the rotation that faces the seat's player.
export function edgeOf(manifest, side) {
  const [width, depth] = manifest.table.size;
  const [whole, half] = side.split("-");
  const edges = {
    south: { middle: [width / 2, 0], length: width, outward: [0, -1], left: [-1, 0], rotation: 0 },
    north: { middle: [width / 2, depth], length: width, outward: [0, 1], left: [1, 0], rotation: 180 },
    east: { middle: [width, depth / 2], length: depth, outward: [1, 0], left: [0, -1], rotation: 270 },
    west: { middle: [0, depth / 2], length: depth, outward: [-1, 0], left: [0, 1], rotation: 90 },
  };
  const edge = edges[whole];
  if (!half) return edge;
  const shift = (half === "left" ? 1 : -1) * (edge.length / 4);
  return {
    ...edge,
    middle: [edge.middle[0] + edge.left[0] * shift, edge.middle[1] + edge.left[1] * shift],
    length: edge.length / 2,
  };
}

// Where a seat's hand tray goes: the manifest's placement, or just off the
// table edge, facing the player.
export function handPlacement(manifest, state, seat) {
  if (seat.hand) return seat.hand;
  const edge = edgeOf(manifest, seatSide(manifest, state, seat));
  const depth = cardDepth(manifest) * HAND_DEPTH;
  const width = Math.min(edge.length * HAND_WIDTH, MAX_HAND_WIDTH);
  const away = HAND_GAP + depth / 2;
  return {
    position: [edge.middle[0] + edge.outward[0] * away, edge.middle[1] + edge.outward[1] * away],
    rotation: edge.rotation,
    size: [width, depth],
  };
}

// A camera behind the seat, looking a little past the middle of the table,
// with the seat's own hand tray in view.
export function seatView(manifest, state, seat) {
  const [width, depth] = manifest.table.size;
  const edge = edgeOf(manifest, seatSide(manifest, state, seat));
  const across = edge.outward[0] ? width : depth;
  const back = across * 0.55;
  const toward = across * 0.12; // how far the target sits from the middle, toward the seat
  const [outX, outY] = edge.outward;
  return {
    position: [edge.middle[0] + outX * back, Math.max(width, depth) * 0.8, edge.middle[1] + outY * back],
    target: [width / 2 + outX * toward, 0, depth / 2 + outY * toward],
  };
}

function cardDepth(manifest) {
  const top = manifest.layers.at(-1).id;
  const depths = manifest.pieces
    .filter((piece) => piece.shape === "rect" && piece.layer.id === top)
    .map((piece) => piece.size[1]);
  return depths.length ? Math.max(...depths) : DEFAULT_CARD_DEPTH;
}
