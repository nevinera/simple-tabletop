// Saved camera views, keyed 0-9 per game, in the browser's localStorage. A
// view is { position: [x, height, y], target: [x, height, y] } in table
// units. A slot nobody has saved returns null, and callers fall back to the
// starting view.
export class CameraSlots {
  constructor(storage, gameId) {
    this.storage = storage;
    this.key = `simple-tabletop:camera-slots:${gameId}`;
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
