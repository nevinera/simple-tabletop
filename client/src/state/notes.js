// Notes and score sheets: plaques players write on.
//
// A note holds `text`, up to MAX_NOTE_LENGTH characters. The table shows as
// much as fits on it; the rest shows when it's magnified or edited.
//
// A score sheet holds `players`, a heading per column, and `rounds`, one row
// per round with a score or null for each column. The table shows each
// heading with its running total.

import { MAX_COUNTER_VALUE } from "./objects";

export const MAX_NOTE_LENGTH = 10000;
export const MAX_SCORE_PLAYERS = 8;
export const MAX_SCORE_ROUNDS = 100;
export const MAX_SCORE_NAME = 16;
export const DEFAULT_SCORE_PLAYERS = ["Player 1", "Player 2", "Player 3", "Player 4"];

// Why a note's text won't do, or null.
export function noteError(text) {
  if (typeof text !== "string") return "A note's text must be text.";
  if (text.length > MAX_NOTE_LENGTH) return `A note holds at most ${MAX_NOTE_LENGTH} characters.`;
  return null;
}

// Why a score sheet's headings won't do, or null.
export function playersError(players) {
  if (!Array.isArray(players) || players.length < 1 || players.length > MAX_SCORE_PLAYERS) {
    return `A score sheet has 1 to ${MAX_SCORE_PLAYERS} players.`;
  }
  if (!players.every((name) => typeof name === "string" && name.length <= MAX_SCORE_NAME)) {
    return `A score sheet's headings are text, at most ${MAX_SCORE_NAME} characters.`;
  }
  return null;
}

// Why a score sheet's rounds won't do for this many players, or null.
export function roundsError(rounds, playerCount) {
  if (!Array.isArray(rounds) || rounds.length > MAX_SCORE_ROUNDS) return `A score sheet has at most ${MAX_SCORE_ROUNDS} rounds.`;
  const score = (cell) => cell === null || (Number.isInteger(cell) && Math.abs(cell) <= MAX_COUNTER_VALUE);
  if (!rounds.every((row) => Array.isArray(row) && row.length === playerCount && row.every(score))) {
    return "Each round needs a whole number, or nothing, for every player.";
  }
  return null;
}

// Each column's running total.
export function totals(players, rounds) {
  return players.map((_, column) => rounds.reduce((sum, row) => sum + (row[column] ?? 0), 0));
}
