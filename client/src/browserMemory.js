// What this browser remembers between visits: the modules it played from,
// and the name its player goes by. Storage can be blocked or empty, so every
// read falls back to nothing.

const MODULES_KEY = "simple-tabletop:recent-modules";
const NAME_KEY = "simple-tabletop:player-name";
const DRAW_COUNT_KEY = "simple-tabletop:draw-count";
const DEFAULT_DRAW_COUNT = 5;
const MAX_MODULES = 10;

// [{ url, name, version, playedAt }], most recently played first.
export function recentModules(storage = localStorage) {
  try {
    const modules = JSON.parse(storage.getItem(MODULES_KEY));
    return Array.isArray(modules) ? modules.filter((module) => typeof module?.url === "string") : [];
  } catch {
    return [];
  }
}

// Moves a module to the front of the list, with its manifest's name and
// version as they are now.
export function rememberModule({ url, name, version }, storage = localStorage, now = Date.now()) {
  const others = recentModules(storage).filter((module) => module.url !== url);
  const modules = [{ url, name, version: version ?? null, playedAt: now }, ...others].slice(0, MAX_MODULES);
  try {
    storage.setItem(MODULES_KEY, JSON.stringify(modules));
  } catch {
    // Storage is blocked; the list just won't grow.
  }
}

export function rememberedName(storage = localStorage) {
  try {
    return storage.getItem(NAME_KEY) || "";
  } catch {
    return "";
  }
}

export function rememberName(name, storage = localStorage) {
  try {
    storage.setItem(NAME_KEY, name);
  } catch {
    // Storage is blocked; you'll type it again next time.
  }
}

// How many cards this player last drew into their hand at once.
export function rememberedDrawCount(storage = localStorage) {
  try {
    const count = Number.parseInt(storage.getItem(DRAW_COUNT_KEY), 10);
    return count > 0 ? count : DEFAULT_DRAW_COUNT;
  } catch {
    return DEFAULT_DRAW_COUNT;
  }
}

export function rememberDrawCount(count, storage = localStorage) {
  try {
    storage.setItem(DRAW_COUNT_KEY, String(count));
  } catch {
    // Storage is blocked; it goes back to the default next time.
  }
}
