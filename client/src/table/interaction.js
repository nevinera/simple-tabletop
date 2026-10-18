// Turns pointer events into table actions (see "Selecting and placing" in
// plans/client.md):
//
// - Click or tap a movable piece to select it: you grab it and it lifts.
// - Press on a piece and drag to move it; releasing drops it.
// - With a piece selected, a mouse click on open table places it there, and
//   on touch a tap-and-hold does. A plain tap on open table cancels.
// - Anything else (empty table, fixed pieces) goes to the camera.
//
// The scene supplies hit testing through `pick` and `tablePoint`, so this
// runs without WebGL in tests.

export const DRAG_THRESHOLD_PX = 6;
export const LONG_PRESS_MS = 500;

export class PieceInteraction {
  constructor({
    store, manifest, playerId,
    pick, // (clientX, clientY) -> piece id or null
    tablePoint, // (clientX, clientY, pieceId) -> [x, y] on that piece's resting plane, or null
    clampToTable, // ([x, y]) -> [x, y]
    setCameraEnabled, // (bool)
    setCursor, // (css cursor string)
    schedule = setTimeout,
    unschedule = clearTimeout,
  }) {
    Object.assign(this, { store, playerId, pick, tablePoint, clampToTable, setCameraEnabled, setCursor });
    // Wrapped, since the browser's timer functions throw when called as methods.
    this.schedule = (fn, ms) => schedule(fn, ms);
    this.unschedule = (id) => unschedule(id);
    this.defs = new Map(manifest.pieces.map((def) => [def.id, def]));
    this.gesture = null;
  }

  selectedId() {
    const pieces = this.store.getState().pieces;
    return Object.keys(pieces).find((id) => pieces[id].heldBy === this.playerId) || null;
  }

  // Returns true when the event starts a piece gesture, so the caller can
  // capture the pointer.
  pointerDown(event) {
    if (event.button !== 0 || !event.isPrimary) return false;
    const start = { x: event.clientX, y: event.clientY };
    const hit = this.pick(event.clientX, event.clientY);

    if (hit && this.#canMove(hit)) {
      this.setCameraEnabled(false);
      this.gesture = { kind: "piece", pointerId: event.pointerId, pieceId: hit, start, moved: false };
      return true;
    }

    const gesture = { kind: "table", pointerId: event.pointerId, start, moved: false, done: false };
    this.gesture = gesture;
    const selected = this.selectedId();
    if (selected && event.pointerType === "touch") {
      gesture.timer = this.schedule(() => {
        this.#place(selected, event.clientX, event.clientY);
        gesture.done = true;
      }, LONG_PRESS_MS);
    }
    return false;
  }

  pointerMove(event) {
    const gesture = this.gesture;
    if (!gesture) {
      if (event.pointerType === "mouse") {
        const hit = this.pick(event.clientX, event.clientY);
        this.setCursor(hit && this.#canMove(hit) ? "grab" : "");
      }
      return;
    }
    if (event.pointerId !== gesture.pointerId) return;

    if (!gesture.moved) {
      const dx = event.clientX - gesture.start.x;
      const dy = event.clientY - gesture.start.y;
      if (dx * dx + dy * dy < DRAG_THRESHOLD_PX * DRAG_THRESHOLD_PX) return;
      gesture.moved = true;
      this.unschedule(gesture.timer);
      if (gesture.kind === "piece" && !this.#startDrag(gesture)) {
        this.#end();
        return;
      }
    }

    if (gesture.kind === "piece") {
      const point = this.tablePoint(event.clientX, event.clientY, gesture.pieceId);
      if (!point) return;
      const [x, y] = this.clampToTable([point[0] + gesture.offset[0], point[1] + gesture.offset[1]]);
      this.#dispatch("drag", gesture.pieceId, { x, y });
    }
  }

  pointerUp(event) {
    const gesture = this.gesture;
    if (!gesture || event.pointerId !== gesture.pointerId) return;

    if (gesture.kind === "piece") {
      const piece = this.store.getState().pieces[gesture.pieceId];
      if (gesture.moved) {
        const { x, y } = piece.drag || piece;
        this.#dispatch("drop", gesture.pieceId, { x, y });
      } else if (piece.heldBy === this.playerId) {
        // Clicking the selected piece sets it down where it is.
        this.#dispatch("drop", gesture.pieceId, { x: piece.x, y: piece.y });
      } else {
        this.#select(gesture.pieceId);
      }
    } else if (!gesture.moved && !gesture.done) {
      const selected = this.selectedId();
      if (selected && event.pointerType === "touch") this.#dispatch("release", selected);
      else if (selected) this.#place(selected, event.clientX, event.clientY);
    }
    this.#end();
  }

  // The browser took the pointer away (a scroll, a second finger, a
  // dialog). Put a dragged piece back where it started.
  pointerCancel(event) {
    const gesture = this.gesture;
    if (!gesture || event.pointerId !== gesture.pointerId) return;
    if (gesture.kind === "piece" && gesture.moved) this.#dispatch("release", gesture.pieceId);
    this.#end();
  }

  // Esc: put the selected piece back where it was.
  cancelSelection() {
    const selected = this.selectedId();
    if (selected) this.#dispatch("release", selected);
  }

  #canMove(pieceId) {
    const def = this.defs.get(pieceId);
    const piece = this.store.getState().pieces[pieceId];
    if (!def || !piece || def.fixed || piece.containerId) return false;
    return !piece.heldBy || piece.heldBy === this.playerId;
  }

  // Grabs the piece if needed, and remembers where on the piece the pointer
  // caught it, so the piece doesn't jump to center under the pointer.
  #startDrag(gesture) {
    if (!this.#select(gesture.pieceId)) return false;
    const piece = this.store.getState().pieces[gesture.pieceId];
    const point = this.tablePoint(gesture.start.x, gesture.start.y, gesture.pieceId);
    gesture.offset = point ? [piece.x - point[0], piece.y - point[1]] : [0, 0];
    this.setCursor("grabbing");
    return true;
  }

  // Selecting a piece puts back whatever you had selected before.
  #select(pieceId) {
    const previous = this.selectedId();
    if (previous === pieceId) return true;
    if (previous) this.#dispatch("release", previous);
    return this.#dispatch("grab", pieceId).ok;
  }

  #place(pieceId, clientX, clientY) {
    const point = this.tablePoint(clientX, clientY, pieceId);
    if (!point) return;
    const [x, y] = this.clampToTable(point);
    this.#dispatch("drop", pieceId, { x, y });
  }

  #dispatch(type, pieceId, extra = {}) {
    return this.store.dispatch({ type, pieceId, playerId: this.playerId, ...extra });
  }

  #end() {
    this.unschedule(this.gesture?.timer);
    this.gesture = null;
    this.setCameraEnabled(true);
    this.setCursor("");
  }
}
