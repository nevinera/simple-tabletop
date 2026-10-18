import { findObject } from "../state/objects";

// Sound effects for table actions, from Kenney's Casino Audio pack (CC0,
// see assets/LICENSE-kenney-casino-audio.txt). Each sound picks one of its
// recordings at random.

const asset = (name) => new URL(`./assets/${name}.m4a`, import.meta.url).href;
const numbered = (name, numbers) => numbers.map((n) => asset(`${name}-${n}`));

export const SOUNDS = {
  dieShake: numbered("dice-shake", [3]),
  diceShake: numbered("dice-shake", [1]),
  diceGrab: numbered("dice-grab", [1]),
  shuffle: [asset("card-shuffle")],
  cardSlide: numbered("card-slide", [1, 2, 3, 4]),
  cardPlace: numbered("card-place", [1, 2, 4]),
};

// Picking up and setting down happen constantly, so they're quiet and cut
// short. length is in seconds.
const PICK_UP = { volume: 0.12, length: 0.25 };
const SET_DOWN = { volume: 0.18, length: 0.3 };

// The sound an action makes, as { sound, volume, length? }, or null.
// state is the table after the action.
export function soundFor(manifest, state, action) {
  switch (action.type) {
    case "roll": {
      const object = findObject(manifest, state, action.id);
      return { sound: object?.kind === "piece" ? "dieShake" : "diceShake", volume: 0.7 };
    }
    case "draw":
      return { sound: "cardSlide", volume: 0.5 };
    case "shuffle":
      return { sound: "shuffle", volume: 0.5 };
    case "grab": {
      const object = findObject(manifest, state, action.id);
      return { sound: object?.def.shape === "die" ? "diceGrab" : "cardSlide", ...PICK_UP };
    }
    case "drop":
    case "release":
      return { sound: "cardPlace", ...SET_DOWN };
    default:
      return null;
  }
}

// Plays sounds through Web Audio. Browsers only let audio start after you
// interact with the page, so it sets up on your first click or key press,
// and stays silent where there's no Web Audio.
export class TableSounds {
  constructor({ target = window, random = Math.random } = {}) {
    this.enabled = true;
    this.random = random;
    this.context = null;
    this.buffers = {};
    this.target = target;
    this.start = () => this.#setUp();
    if (!window.AudioContext) return;
    target.addEventListener("pointerdown", this.start, { once: true, capture: true });
    target.addEventListener("keydown", this.start, { once: true, capture: true });
  }

  play(effect) {
    if (!effect || !this.enabled || !this.context) return;
    const choices = this.buffers[effect.sound];
    if (!choices?.length) return;
    const buffer = choices[Math.floor(this.random() * choices.length)];
    const now = this.context.currentTime;
    const gain = this.context.createGain();
    gain.gain.setValueAtTime(effect.volume, now);
    const source = this.context.createBufferSource();
    source.buffer = buffer;
    source.connect(gain).connect(this.context.destination);
    source.start(now);
    if (effect.length) {
      // Fade out rather than click off.
      gain.gain.setValueAtTime(effect.volume, now + effect.length * 0.6);
      gain.gain.linearRampToValueAtTime(0, now + effect.length);
      source.stop(now + effect.length);
    }
  }

  dispose() {
    this.target.removeEventListener("pointerdown", this.start, { capture: true });
    this.target.removeEventListener("keydown", this.start, { capture: true });
    this.context?.close();
    this.context = null;
  }

  #setUp() {
    if (this.context) return;
    this.dispose();
    const context = new window.AudioContext();
    this.context = context;
    for (const [name, urls] of Object.entries(SOUNDS)) {
      Promise.all(urls.map((url) => fetch(url).then((r) => r.arrayBuffer()).then((data) => context.decodeAudioData(data))))
        .then((buffers) => { this.buffers[name] = buffers; })
        .catch(() => {}); // A sound that won't load just doesn't play.
    }
  }
}
