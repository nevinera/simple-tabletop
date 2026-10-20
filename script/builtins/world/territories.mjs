// Turns Natural Earth's public-domain country outlines into Global
// Domination's 42 territories, and writes them to territories.json for
// script/builtins/global-domination.mjs. Run it only to redraw the map:
//
//   npm install --no-save @turf/turf polylabel
//   node script/builtins/world/territories.mjs
//
// Each territory is a list of countries, some of them cut along lines of
// longitude and latitude. They're merged, projected (Miller cylindrical, from
// 169°W to 169°W the next time round, 56°S to 80°N), simplified, and
// written as SVG paths in centimeters on a board MAP_WIDTH wide.

import { writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import * as turf from "@turf/turf";
import polylabel from "polylabel";

const SOURCE = "https://raw.githubusercontent.com/nvkelso/natural-earth-vector/master/geojson/ne_50m_admin_0_countries.geojson";
const OUT = join(dirname(fileURLToPath(import.meta.url)), "territories.json");

export const MAP_WIDTH = 144; // cm
const WEST = -169;
const SOUTH = -56;
const NORTH = 80;
const MIN_AREA = 0.04; // cm², smaller islands are left off
const TOLERANCE = 0.05; // cm, for simplifying

// [lon, lat] boxes: [west, south, east, north].
const ALL = [-180, -90, 180, 90];
const box = (west, south, east, north) => [west, south, east, north];

// Each territory's countries, by ISO code, with an optional box to cut out.
const TERRITORIES = {
  alaska: [["USA", box(-169, 51, -129, 72)]],
  "northwest-territory": [["CAN", box(-141, 60, -79.5, 84)], ["CAN", box(-79.5, 62.6, -60, 84)]],
  greenland: [["GRL"]],
  alberta: [["CAN", box(-141, 40, -110, 60)]],
  ontario: [["CAN", box(-110, 40, -79.5, 60)]],
  quebec: [["CAN", box(-79.5, 40, -50, 62.6)], ["SPM"]],
  "western-united-states": [["USA", box(-126, 24, -98, 50)]],
  "eastern-united-states": [["USA", box(-98, 24, -66, 50)]],
  "central-america": [["MEX"], ["GTM"], ["BLZ"], ["HND"], ["SLV"], ["NIC"], ["CRI"], ["PAN"], ["CUB"], ["JAM"], ["HTI"], ["DOM"],
    ["BHS"], ["PRI"]],
  venezuela: [["VEN"], ["COL"], ["GUY"], ["SUR"], ["FRA", box(-55, 1, -51, 6)], ["TTO"]],
  peru: [["PER"], ["ECU"], ["BOL"]],
  brazil: [["BRA"]],
  argentina: [["ARG"], ["CHL"], ["URY"], ["PRY"], ["FLK"]],
  iceland: [["ISL"]],
  "great-britain": [["GBR"], ["IRL"], ["IMN"], ["FRO"]],
  scandinavia: [["NOR"], ["SWE"], ["FIN"], ["DNK"], ["ALD"]],
  "northern-europe": [["DEU"], ["POL"], ["NLD"], ["BEL"], ["LUX"], ["CZE"], ["SVK"], ["AUT"], ["CHE"], ["HUN"], ["LIE"]],
  "western-europe": [["FRA", box(-6, 41, 10, 52)], ["ESP", box(-10, 36, 5, 44)], ["PRT", box(-10, 36, -6, 43)], ["AND"], ["MCO"]],
  "southern-europe": [["ITA"], ["SMR"], ["VAT"], ["MLT"], ["SVN"], ["HRV"], ["BIH"], ["SRB"], ["MNE"], ["KOS"], ["ALB"], ["MKD"],
    ["GRC"], ["BGR"], ["ROU"]],
  ukraine: [["UKR"], ["BLR"], ["MDA"], ["EST"], ["LVA"], ["LTU"], ["RUS", box(19, 40, 56, 90)]],
  "north-africa": [["MAR"], ["SAH"], ["DZA"], ["TUN"], ["MRT"], ["MLI"], ["NER"], ["TCD"], ["SEN"], ["GMB"], ["GNB"], ["GIN"],
    ["SLE"], ["LBR"], ["CIV"], ["BFA"], ["GHA"], ["TGO"], ["BEN"], ["NGA"], ["ESP", box(-18, 27, -13, 30)]],
  egypt: [["EGY"], ["LBY"]],
  "east-africa": [["SDN"], ["SDS"], ["ETH"], ["ERI"], ["DJI"], ["SOM"], ["SOL"], ["KEN"], ["UGA"], ["TZA"], ["RWA"], ["BDI"]],
  congo: [["COD"], ["COG"], ["CAF"], ["GAB"], ["GNQ"], ["CMR"], ["AGO"]],
  "south-africa": [["ZAF"], ["NAM"], ["BWA"], ["ZWE"], ["MOZ"], ["LSO"], ["SWZ"], ["ZMB"], ["MWI"]],
  madagascar: [["MDG"]],
  ural: [["RUS", box(56, 40, 87.5, 90)]],
  siberia: [["RUS", box(87.5, 40, 100, 90)]],
  yakutsk: [["RUS", box(100, 60, 140, 90)]],
  // Cut short of Korea, so Kamchatka only meets Asia through Mongolia.
  kamchatka: [["RUS", box(140, 60, 180, 90)], ["RUS", box(116, 42.7, 180, 60)], ["RUS", box(-180, 60, -169, 90)]],
  irkutsk: [["RUS", box(100, 40, 116, 60)]],
  // Mongolia and Manchuria, reaching the sea as on the classic map.
  mongolia: [["MNG"], ["CHN", box(115, 40.5, 135, 54)]],
  japan: [["JPN"]],
  afghanistan: [["AFG"], ["KAZ"], ["TKM"], ["UZB"], ["TJK"], ["KGZ"]],
  china: [["CHN", box(73, 18, 115, 54)], ["CHN", box(115, 18, 125, 40.5)], ["TWN"], ["HKG"], ["MAC"], ["KOR"], ["PRK"]],
  "middle-east": [["TUR"], ["SYR"], ["LBN"], ["ISR"], ["PSX"], ["JOR"], ["IRQ"], ["SAU"], ["YEM"], ["OMN"], ["ARE"], ["QAT"],
    ["KWT"], ["BHR"], ["IRN"], ["CYP"], ["CYN"], ["GEO"], ["ARM"], ["AZE"]],
  india: [["IND"], ["PAK"], ["NPL"], ["BTN"], ["BGD"], ["LKA"]],
  siam: [["THA"], ["LAO"], ["KHM"], ["VNM"], ["MMR"], ["MYS", box(99, 0, 105, 8)], ["SGP"]],
  indonesia: [["IDN", box(94, -12, 130.5, 7)], ["MYS", box(108, 0, 120, 8)], ["BRN"], ["PHL"], ["TLS"]],
  "new-guinea": [["PNG"], ["IDN", box(130.5, -10, 142, 1)]],
  "western-australia": [["AUS", box(110, -45, 135, -9)]],
  "eastern-australia": [["AUS", box(135, -45, 155, -9)], ["NZL", box(165, -48, 179, -34)]],
};

const miller = (lat) => 1.25 * Math.log(Math.tan(Math.PI / 4 + (0.4 * lat * Math.PI) / 180));
const SCALE = MAP_WIDTH / (2 * Math.PI);
export const MAP_HEIGHT = (miller(NORTH) - miller(SOUTH)) * SCALE;

// [lon, lat] to [x, y] in cm, y down from the map's top edge. Land west of
// the map's edge wraps round to its east end, a whole polygon at a time, so
// an island across the edge stays in one piece.
function project([lon, lat], wrap) {
  return [((lon + (wrap ? 360 : 0) - WEST) * Math.PI) / 180 * SCALE, (miller(NORTH) - miller(lat)) * SCALE];
}

function projectPolygon(rings) {
  const wrap = middle(rings[0])[0] < WEST;
  return turf.polygon(rings.map((ring) => ring.map((point) => project(point, wrap))));
}

function polygonsOf(geometry) {
  return geometry.type === "Polygon" ? [geometry.coordinates] : geometry.coordinates;
}

// The parts of a country inside a box. Only its biggest piece of land is cut
// along the box's edges; islands go whole to the box their middle is in, so
// no island is split between territories.
function cut(feature, [west, south, east, north]) {
  const pieces = polygonsOf(feature.geometry);
  const biggest = pieces.reduce((a, b) => (planarArea(b[0]) > planarArea(a[0]) ? b : a));
  const inside = pieces.filter((rings) => {
    if (rings === biggest) return true;
    const [lon, lat] = middle(rings[0]);
    return lon >= west && lon <= east && lat >= south && lat <= north;
  });
  return inside.flatMap((rings) => {
    const area = rings === biggest ? [west, south, east, north] : [-180, -90, 180, 90];
    const [w, s, e, n] = [area[0], Math.max(area[1], SOUTH), area[2], Math.min(area[3], NORTH)];
    return polygonsOf(turf.bboxClip(turf.polygon(rings), [w, s, e, n]).geometry);
  }).filter((rings) => rings[0]?.length >= 4);
}

function middle(ring) {
  const xs = ring.map((p) => p[0]);
  const ys = ring.map((p) => p[1]);
  return [(Math.min(...xs) + Math.max(...xs)) / 2, (Math.min(...ys) + Math.max(...ys)) / 2];
}

const world = await (await fetch(SOURCE)).json();
const countries = new Map(world.features.map((feature) => [feature.properties.ADM0_A3, feature]));

const territories = {};
for (const [id, parts] of Object.entries(TERRITORIES)) {
  const polygons = [];
  for (const [code, area = ALL] of parts) {
    const country = countries.get(code);
    if (!country) throw new Error(`${id}: no country ${code}`);
    polygons.push(...cut(country, area));
  }
  // Projected first, so the merge and simplify work in centimeters.
  const projected = polygons.map(projectPolygon);
  const merged = projected.length > 1 ? turf.union(turf.featureCollection(projected)) : projected[0];
  const simple = turf.simplify(merged, { tolerance: TOLERANCE, highQuality: true });
  const kept = polygonsOf(simple.geometry).filter((rings) => planarArea(rings[0]) > MIN_AREA);
  // The spot armies go: the point deepest inside the biggest piece.
  const biggest = kept.reduce((a, b) => (planarArea(b[0]) > planarArea(a[0]) ? b : a));
  const spot = polylabel(biggest, 0.01);
  territories[id] = {
    path: kept.map((rings) => rings.map((ring) => `M${ring.slice(0, -1).map(([x, y]) => `${x.toFixed(2)} ${y.toFixed(2)}`).join("L")}Z`).join("")).join(""),
    spot: spot.map((v) => Number(v.toFixed(2))),
    room: Number(spot.distance.toFixed(2)),
  };
}

// Which territories share a border, to check the map against the rules.
const touching = [];
const ids = Object.keys(territories);
const features = {};
for (const id of ids) {
  const polygons = [];
  for (const [code, area = ALL] of TERRITORIES[id]) polygons.push(...cut(countries.get(code), area));
  features[id] = polygons.map(projectPolygon);
}
for (let i = 0; i < ids.length; i++) {
  for (let j = i + 1; j < ids.length; j++) {
    if (features[ids[i]].some((a) => features[ids[j]].some((b) => turf.booleanIntersects(a, b)))) touching.push([ids[i], ids[j]]);
  }
}
writeFileSync(OUT, `${JSON.stringify({ width: MAP_WIDTH, height: Number(MAP_HEIGHT.toFixed(2)), territories, touching })}\n`);
console.log(`Wrote ${OUT}`);

function planarArea(ring) {
  let sum = 0;
  for (let i = 0; i < ring.length - 1; i++) sum += ring[i][0] * ring[i + 1][1] - ring[i + 1][0] * ring[i][1];
  return Math.abs(sum) / 2;
}
