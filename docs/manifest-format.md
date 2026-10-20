# Manifest format

A game module is a JSON manifest plus the images it lists. Every asset path resolves relative to the manifest's
URL, so you can host a module anywhere that serves static files.

Modules are data only. They place pieces and describe how they look. They can't run code.

## Example

```json
{
  "formatVersion": 1,
  "id": "hearts",
  "name": "Hearts",
  "version": "1.0.0",
  "table": { "size": [100, 100], "color": "#2e6b3f" },
  "layers": [
    { "id": "board", "thickness": 0.05 },
    { "id": "pieces", "thickness": 0.03 }
  ],
  "sheets": {
    "cards": { "image": "assets/cards.png", "columns": 13, "rows": 4 }
  },
  "pieceTypes": {
    "card": {
      "kind": "card",
      "size": [6.3, 8.8],
      "back": "assets/card-back.png"
    }
  },
  "hands": true,
  "seats": [
    {
      "id": "south",
      "name": "South",
      "side": "south",
      "color": "#c0392b",
      "hand": { "position": [50, -8], "rotation": 0, "size": [40, 10] },
      "cameras": {
        "1": { "position": [50, 60, -10], "target": [50, 0, 40] }
      }
    }
  ],
  "pieces": [
    { "id": "AS", "type": "card", "categories": ["spades"], "face": { "sheet": "cards", "index": 0 } },
    { "id": "2S", "type": "card", "categories": ["spades"], "face": { "sheet": "cards", "index": 1 } }
  ],
  "containers": [
    {
      "id": "deck",
      "kind": "deck",
      "position": [50, 50],
      "rotation": 0,
      "fixed": true,
      "faceUp": false,
      "accepts": [{ "type": "card" }],
      "members": ["AS", "2S"]
    }
  ],
  "labels": [
    { "text": "Draw pile", "position": [50, 56], "fontSize": 1.5, "color": "#f5f0dc" }
  ]
}
```

## Coordinates and units

- The table is a flat plane. `position` is `[x, y]` on it. `[0, 0]` is the near left corner, x runs right, and
  y runs away from you.
- Units are centimeters, so real card and board sizes carry over.
- `rotation` is in degrees, clockwise when seen from above. At 0, the top of a piece points along +y.
- Manifests don't set height. Each layer sits on top of the layers below it, and every piece on a layer is
  that layer's thickness.

## Top-level fields

| field           | required | notes                                                    |
|-----------------|----------|----------------------------------------------------------|
| `formatVersion` | yes      | `1`                                                      |
| `id`            | yes      | short slug                                               |
| `name`          | yes      | shown to players                                         |
| `version`       | no       | free-form                                                |
| `table`         | yes      | see [Table](#table)                                      |
| `layers`        | yes      | see [Layers](#layers)                                    |
| `sheets`        | no       | image grids that many pieces share                       |
| `pieceTypes`    | no       | shared defaults that pieces inherit                      |
| `dieTypes`      | no       | custom dice; see [Dice](#dice)                           |
| `hands`         | no       | `true`, or `{ "passing": false }`; see [Hands](#hands)   |
| `maxSeats`      | no       | 1 to 8; defaults to 8, ignored when `seats` is given     |
| `seats`         | no       | see [Seats](#seats)                                      |
| `pieces`        | yes      | every piece in the game                                  |
| `containers`    | no       | decks, bags, bowls, and trays                            |
| `labels`        | no       | text drawn on the table; see [Labels](#labels)           |
| `documents`     | no       | rulebooks and other files to link to; see [Documents](#documents) |
| `snaps`         | no       | spots pieces jump to when dropped near them; see [Snaps](#snaps) |
| `maxStackShown` | no       | how many pieces tall a stack draws before showing a count, 2 to 20; defaults to 5 |

## Table

| field   | required | notes                                                       |
|---------|----------|-------------------------------------------------------------|
| `size`  | yes      | `[width, depth]`                                            |
| `color` | no       | hex; defaults to `#2e6b3f`, a green felt                    |
| `image` | no       | stretched across the whole table; replaces the felt texture |

## Layers

Layers stack bottom first. `board` and `pieces` are the only layer ids for now.

| field       | required | notes                                         |
|-------------|----------|-----------------------------------------------|
| `id`        | yes      | `board` or `pieces`                           |
| `thickness` | yes      | how thick every piece on this layer renders   |

Board-layer pieces render as solid slabs, and pieces sit on top of them.

## Images

An image field takes either a path or a sheet reference.

- **Path:** `"assets/board.jpg"`, resolved relative to the manifest.
- **Sheet reference:** `{ "sheet": "cards", "index": 12 }`. Indexes run left to right, then top to bottom,
  starting at 0.

Use sheets for big card sets. A browser loads one 52-card sheet far faster than 52 separate images.

Supported formats are PNG, JPEG, WebP, and SVG.

## Piece types

A piece type holds defaults. A piece that names a type gets every field the type sets, and can override any
of them.

## Pieces

| field      | required | notes                                                         |
|------------|----------|---------------------------------------------------------------|
| `id`       | yes      | unique within the manifest                                    |
| `type`     | no       | a key in `pieceTypes`                                         |
| `kind`     | yes*     | `card`, `board`, `tile`, `chip`, `token`, `die`, `standee`, `pawn`, or `counter`; see below |
| `layer`    | no       | defaults to `board` for boards and `pieces` for everything else |
| `shape`    | boards, tokens, pawns | `rect` or `circle`, or for pawns one of the [pawn shapes](#pawns) |
| `size`     | yes*     | `[width, depth]`, or for standees `[width, height]`; circles and dice use the first value only, and pawns take `[width]` or `[width, height]` |
| `thickness`| no       | in cm; tiles, chips, tokens, and standees default to 0.2, and cards and boards to their layer's thickness |
| `categories`| no      | list of strings; combined with the type's categories          |
| `die`      | dice     | a built-in die name, or a key in `dieTypes`                   |
| `face`     | yes*     | image for the up side; not used by dice or pawns              |
| `color`    | no       | hex; tints built-in dice, and colors pawns                    |
| `edge`     | no       | hex; the color of a flat piece's sides, and its band in a stack |
| `back`     | no       | image for the down side; defaults to `face`                   |
| `states`   | no       | cards only: the looks a card can switch between; see [Card states](#card-states) |
| `position` | no*      | required unless a container lists the piece                   |
| `rotation` | no       | defaults to 0                                                 |
| `faceUp`   | no       | defaults to true                                              |
| `value`    | no       | dice only: index of the starting face; defaults to 0          |
| `fixed`    | no       | starts locked; players can unlock it; defaults to false       |

\* Can come from the piece type.

Pieces can start resting on each other, like a token on a card. Overlapping pieces stack up in the order the
manifest lists them, on top of any decks and stacks under them. Only cards, boards, tiles, chips, tokens,
decks, and stacks hold others up.

### Kinds

A piece's kind decides what it does:

| kind  | shape          | groups into  | goes in hands | flips |
|-------|----------------|--------------|---------------|-------|
| card  | rect           | decks        | yes           | yes   |
| board | rect or circle |              | no            | no    |
| tile  | rect           | stacks       | yes           | yes   |
| chip  | circle         | stacks       | no            | yes   |
| token | circle or rect | stacks       | no            | yes   |
| die   | die            | trays        | no            | rolls |
| standee | rect         |              | no            | no    |
| pawn  | see [Pawns](#pawns) |       | no            | no    |
| counter | rect         |              | no            | no    |

A standee stands upright in a clear holder, its `face` toward the front and its `back` behind. Transparent
parts of its images are cut out. Its holder is what takes up room on the table. Turn it to face another way.

Bags take every kind but boards. A board usually also sets `"fixed": true`.

## Card states

A card can switch between looks, like a normal and an upgraded version. List them in `states`, at least two,
each with a `name` and the images it changes:

```json
"strike": {
  "kind": "card", "size": [6.3, 8.8], "back": "assets/back.png",
  "states": [
    { "name": "Normal", "face": "assets/strike.png" },
    { "name": "Upgraded", "face": "assets/strike-plus.png" }
  ]
}
```

- A state's `face` and `back` default to the card's own, and the card's `face` defaults to its first state's.
- Every card starts in its first state. Players pick a state from the card's menu, or press U for the next one.
- A card keeps its state wherever it goes, including into decks and hands. Players can change cards that are
  loose, in their own hand, or in a splayed deck.

## Dice

A die is a 3D solid with the right number of faces: a tetrahedron, cube, octahedron, pentagonal
trapezohedron, dodecahedron, or icosahedron. It sits still showing its current face. That face is bright and
the others are dimmed. A d4 has a point on top, so it shows the rolled number at the top corner of each of its
three upper faces, and those corners are bright.

These dice are built in, with numbered faces, so they need no images:

| die    | faces             |
|--------|-------------------|
| `d4`   | 1 to 4            |
| `d6`   | 1 to 6            |
| `d6pips` | 1 to 6, as pips |
| `d8`   | 1 to 8            |
| `d10`  | 1 to 10           |
| `d10z` | 0 to 9            |
| `d10t` | 00, 10, ... 90    |
| `d12`  | 1 to 12           |
| `d20`  | 1 to 20           |

A piece using one:

```json
{ "id": "red-die", "shape": "die", "die": "d6", "size": [1.6], "position": [20, 30] }
```

`size` is the die's width across its widest point. A d4 grows to 1.5 times its `size`, since a
tetrahedron looks small next to other dice of the same width. A die's optional `color` tints built-in
dice.

To roll several dice together, put them in a `tray` container.

To make a custom die, add an entry to `dieTypes`. Set the number of `sides` and list one image per face:

```json
"dieTypes": {
  "fate": {
    "sides": 6,
    "faces": [
      "assets/fate-plus.png", "assets/fate-plus.png",
      "assets/fate-blank.png", "assets/fate-blank.png",
      "assets/fate-minus.png", "assets/fate-minus.png"
    ]
  }
}
```

- `sides` must be 4, 6, 8, 10, 12, or 20. It picks the tile shape.
- `faces` must have exactly `sides` entries. Each entry is a path or a sheet reference.
- Custom die keys can't reuse the built-in names.
- A piece's optional `value` sets which face starts up, as an index into `faces`. It defaults to 0.
- On a custom d4, each face image fills one corner of a face, so a d4's `faces` lists four images, one per
  corner number.

## Pawns

A pawn is a solid playing piece the app draws in the pawn's `color`, so it needs no images. Pick a
`shape`:

| shape     | looks like                                         | height |
|-----------|----------------------------------------------------|--------|
| `classic` | a chess-style pawn: a base, a collar, a round head | 1.6 × width |
| `simple`  | a smooth bell with a round head, like Parcheesi    | 1.4 × width |
| `meeple`  | a flat cut-out person                              | 1 × width |
| `cone`    | a cone with a ball on top, like Sorry              | 1.5 × width |

```json
{ "id": "red-1", "kind": "pawn", "shape": "simple", "color": "#c0392b", "size": [1.8], "position": [20, 30] }
```

`size` is the pawn's width, and an optional second value sets its height instead of the shape's default.
`color` defaults to an off-white. A meeple is 0.4 times its width thick, or set `thickness`. A pawn covers
a circle its width across on the table, and a meeple covers its base.

Pawns don't flip. Turn one to face another way. Bags take pawns, so a pawn type in an infinite bag makes
a supply.

## Snaps

Snap points are spots that pieces jump to when dropped or dragged near them, like the middles of a chess
board's squares. `snaps` lists groups of them, each with a radius and, optionally, what it takes:

```json
"snaps": [
  { "radius": 2.75, "grid": { "origin": [12.75, 12.75], "step": [5.5, 5.5], "count": [8, 8] } },
  { "radius": 4, "accepts": [{ "kind": "card" }], "points": [[40, 60], [50, 60]] }
]
```

| field     | required | notes                                                                   |
|-----------|----------|-------------------------------------------------------------------------|
| `radius`  | yes      | how near, in cm, a piece has to be to snap                              |
| `points`  | yes*     | `[x, y]` spots                                                          |
| `grid`    | yes*     | instead of `points`: `origin` (the first spot), `step` between spots, and `count` of columns and rows |
| `accepts` | no       | `{ kind, type, category }` matchers, like a container's; without it, every piece snaps |

\* One or the other.

A piece snaps to the nearest point within its group's radius, among the groups that take it. When several
pieces move together, the one being dragged snaps and the rest keep their places around it.

## Counters

A counter keeps a labeled number, like a score or a pile of gold: a plaque in its `color` with its `label`
above its number. Players change it from its menu: add or take away 1, 5, 20, or 100, or type a new number or
label. A locked counter stays put but still counts.

```json
"score": { "kind": "counter", "size": [7, 3.5], "label": "Score", "color": "#f4efe0" }
```

- `label` is up to 12 characters, and defaults to none. `value` is a whole number, and defaults to 0.
- `color` defaults to an off-white. The writing comes out dark or light to suit it.
- An infinite bag of counters hands out as many score keepers as players need.

## Containers

| field      | required | notes                                                         |
|------------|----------|---------------------------------------------------------------|
| `id`       | yes      | unique among containers                                       |
| `kind`     | yes      | `deck`, `bag`, `bowl`, `tray`, or `stack`                     |
| `position` | yes      |                                                               |
| `rotation` | no       | defaults to 0                                                 |
| `size`     | decks, trays, bags | `[width, depth]`                                    |
| `layer`    | no       | defaults to `pieces`                                          |
| `image`    | no       | decks: shown on top instead of the top card; bags: shown in a circle on the lid |
| `text`     | no       | bags: up to 16 characters, printed on the lid                 |
| `color`    | no       | bags: the box's color                                         |
| `infinite` | no       | bags: a piece type the bag hands out without end              |
| `fixed`    | no       | starts locked; players can still take from it                 |
| `faceUp`   | no       | decks only: which way every card in it faces; defaults to false |
| `splay`    | no       | decks only: starts fanned out `left`, `right`, `away`, or `toward` |
| `splayDistance` | no  | decks only: cm between fanned cards; defaults to 2            |
| `accepts`  | no       | which pieces can be dropped in; see below                     |
| `members`  | no       | piece ids, top first                                          |

`accepts` is a list of matchers, each with a `type`, a `category`, or both. A piece fits if it matches any one
matcher, and a matcher with both fields needs both to match:

```json
"accepts": [
  { "type": "card", "category": "quests" },
  { "type": "token" }
]
```

Without `accepts`, decks take pieces of their members' type, trays take dice, and bags and bowls take anything.

### Kinds

- **deck:** an ordered stack. Players draw from the top, one at a time or several into their hand, and can
  shuffle it. They can also look at the top few cards, or the whole deck, by themselves, and put them back in
  a new order, or search it for a particular card to take out. With hands on, players can deal from it: a
  number of cards to every seated player, one at a time clockwise from the dealer's left. It starts 0.8cm tall and grows toward
  4.8cm as cards go in, showing its `image` or else the top card. An empty deck stays on the table
  as an outlined placeholder. Dropping a card on a loose card of the same type and size makes a new deck.
  Dropping a deck on a deck that takes its cards stacks them all on top, like shuffling a discard pile back in.
- **splayed deck:** a deck with its cards fanned out, each `splayDistance` past the one under it. The bottom
  card stays at the deck's position, and the fan runs in the `splay` direction, turned with the deck: `away` runs
  from its near edge toward its far edge. Players can splay, close, and respace a deck from its menu, and pull
  any card out of the fan.
- **bag:** a box with a fixed height. Drawing takes a random member, which keeps the way it faced. Players can
  also search a bag and take out a particular piece. Holding Alt
  over a bag lists what's inside. Bags take any piece, dice included, but never another container.
- **infinite bag:** a bag with `infinite` set to a piece type. Every draw makes a new piece of that type, and a
  piece of that type dropped back in is gone for good. It takes nothing else, and it can't list `members`.
- **stack:** tiles, chips, or tokens piled up. Chips of the same size pile together whatever is on them, like
  poker chips; tiles and tokens only pile with ones just like them. It needs at least two `members`, top first,
  and takes its size and look from them. Pieces are alike when they share a piece type, or, without one, the
  same kind, shape, size, and images. Its side shows a band per piece in that piece's `edge` color. A stack grows one piece taller per piece up to `maxStackShown` (five unless the module says), then shows a count
  on top instead. Players draw from the top, and a stack down to one piece turns back into that piece.
  Dropping a piece on a loose one just like it makes a new stack.
- **bowl:** contents sit visible in a pile. Players pick any member.
- **tray:** dice only. Dice sit at random spots inside it, never overlapping, and can fill at most an eighth
  of its area. Rolling the tray rolls them all and scatters them to new spots.

A piece belongs to at most one container, and containers never go inside each other. Ids can't contain `#`,
since pieces drawn from infinite bags use it. Hands are containers too, but each seat creates its own, so the
manifest doesn't list them.

## Documents

Rulebooks, reference sheets, and other files that go with the game. The table doesn't show them itself: a
Docs menu in the toolbar links to each one, and it opens in a new tab.

```json
"documents": [
  { "name": "Rulebook", "url": "docs/rulebook.pdf" },
  { "name": "FAQ", "url": "https://example.com/game-faq" }
]
```

A `url` resolves relative to the manifest, like images, and must be http or https.

## Labels

Labels are text drawn flat on the table, for naming boards, regions, and piles. Players can't edit them.

| field      | required | notes                                         |
|------------|----------|-----------------------------------------------|
| `text`     | yes      | `\n` starts a new line                        |
| `position` | yes      | center of the text                            |
| `rotation` | no       | defaults to 0                                 |
| `fontSize` | no       | letter height in centimeters; defaults to 1   |
| `color`    | no       | hex; defaults to `#ffffff`                    |
| `layer`    | no       | the label sits on top of it; defaults to the bottom layer |

## Seats

Players pick a seat when they join, and can't touch the table without one.

Without `seats`, the table seats up to `maxSeats` players. It starts with one seat per side: south, north,
east, and west. When a fifth player joins, each side splits in two, and it stays split even if players leave.
A player who was seated keeps the left half of their side, as they see it.

| field     | required | notes                                                            |
|-----------|----------|------------------------------------------------------------------|
| `id`      | yes      |                                                                  |
| `name`    | yes      |                                                                  |
| `side`    | yes      | `south`, `north`, `east`, or `west`, or half of one: `south-left` and so on |
| `color`   | no       | hex                                                              |
| `hand`    | no       | `position`, `rotation`, and `size` of the hand tray              |
| `cameras` | no       | starting camera slots, keyed `"0"` to `"9"`                      |

South is the near edge (y = 0). Left and right are as seen by the player sitting on that side.

A camera is a `position` and a `target`, each `[x, height, y]` in table units. Players' own saved slots replace
these. A slot with no camera starts at a view of the whole table from the seat's side.

## Hands

With `hands` on, each seat has a hand tray on the table. Its cards spread out across the tray, face-up for the
seat's player and face-down for everyone else. Without a `hand` placement, the tray sits just off the table
edge on the seat's side, facing the player.

Dropping a card on a tray puts it in that hand, between the cards on either side of where it lands. Players can
drop cards into each other's hands unless `hands` is `{ "passing": false }`.

Piece and container ids can't start with `hand-`, which hands use.

## Hosting

Any static host works: a GitHub repository, GitHub Pages, S3, or your own server.

- The host must send `Access-Control-Allow-Origin` for the manifest and every image, or browsers will refuse to
  use them. GitHub's raw file host and GitHub Pages already do. S3 needs a CORS rule.
- Use HTTPS.
- Assets only need to stay up while people are playing. Simple Tabletop never copies them.
