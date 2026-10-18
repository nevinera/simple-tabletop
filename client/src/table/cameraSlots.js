// Saved camera views, keyed 1-9 per game. Number keys jump to a slot and
// shift+number saves the current view into it. A view is
// { position: [x, height, y], target: [x, height, y] } in table units.
export class CameraSlots {
  constructor(storage, gameId) {
    this.storage = storage;
    this.key = `simple-tabletop:camera-slots:${gameId}`;
  }

  // Uses event.code, since shift+1 reports event.key as "!".
  static slotForKey(event) {
    const match = /^(?:Digit|Numpad)([1-9])$/.exec(event.code || "");
    return match ? match[1] : null;
  }

  load(slot) {
    return this.#all()[slot] || null;
  }

  save(slot, view) {
    const all = this.#all();
    all[slot] = view;
    try {
      this.storage.setItem(this.key, JSON.stringify(all));
    } catch {
      // Storage can be full or blocked; the slot just won't persist.
    }
  }

  #all() {
    try {
      return JSON.parse(this.storage.getItem(this.key)) || {};
    } catch {
      return {};
    }
  }
}
