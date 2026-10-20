// Turns pointer events into table actions (see "Selecting and placing" in
// plans/client.md). Objects are pieces and decks:
//
// - Click or tap a movable object to select it: you grab it and it lifts.
// - Press on a movable object and drag to move it; releasing drops it.
// - Drag a locked deck, bag, or stack to draw from it.
// - With something selected, a mouse click on open table places it there,
//   and on touch a tap-and-hold does. A plain tap on open table cancels.
// - Shift-click a movable object to add it to what you hold, or take it back
//   out, and shift-drag over the table to add everything in a box. What you
//   hold moves as a group with whichever piece of it you drag or place.
// - Right-click an object, or tap and hold it on touch, for its context menu.
// - In magnify mode (touch), a tap magnifies what it hits instead.
// - In select mode (touch), everything works as if Shift were held: taps add
//   and take out, and dragging the table draws a box.
// - Anything else (empty table, locked pieces) goes to the camera.
//
// Cards in your own hand, and in a splayed deck, move like loose pieces,
// except a splayed deck's top card, which moves the deck. The hand strip drives
// drags from outside the canvas through the hand* methods.
//
// When the server turns down your action because someone got there first,
// lost() ends the gesture it came from, and the pointer does nothing more
// until you let go.
//
// The scene supplies hit testing through `pick` and `tablePoint`, so this
// runs without WebGL in tests.

import { rollValues } from "../state/dice";
import { DEFAULT_SPLAY, fanSpots, findObject, pieceDef, pilesWith, spawnedId } from "../state/objects";
import { scatter } from "../state/trays";
import { handId, seatOf } from "../state/seats";

export const DRAG_THRESHOLD_PX = 6;
export const LONG_PRESS_MS = 500;
const DRAWABLE = ["deck", "bag", "stack"];

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
    onHover = () => {}, // (id or null): whatever is under the mouse, movable or not
    onMagnify = () => {}, // (id or null): a magnify-mode tap
    onLostRace = () => {}, // ({ id, holder, clientX, clientY }): someone else got it first
    pickBox = () => [], // (left, top, right, bottom) in client pixels -> ids of loose objects inside
    onSelectBox = () => {}, // ({ left, top, right, bottom } or null): the box being drawn
    schedule = setTimeout,
    unschedule = clearTimeout,
    random = Math.random,
  }) {
    Object.assign(this, {
      store, manifest, playerId, pick, tablePoint, clampToTable, setCameraEnabled, setCursor, onContextMenu,
      onBlockedRotate, onHover, onMagnify, onLostRace, pickBox, onSelectBox, random,
    });
    this.nameOf = () => null; // player id -> name
    this.magnifyMode = false;
    this.selectMode = false;
    this.relocateOnTrayRoll = true; // whether rolling a tray scatters its dice
    // Wrapped, since the browser's timer functions throw when called as methods.
    this.schedule = (fn, ms) => schedule(fn, ms);
    this.unschedule = (id) => unschedule(id);
    this.gesture = null;
    this.hoveredId = null;
    this.pointer = { x: 0, y: 0 }; // where the pointer was last seen
  }

  selectedId() {
    const { pieces, containers } = this.store.getState();
    const mine = (group) => Object.keys(group).find((id) => group[id].heldBy === this.playerId);
    return mine(pieces) || mine(containers) || null;
  }

  // Everything you hold, pieces first.
  selectedIds() {
    const { pieces, containers } = this.store.getState();
    const mine = (group) => Object.keys(group).filter((id) => group[id].heldBy === this.playerId);
    return [...mine(pieces), ...mine(containers)];
  }

  // What rotate acts on: the selected object, or else the one under the
  // mouse. Turning one of a group swings the rest around it.
  actionTarget() {
    return this.selectedId() || this.hoveredId;
  }

  // What flip and lock act on without an id given: everything you hold, or
  // else the object under the mouse.
  #actionTargets(id) {
    if (id !== undefined) return id ? [id] : [];
    const selected = this.selectedIds();
    if (selected.length) return selected;
    return this.hoveredId ? [this.hoveredId] : [];
  }

  // Adds an object to what you hold, or takes it back out. Cards in your hand
  // and things on the table don't mix: adding one kind lets go of the other.
  toggleSelect(id) {
    const object = this.#object(id);
    if (!object || !this.#canMove(id)) return false;
    if (object.state.heldBy === this.playerId) return this.#dispatch("release", id).ok;
    // Where something is, for grouping: on the table, in your hand, or
    // somewhere else that doesn't group at all.
    const place = (other) => {
      const containerId = this.#object(other).state.containerId;
      return !containerId ? "table" : containerId === this.#ownHand() ? "hand" : other;
    };
    for (const other of this.selectedIds()) {
      if (place(other) !== place(id)) this.#dispatch("release", other);
    }
    return this.#dispatch("grab", id).ok;
  }

  // What the context menu offers for an object, or null if it can't have one.
  describe(id) {
    const object = this.#object(id);
    if (!object || object.def.kind === "hand" || !this.#reachable(object)) return null;
    const container = object.kind === "container";
    const die = object.def.shape === "die";
    const inHand = Boolean(object.state.containerId) && object.state.containerId === this.#ownHand();
    const inDeck = Boolean(object.state.containerId) && this.#object(object.state.containerId).def.kind === "deck";
    const infinite = Boolean(object.def.template);
    return {
      kind: container ? object.def.kind : die ? "die" : "piece",
      locked: object.state.locked,
      count: container && !infinite ? object.state.members.length : null,
      infinite,
      canMakeDeck: !container && !object.state.containerId && object.def.kind === "card",
      searchable: ["deck", "bag"].includes(object.def.kind) && !infinite && object.state.members.length > 0,
      canStackUp: this.#stackable(id),
      canFlip: container ? object.def.kind === "deck" : !["die", "board", "standee", "pawn"].includes(object.def.kind),
      splay: object.def.kind === "deck" ? object.state.splay : null,
      splayDistance: object.def.kind === "deck" ? object.state.splayDistance ?? object.def.splayDistance ?? DEFAULT_SPLAY : null,
      states: object.def.states?.map((state) => state.name) || null,
      stateIndex: object.def.states ? object.state.stateIndex || 0 : null,
      hasHand: Boolean(this.#ownHand()),
      inHand,
      inDeck,
      inTray: die && Boolean(object.state.containerId),
      trayId: die ? object.state.containerId : null,
    };
  }

  // The name of whoever else holds an object, or null.
  holderName(id) {
    const holder = this.#heldByOther(id);
    return holder ? this.nameOf(holder) || "Someone else" : null;
  }

  // Your action no longer applies after someone else's change: { action,
  // holder } from the store. A turn or flip wiggles, and losing something to
  // another player says who has it.
  lost({ action, holder }) {
    const gesture = this.gesture;
    if (gesture && !gesture.done && [gesture.objectId, gesture.deckId].includes(action.id)) {
      gesture.done = true;
      this.setCursor("");
    }
    if (["flip", "rotate", "splay"].includes(action.type)) this.onBlockedRotate(action.id, action.degrees || 1);
    else if (holder) this.onLostRace({ id: action.id, holder, clientX: this.pointer.x, clientY: this.pointer.y });
  }

  flip(id) {
    for (const target of this.#actionTargets(id)) this.#dispatch("flip", target);
  }

  // Puts a card in one of its states.
  changeState(index, id = this.actionTarget()) {
    if (id) this.#dispatch("changeState", id, { index });
  }

  // Moves a card on to its next state, back to the first after the last.
  nextState(id = this.actionTarget()) {
    const states = id && this.#object(id)?.def.states;
    if (states) this.changeState(((this.#object(id).state.stateIndex || 0) + 1) % states.length, id);
  }

  // degrees: positive is clockwise.
  rotate(degrees, id = this.actionTarget()) {
    if (!id) return;
    if (this.#dispatch("rotate", id, { degrees }).blocked) this.onBlockedRotate(id, degrees);
  }

  // Rolls dice where they sit: every die you hold, when the one given is one
  // of them or none is given, or else just the one given or hovered.
  roll(id) {
    const selected = this.selectedIds().filter((other) => this.#object(other).def.shape === "die");
    const dice = (id === undefined || selected.includes(id)) && selected.length ? selected : [id ?? this.hoveredId];
    for (const die of dice) {
      const object = die && this.#object(die);
      if (object?.def.shape === "die") this.#dispatch("roll", die, { values: rollValues([object.def], this.random) });
    }
  }

  // Rolls every die in a tray, scattering them if relocateOnTrayRoll is on.
  // With no tray given, uses
  // the tray under the mouse, or the one holding the die under it.
  rollTray(trayId = this.#trayTarget()) {
    const tray = trayId && this.#object(trayId);
    if (tray?.def.kind !== "tray" || !tray.state.members.length) return;
    const dice = tray.state.members.map((id) => pieceDef(this.manifest, id));
    const spots = (this.relocateOnTrayRoll && scatter(tray.def, dice, this.random)) || tray.state.spots;
    this.#dispatch("roll", trayId, { values: rollValues(dice, this.random), spots });
  }

  lock(id) {
    for (const target of this.#actionTargets(id)) this.#dispatch("lock", target);
  }

  // Draws from a deck, bag, or stack into your grip, putting back whatever
  // you held, or with toHand, into your hand. A deck or stack gives its top
  // piece and a bag a random one. With no container given, uses the hovered one, or
  // the selected one. Returns the drawn piece's id, or null.
  // count draws that many from a deck or stack into your hand.
  // pick takes that member of a deck or bag, as from a search.
  draw(containerId = this.#drawTarget(), { toHand = false, count = null, pick = null } = {}) {
    const container = containerId && this.#object(containerId);
    if (!container || !this.#hasSomething(container)) return null;
    if (count != null) return this.#dispatch("draw", containerId, { toHand: true, count }).ok;
    const { members } = container.state;
    let pieceId = members[0];
    const extra = {};
    if (pick != null) {
      pieceId = pick;
      extra.pick = pick;
    } else if (container.def.template) {
      pieceId = spawnedId(containerId, container.state.spawned + 1);
    } else if (container.def.kind === "bag") {
      pieceId = members[Math.floor(this.random() * members.length)];
      extra.pick = pieceId;
    }
    if (toHand) return this.#dispatch("draw", containerId, { ...extra, toHand }).ok ? pieceId : null;
    this.#releaseAll();
    return this.#dispatch("draw", containerId, extra).ok ? pieceId : null;
  }

  // A card in your hand, picked up from the hand strip.
  handGrab(cardId) {
    return this.#select(cardId);
  }

  handMove(cardId, clientX, clientY) {
    const point = this.tablePoint(clientX, clientY, cardId);
    if (!point) return;
    const [x, y] = this.clampToTable(point);
    this.#dispatch("drag", cardId, { x, y });
  }

  // Let go over the strip at `index`, or over the table where the card
  // floats, or anywhere else to put it back.
  handDrop(cardId, { index = null, overTable = false } = {}) {
    const card = this.#object(cardId).state;
    if (index != null) this.#dispatch("drop", cardId, { into: this.#ownHand(), index });
    else if (overTable && card.drag) this.#dispatch("drop", cardId, card.drag);
    else this.#dispatch("release", cardId);
  }

  shuffle(deckId) {
    const order = [...this.#object(deckId).state.members];
    for (let i = order.length - 1; i > 0; i--) {
      const j = Math.floor(this.random() * (i + 1));
      [order[i], order[j]] = [order[j], order[i]];
    }
    this.#dispatch("shuffle", deckId, { order });
  }

  // Puts a deck's cards in the order a player chose, top first. Returns
  // whether it took, which it won't if the deck changed meanwhile.
  reorder(deckId, order) {
    return this.#dispatch("reorder", deckId, { order }).ok;
  }

  // Puts the top cards of a deck back in a new order, leaving the rest. False
  // if the top cards aren't the ones in order anymore.
  reorderTop(deckId, order) {
    const members = this.#object(deckId)?.state.members || [];
    const top = members.slice(0, order.length);
    if ([...top].sort().join("\n") !== [...order].sort().join("\n")) return false;
    return this.reorder(deckId, [...order, ...members.slice(order.length)]);
  }

  // Fans a deck out toward `direction`, or closes it with null, and with
  // distance, changes its spacing. A fan that would run into something wiggles.
  splay(deckId, { direction, distance } = {}) {
    const extra = { direction };
    if (distance !== undefined) extra.distance = distance;
    if (this.#dispatch("splay", deckId, extra).blocked) this.onBlockedRotate(deckId, 1); // any turn wiggles
  }

  // Piles up the loose pieces you hold, where the first one lies, if they
  // all pile together (see pilesWith).
  stackUp() {
    const pile = this.#pileToStack();
    if (pile) this.#dispatch("stackUp", pile[0], { others: pile.slice(1) });
  }

  // The loose pieces you hold, if there are several and they all pile
  // together, or null.
  #pileToStack() {
    const pile = this.selectedIds().map((id) => this.#object(id))
      .filter((object) => object.kind === "piece" && !object.state.containerId);
    if (pile.length < 2 || pile.length !== this.selectedIds().length) return null;
    return pile.every((object) => pilesWith(pile[0].def, object.def)) ? pile.map((object) => object.id) : null;
  }

  // Whether a menu for this object offers to stack up what you hold.
  #stackable(id) {
    return Boolean(this.#pileToStack()?.includes(id));
  }

  makeDeck(id) {
    const deckId = `deck-${Math.floor(this.random() * 2 ** 48).toString(36)}`;
    this.#dispatch("makeDeck", id, { deckId });
  }

  // Returns true when the event starts an object gesture, so the caller can
  // capture the pointer.
  pointerDown(event) {
    if (!event.isPrimary) return false;
    this.pointer = { x: event.clientX, y: event.clientY };
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

    if (this.magnifyMode) {
      this.gesture = { ...base, kind: "magnify" };
      return false;
    }

    const adding = event.shiftKey || this.selectMode;
    if (adding && !(hit && this.#canMove(hit))) {
      // Shift-drag over the table draws a box to select what's inside.
      this.setCameraEnabled(false);
      this.gesture = { ...base, kind: "box" };
      return true;
    }

    if (hit && this.#canMove(hit)) {
      this.setCameraEnabled(false);
      const gesture = { ...base, kind: "object", objectId: hit, toggle: adding };
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
        else if (hit && this.#hasMenu(hit)) this.#openMenu(hit, start, pointerType);
      });
    }
    return false;
  }

  pointerMove(event) {
    const gesture = this.gesture;
    if (event.isPrimary) this.pointer = { x: event.clientX, y: event.clientY };
    if (!gesture) {
      if (event.pointerType === "mouse") {
        const hit = this.pick(event.clientX, event.clientY);
        this.onHover(hit);
        this.hoveredId = hit && this.describe(hit) ? hit : null;
        if (hit && this.#heldByOther(hit)) this.setCursor("not-allowed");
        else this.setCursor(hit && (this.#canMove(hit) || this.#canDrawFrom(hit)) ? "grab" : "");
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
        // Dragging a locked deck or bag pulls something out.
        const card = this.draw(gesture.deckId);
        if (!card) return this.#end();
        Object.assign(gesture, { kind: "object", objectId: card });
      }
      if (gesture.kind === "object" && !this.#startDrag(gesture)) return this.#end();
    }

    if (gesture.kind === "box") {
      this.onSelectBox(boxBetween(gesture.start, { x: event.clientX, y: event.clientY }));
      return;
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
    } else if (gesture.kind === "magnify") {
      if (!gesture.moved) this.onMagnify(this.pick(event.clientX, event.clientY));
    } else if (gesture.kind === "secondary") {
      if (!gesture.moved) {
        const hit = this.pick(event.clientX, event.clientY);
        if (hit && this.#hasMenu(hit)) this.#openMenu(hit, { x: event.clientX, y: event.clientY }, event.pointerType);
      }
    } else if (gesture.kind === "box") {
      this.onSelectBox(null);
      if (gesture.moved) this.#selectBox(boxBetween(gesture.start, { x: event.clientX, y: event.clientY }));
    } else if (gesture.kind === "object" && gesture.toggle && !gesture.moved) {
      this.toggleSelect(gesture.objectId);
    } else if (gesture.kind === "object") {
      const object = this.#object(gesture.objectId);
      // Dropping where you let go, or clicking the selected object, sets it
      // down where it floats. A card still in your hand just goes back.
      if (object.state.containerId && !object.state.drag) {
        if (object.state.heldBy === this.playerId) this.#dispatch("release", gesture.objectId);
        else this.#select(gesture.objectId);
      } else if (gesture.moved || object.state.heldBy === this.playerId) {
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
        if (gesture.kind === "table") this.#releaseAll();
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
    if (gesture.kind === "object" && gesture.moved) this.#releaseAll();
    if (gesture.kind === "box") this.onSelectBox(null);
    this.#end();
  }

  pointerLeave() {
    this.hoveredId = null;
    this.onHover(null);
  }

  // Esc: put everything you hold back where it was.
  cancelSelection() {
    this.#releaseAll();
  }

  #releaseAll() {
    for (const id of this.selectedIds()) this.#dispatch("release", id);
  }

  // Adds the loose things you can move inside a box to what you hold. Cards
  // from your hand don't mix with them, so those go back.
  #selectBox({ left, top, right, bottom }) {
    const ids = this.pickBox(left, top, right, bottom)
      .filter((id) => this.#canMove(id) && !this.#object(id).state.containerId && !this.#object(id).state.heldBy);
    if (!ids.length) return;
    for (const other of this.selectedIds()) {
      if (this.#object(other).state.containerId) this.#dispatch("release", other);
    }
    for (const id of ids) this.#dispatch("grab", id);
  }

  #object(id) {
    return findObject(this.manifest, this.store.getState(), id);
  }

  // Loose, in your own hand, a die in a tray, or a card in a splayed deck,
  // where nobody else holds the tray or deck; and not held by someone else.
  #reachable(object) {
    const { containerId, heldBy } = object.state;
    const free = (holder) => !holder || holder === this.playerId;
    const holder = containerId && this.store.getState().containers[containerId];
    const opened = (holder?.spots || holder?.splay) && free(holder.heldBy);
    const inReach = !containerId || containerId === this.#ownHand() || opened;
    return Boolean(inReach && free(heldBy));
  }

  #heldByOther(id) {
    const holder = this.#object(id)?.state.heldBy;
    return holder && holder !== this.playerId ? holder : null;
  }

  // Your things have their actions, and others' say who has them.
  #hasMenu(id) {
    return Boolean(this.describe(id) || this.#heldByOther(id));
  }

  #ownHand() {
    const seatId = seatOf(this.store.getState(), this.playerId);
    return seatId && handId(seatId);
  }

  #canMove(id) {
    const object = this.#object(id);
    return Boolean(object && object.def.kind !== "hand" && this.#reachable(object) && !object.state.locked);
  }

  #canDrawFrom(id) {
    const object = this.#object(id);
    return Boolean(object && this.#hasSomething(object) && this.#reachable(object));
  }

  // A deck, bag, or stack with something to draw. An infinite bag always has.
  #hasSomething(object) {
    if (object.kind !== "container" || !DRAWABLE.includes(object.def.kind)) return false;
    return Boolean(object.def.template || object.state.members.length);
  }

  #trayTarget() {
    const id = this.hoveredId || this.selectedId();
    const object = id && this.#object(id);
    if (!object) return null;
    if (object.def.kind === "tray") return id;
    const holder = object.state.containerId && this.#object(object.state.containerId);
    return holder?.def.kind === "tray" ? holder.id : null;
  }

  #drawTarget() {
    const drawable = (id) => id && DRAWABLE.includes(this.#object(id)?.def.kind);
    if (drawable(this.hoveredId)) return this.hoveredId;
    const selected = this.selectedId();
    return drawable(selected) ? selected : null;
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
    // A held object may be floating away from its resting spot. A card in a
    // hand has no spot of its own, so it centers on the pointer, and a card
    // in a fan uses its place in the fan.
    const { x, y } = object.drag || this.#fanSpot(gesture.objectId) || object;
    const point = this.tablePoint(gesture.start.x, gesture.start.y, gesture.objectId);
    gesture.offset = point && x != null ? [x - point[0], y - point[1]] : [0, 0];
    this.setCursor("grabbing");
    return true;
  }

  #fanSpot(id) {
    const containerId = this.#object(id).state.containerId;
    const deck = containerId && this.#object(containerId);
    if (!deck?.state.splay) return null;
    return fanSpots(deck)[deck.state.members.indexOf(id)];
  }

  // Selecting an object puts back whatever you had selected before, unless
  // it's already one of the things you hold.
  #select(id) {
    if (this.#object(id)?.state.heldBy === this.playerId) return true;
    this.#releaseAll();
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

// The box between two client points, as { left, top, right, bottom }.
function boxBetween(a, b) {
  return { left: Math.min(a.x, b.x), top: Math.min(a.y, b.y), right: Math.max(a.x, b.x), bottom: Math.max(a.y, b.y) };
}
