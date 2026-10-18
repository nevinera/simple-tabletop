// Table coordinates: x runs right, y runs away from the near edge, height is
// up (see docs/manifest-format.md). Three is y-up and right-handed, so table
// y maps to Three's -z, and clockwise-from-above rotation maps to -rotation.y.

export const DEG = Math.PI / 180;

// [x, height, y] in table units <-> [x, y, z] in Three's units.
export function tableToThree([x, height, y]) {
  return [x, height, -y];
}

export function threeToTable([x, y, z]) {
  return [x, y, -z];
}

export function tableRotationToThree(degrees) {
  return -degrees * DEG;
}
