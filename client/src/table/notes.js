import { totals } from "../state/notes";
import { paintTop } from "./counters";

const MARGIN = 0.06; // of the plaque's width, kept clear around the writing
const LINE_HEIGHT = 1.25; // times the font size
const SANS = "system-ui, sans-serif";

// Notes and score sheets are counters' plaques with other writing on top
// (see counters.js), built with buildCounter and placed like any flat piece.

// Writes as much of a note's text as fits, ending in "…" if it's cut short.
export function showNote(mesh, def, state) {
  paintTop(mesh, def, `note\n${state.text}`, (ctx, w, h) => {
    const size = Math.round(Math.min(h / 7, w / 16));
    const margin = w * MARGIN;
    ctx.font = `500 ${size}px ${SANS}`;
    ctx.textBaseline = "top";
    const room = Math.max(1, Math.floor((h - margin * 2) / (size * LINE_HEIGHT)));
    const lines = wrap(ctx, state.text || "", w - margin * 2, room + 1);
    const shown = lines.slice(0, room);
    if (lines.length > room) shown[room - 1] = ellipsize(ctx, shown[room - 1], w - margin * 2);
    shown.forEach((line, i) => ctx.fillText(line, margin, margin + i * size * LINE_HEIGHT));
  });
}

// Writes the sheet's title, then each player with their running total.
export function showScores(mesh, def, state) {
  const sums = totals(state.players, state.rounds);
  const key = `scores\n${state.label}\n${state.players.join("\t")}\n${sums.join("\t")}\n${state.rounds.length}`;
  paintTop(mesh, def, key, (ctx, w, h) => {
    const margin = w * MARGIN;
    const rows = Math.max(state.players.length, 3);
    const title = Math.round(h * 0.13);
    ctx.textBaseline = "middle";
    ctx.font = `700 ${title}px ${SANS}`;
    ctx.textAlign = "left";
    ctx.fillText(state.label || "Scores", margin, margin + title / 2, w * 0.6);
    ctx.globalAlpha = 0.6;
    ctx.font = `500 ${Math.round(title * 0.7)}px ${SANS}`;
    ctx.textAlign = "right";
    const played = state.rounds.length;
    ctx.fillText(played ? `${played} round${played === 1 ? "" : "s"}` : "", w - margin, margin + title / 2);
    ctx.globalAlpha = 1;

    const top = margin + title * 1.5;
    const step = (h - top - margin) / rows;
    const size = Math.round(Math.min(step * 0.62, h * 0.14));
    state.players.forEach((name, i) => {
      const y = top + step * (i + 0.5);
      ctx.globalAlpha = 0.15;
      ctx.fillRect(margin, top + step * (i + 1) - 1, w - margin * 2, 2);
      ctx.globalAlpha = 1;
      ctx.font = `500 ${size}px ${SANS}`;
      ctx.textAlign = "left";
      ctx.fillText(name || `Player ${i + 1}`, margin, y, w * 0.6);
      ctx.font = `800 ${size}px ${SANS}`;
      ctx.textAlign = "right";
      ctx.fillText(String(sums[i]), w - margin, y, w * 0.3);
    });
  });
}

// The text broken into lines no wider than `width`: at newlines, between
// words, and inside a word too long for a line. Stops once it has `most`.
export function wrap(ctx, text, width, most = Infinity) {
  const lines = [];
  for (const paragraph of text.split("\n")) {
    if (lines.length >= most) break;
    let line = "";
    for (const word of paragraph.split(/(\s+)/)) {
      if (lines.length >= most) break;
      if (!word) continue;
      const next = line + word;
      if (ctx.measureText(next).width <= width) {
        line = next;
        continue;
      }
      if (line.trim()) lines.push(line.trimEnd());
      line = word.trimStart();
      while (ctx.measureText(line).width > width && line.length > 1) {
        let cut = line.length - 1;
        while (cut > 1 && ctx.measureText(line.slice(0, cut)).width > width) cut -= 1;
        lines.push(line.slice(0, cut));
        line = line.slice(cut);
      }
    }
    lines.push(line.trimEnd());
  }
  return lines.slice(0, most);
}

function ellipsize(ctx, line, width) {
  let cut = line;
  while (cut && ctx.measureText(`${cut}…`).width > width) cut = cut.slice(0, -1);
  return `${cut.trimEnd()}…`;
}
