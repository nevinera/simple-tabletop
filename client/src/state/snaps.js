// Snap points: spots on the table that pieces jump to when dropped near them,
// like the squares of a chess board (see snaps in docs/manifest-format.md).
// The manifest gives groups of points, each with a radius and what it takes.

// Where a piece let go of at (x, y) lands instead: the nearest point within
// its group's radius, among groups that take the piece, as [x, y], or null.
export function snapSpot(manifest, def, x, y) {
  let best = null;
  for (const group of manifest.snaps) {
    if (!takes(group, def)) continue;
    for (const [px, py] of group.points) {
      const distance = Math.hypot(px - x, py - y);
      if (distance <= group.radius && (!best || distance < best.distance)) best = { distance, spot: [px, py] };
    }
  }
  return best?.spot ?? null;
}

// A group with no accepts takes every piece; otherwise a piece fits a
// matcher when it has every field the matcher names.
function takes(group, def) {
  if (!group.accepts) return true;
  return group.accepts.some((matcher) =>
    (!matcher.kind || matcher.kind === def.kind) &&
    (!matcher.type || matcher.type === def.type) &&
    (!matcher.category || def.categories?.includes(matcher.category)));
}
