// Turns pointer events into table actions (see "Selecting and placing" in
// plans/client.md). Objects are pieces and decks:
//
// - Click or tap a movable object to select it: you grab it and it lifts.
// - Press on a movable object and drag to move it; releasing drops it.
// - Drag a locked deck to draw its top card.
// - With something selected, a mouse click on open table places it there,
//   and on touch a tap-and-hold does. A plain tap on open table cancels.
// - Right-click an object, or tap and hold it on touch, for its context menu.
// - Anything else (empty table, locked pieces) goes to the camera.
//
// The scene supplies hit testing through `pick` and `tablePoint`, so this
// runs without WebGL in tests.

import { findObject } from "../state/objects";

export const DRAG_THRESHOLD_PX = 6;
export const LONG_PRESS_MS = 500;

export class PieceInteraction {
  constructor({
    store, manifest, playerId,
    pick, // (clientX, clientY) -> object id or null
    tablePoint, // (clientX, clientY, id) -> [x, y] on that object's resting plane, or null
    clampToTable, // ([x, y]) -> [x, y]
    setCameraEnabled, // (bool)
    setCursor, // (css cursor string)
    onContextMenu = () => {}, // ({ objectId, clientX, clientY, pointerType })
    onBlockedRotate = () => {}, // (id, degrees): turning would overlap something
    schedule = setTimeout,
    unschedule = clearTimeout,
    random = Math.random,
  }) {
    Object.assign(this, {
      store, manifest, playerId, pick, tablePoint, clampToTable, setCameraEnabled, setCursor, onContextMenu,
      onBlockedRotate, random,
    });
    // Wrapped, since the browser's timer functions throw when called as methods.
    this.schedule = (fn, ms) => schedule(fn, ms);
    this.unschedule = (id) => unschedule(id);
    this.gesture = null;
    this.hoveredId = null;
  }

  selectedId() {
    const { pieces, containers } = this.store.getState();
    const mine = (group) => Object.keys(group).find((id) => group[id].heldBy === this.playerId);
    return mine(pieces) || mine(containers) || null;
  }

  // What flip, rotate, and lock act on: the selected object, or else the one
  // under the mouse.
  actionTarget() {
    return this.selectedId() || this.hoveredId;
  }

  // What the context menu offers for an object, or null if it can't have one.
  describe(id) {
    const object = this.#object(id);
    if (!object || !this.#reachable(object)) return null;
    const deck = object.kind === "container";
    return {
      kind: deck ? "deck" : "piece",
      locked: object.state.locked,
      count: deck ? object.state.members.length : null,
      canMakeDeck: !deck && object.def.shape === "rect",
    };
  }

  flip(id = this.actionTarget()) {
    if (id) this.#dispatch("flip", id);
  }

  // degrees: positive is clockwise.
  rotate(degrees, id = this.actionTarget()) {
    if (!id) return;
    if (this.#dispatch("rotate", id, { degrees }).blocked) this.onBlockedRotate(id, degrees);
  }

  lock(id = this.actionTarget()) {
    if (id) this.#dispatch("lock", id);
  }

  // Draws the top card of a deck into your grip, putting back whatever you
  // held. With no deck given, uses the hovered deck, or the selected one.
  draw(deckId = this.#drawTarget()) {
    if (!deckId || !this.#object(deckId)?.state.members.length) return null;
    const top = this.#object(deckId).state.members[0];
    const previous = this.selectedId();
    if (previous) this.#dispatch("release", previous);
    return this.#dispatch("draw", deckId).ok ? top : null;
  }

  shuffle(deckId) {
    const order = [...this.#object(deckId).state.members];
    for (let i = order.length - 1; i > 0; i--) {
      const j = Math.floor(this.random() * (i + 1));
      [order[i], order[j]] = [order[j], order[i]];
    }
    this.#dispatch("shuffle", deckId, { order });
  }

  makeDeck(id) {
    const deckId = `deck-${Math.floor(this.random() * 2 ** 48).toString(36)}`;
    this.#dispatch("makeDeck", id, { deckId });
  }

  // Returns true when the event starts an object gesture, so the caller can
  // capture the pointer.
  pointerDown(event) {
    if (!event.isPrimary) return false;
    const start = { x: event.clientX, y: event.clientY };
    const pointerType = event.pointerType;

    // Right-drag pans, so the camera keeps it; a right-click without moving
    // opens a menu on release.
    if (event.button === 2) {
      this.gesture = { kind: "secondary", pointerId: event.pointerId, start, moved: false };
      return false;
    }
    if (event.button !== 0) return false;

    const hit = this.pick(event.clientX, event.clientY);
    const selected = this.selectedId();
    const base = { pointerId: event.pointerId, start, moved: false, done: false };

    if (hit && this.#canMove(hit)) {
      this.setCameraEnabled(false);
      const gesture = { ...base, kind: "object", objectId: hit };
      this.gesture = gesture;
      if (pointerType === "touch") gesture.timer = this.#later(gesture, () => this.#openMenu(hit, start, pointerType));
      return true;
    }

    if (hit && this.#canDrawFrom(hit)) {
      this.setCameraEnabled(false);
      const gesture = { ...base, kind: "deck", deckId: hit };
      this.gesture = gesture;
      if (pointerType === "touch") {
        gesture.timer = this.#later(gesture, () => {
          if (selected) this.#place(selected, start.x, start.y);
          else this.#openMenu(hit, start, pointerType);
        });
      }
      return true;
    }

    // Empty table, or something locked: the camera gets it.
    const gesture = { ...base, kind: "table" };
    this.gesture = gesture;
    if (pointerType === "touch") {
      gesture.timer = this.#later(gesture, () => {
        if (selected) this.#place(selected, start.x, start.y);
        else if (hit && this.describe(hit)) this.#openMenu(hit, start, pointerType);
      });
    }
    return false;
  }

  pointerMove(event) {
    const gesture = this.gesture;
    if (!gesture) {
      if (event.pointerType === "mouse") {
        const hit = this.pick(event.clientX, event.clientY);
        this.hoveredId = hit && this.describe(hit) ? hit : null;
        this.setCursor(hit && (this.#canMove(hit) || this.#canDrawFrom(hit)) ? "grab" : "");
      }
      return;
    }
    if (event.pointerId !== gesture.pointerId || gesture.done) return;

    if (!gesture.moved) {
      const dx = event.clientX - gesture.start.x;
      const dy = event.clientY - gesture.start.y;
      if (dx * dx + dy * dy < DRAG_THRESHOLD_PX * DRAG_THRESHOLD_PX) return;
      gesture.moved = true;
      this.unschedule(gesture.timer);
      if (gesture.kind === "deck") {
        // Dragging a locked deck pulls its top card off.
        const card = this.draw(gesture.deckId);
        if (!card) return this.#end();
        Object.assign(gesture, { kind: "object", objectId: card });
      }
      if (gesture.kind === "object" && !this.#startDrag(gesture)) return this.#end();
    }

    if (gesture.kind === "object") {
      const point = this.tablePoint(event.clientX, event.clientY, gesture.objectId);
      if (!point) return;
      const [x, y] = this.clampToTable([point[0] + gesture.offset[0], point[1] + gesture.offset[1]]);
      this.#dispatch("drag", gesture.objectId, { x, y });
    }
  }

  pointerUp(event) {
    const gesture = this.gesture;
    if (!gesture || event.pointerId !== gesture.pointerId) return;

    if (gesture.done) {
      // A long press already did its thing.
    } else if (gesture.kind === "secondary") {
      if (!gesture.moved) {
        const hit = this.pick(event.clientX, event.clientY);
        if (hit && this.describe(hit)) this.#openMenu(hit, { x: event.clientX, y: event.clientY }, event.pointerType);
      }
    } else if (gesture.kind === "object") {
      const object = this.#object(gesture.objectId);
      // Dropping where you let go, or clicking the selected object, sets it
      // down where it floats.
      if (gesture.moved || object.state.heldBy === this.playerId) {
        const { x, y } = object.state.drag || object.state;
        this.#dispatch("drop", gesture.objectId, { x, y });
      } else {
        this.#select(gesture.objectId);
      }
    } else if (!gesture.moved) {
      // A click on open table, a locked object, or a locked deck. On touch,
      // a plain tap cancels and only a tap-and-hold places.
      const selected = this.selectedId();
      if (selected && event.pointerType === "touch") {
        if (gesture.kind === "table") this.#dispatch("release", selected);
      } else if (selected) {
        this.#place(selected, event.clientX, event.clientY);
      }
    }
    this.#end();
  }

  // The browser took the pointer away (a scroll, a second finger, a
  // dialog). Put a dragged object back where it started.
  pointerCancel(event) {
    const gesture = this.gesture;
    if (!gesture || event.pointerId !== gesture.pointerId) return;
    if (gesture.kind === "object" && gesture.moved) this.#dispatch("release", gesture.objectId);
    this.#end();
  }

  pointerLeave() {
    this.hoveredId = null;
  }

  // Esc: put the selected object back where it was.
  cancelSelection() {
    const selected = this.selectedId();
    if (selected) this.#dispatch("release", selected);
  }

  #object(id) {
    return findObject(this.manifest, this.store.getState(), id);
  }

  // Not in a container, and not held by someone else.
  #reachable(object) {
    return !object.state.containerId && (!object.state.heldBy || object.state.heldBy === this.playerId);
  }

  #canMove(id) {
    const object = this.#object(id);
    return Boolean(object && this.#reachable(object) && !object.state.locked);
  }

  #canDrawFrom(id) {
    const object = this.#object(id);
    return Boolean(object && object.kind === "container" && object.def.kind === "deck" &&
      this.#reachable(object) && object.state.members.length);
  }

  #drawTarget() {
    const isDeck = (id) => id && this.#object(id)?.def.kind === "deck";
    if (isDeck(this.hoveredId)) return this.hoveredId;
    const selected = this.selectedId();
    return isDeck(selected) ? selected : null;
  }

  #later(gesture, fn) {
    return this.schedule(() => {
      gesture.done = true;
      fn();
    }, LONG_PRESS_MS);
  }

  #openMenu(objectId, { x, y }, pointerType) {
    this.onContextMenu({ objectId, clientX: x, clientY: y, pointerType });
  }

  // Grabs the object if needed, and remembers where on it the pointer caught
  // it, so it doesn't jump to center under the pointer.
  #startDrag(gesture) {
    if (!this.#select(gesture.objectId)) return false;
    const object = this.#object(gesture.objectId).state;
    // A held object may be floating away from its resting spot.
    const { x, y } = object.drag || object;
    const point = this.tablePoint(gesture.start.x, gesture.start.y, gesture.objectId);
    gesture.offset = point ? [x - point[0], y - point[1]] : [0, 0];
    this.setCursor("grabbing");
    return true;
  }

  // Selecting an object puts back whatever you had selected before.
  #select(id) {
    const previous = this.selectedId();
    if (previous === id) return true;
    if (previous) this.#dispatch("release", previous);
    return this.#dispatch("grab", id).ok;
  }

  #place(id, clientX, clientY) {
    const point = this.tablePoint(clientX, clientY, id);
    if (!point) return;
    const [x, y] = this.clampToTable(point);
    this.#dispatch("drop", id, { x, y });
  }

  #dispatch(type, id, extra = {}) {
    return this.store.dispatch({ type, id, playerId: this.playerId, ...extra });
  }

  #end() {
    this.unschedule(this.gesture?.timer);
    this.gesture = null;
    this.setCameraEnabled(true);
    this.setCursor("");
  }
}
