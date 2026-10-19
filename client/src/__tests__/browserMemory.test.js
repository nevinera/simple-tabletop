import { describe, expect, it } from "vitest";
import { recentModules, rememberModule, rememberName, rememberedName } from "../browserMemory";

const memoryStorage = () => {
  const items = new Map();
  return { getItem: (key) => items.get(key) ?? null, setItem: (key, value) => items.set(key, String(value)) };
};
const blocked = { getItem: () => { throw new Error("blocked"); }, setItem: () => { throw new Error("blocked"); } };

describe("recent modules", () => {
  it("keeps the newest first, once each, with its name and version", () => {
    const storage = memoryStorage();
    rememberModule({ url: "https://a.test/m.json", name: "A", version: "1.0" }, storage, 1);
    rememberModule({ url: "https://b.test/m.json", name: "B" }, storage, 2);
    rememberModule({ url: "https://a.test/m.json", name: "A", version: "1.1" }, storage, 3);
    expect(recentModules(storage)).toEqual([
      { url: "https://a.test/m.json", name: "A", version: "1.1", playedAt: 3 },
      { url: "https://b.test/m.json", name: "B", version: null, playedAt: 2 },
    ]);
  });

  it("keeps ten at most", () => {
    const storage = memoryStorage();
    for (let i = 0; i < 12; i++) rememberModule({ url: `https://m${i}.test/`, name: `M${i}` }, storage, i);
    expect(recentModules(storage)).toHaveLength(10);
    expect(recentModules(storage)[0].name).toBe("M11");
  });

  it("comes back empty when storage is blocked or holds junk", () => {
    expect(recentModules(blocked)).toEqual([]);
    expect(() => rememberModule({ url: "x", name: "X" }, blocked)).not.toThrow();
    const junk = memoryStorage();
    junk.setItem("simple-tabletop:recent-modules", "{nope");
    expect(recentModules(junk)).toEqual([]);
  });
});

describe("your name", () => {
  it("remembers the last one", () => {
    const storage = memoryStorage();
    expect(rememberedName(storage)).toBe("");
    rememberName("Sam", storage);
    expect(rememberedName(storage)).toBe("Sam");
    expect(rememberedName(blocked)).toBe("");
  });
});
