const EASE_MS = 50; // time constant, so a move settles in about 150 ms
const CLOSE_ENOUGH = 0.1; // cm, too small to see

// Slides objects to where render() put them instead of jumping, so others'
// moves, and a grab you lost, read as motion. Objects you drive yourself go
// straight there.
export class Easing {
  constructor() {
    this.shown = new Map(); // object3d -> { position, visible } as last drawn
    this.moving = new Map(); // object3d -> target position
  }

  // Call after placing an object for new state. Puts it back where it
  // showed and eases from there, unless direct or it wasn't showing.
  settle(object, direct) {
    const target = object.position.clone();
    const last = this.shown.get(object);
    this.shown.set(object, { position: target.clone(), visible: object.visible });
    if (direct || !last?.visible || !object.visible || last.position.equals(target)) {
      this.moving.delete(object);
      return;
    }
    object.position.copy(last.position);
    this.shown.get(object).position.copy(last.position);
    this.moving.set(object, target);
  }

  step(dtSeconds) {
    const t = 1 - Math.exp((-dtSeconds * 1000) / EASE_MS);
    for (const [object, target] of this.moving) {
      object.position.lerp(target, t);
      if (object.position.distanceTo(target) < CLOSE_ENOUGH) {
        object.position.copy(target);
        this.moving.delete(object);
      }
      this.shown.get(object)?.position.copy(object.position);
    }
  }

  clear() {
    this.shown.clear();
    this.moving.clear();
  }
}
