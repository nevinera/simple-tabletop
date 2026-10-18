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
    { "id": "board", "thickness": 0.3 },
    { "id": "pieces", "thickness": 0.03 }
  ],
  "sheets": {
    "cards": { "image": "assets/cards.png", "columns": 13, "rows": 4 }
  },
  "pieceTypes": {
    "card": {
      "shape": "rect",
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
| `layer`    | no       | defaults to `pieces`                                          |
| `shape`    | yes*     | `rect`, `circle`, or `die`                                    |
| `size`     | yes*     | `[width, depth]`; circles and dice use the first value only   |
| `categories`| no      | list of strings; combined with the type's categories          |
| `die`      | dice     | a built-in die name, or a key in `dieTypes`                   |
| `face`     | yes*     | image for the up side; not used by dice                       |
| `back`     | no       | image for the down side; defaults to `face`                   |
| `position` | no*      | required unless a container lists the piece                   |
| `rotation` | no       | defaults to 0                                                 |
| `faceUp`   | no       | defaults to true                                              |
| `value`    | no       | dice only: index of the starting face; defaults to 0          |
| `fixed`    | no       | starts locked; players can unlock it; defaults to false       |

\* Can come from the piece type.

A board is just a big piece on the `board` layer with `"fixed": true`.

## Dice

A die is a flat tile that shows its current face, cut to the shape of that die's face:

| sides | tile shape |
|-------|------------|
| 4     | triangle   |
| 6     | square     |
| 8     | triangle   |
| 10    | kite       |
| 12    | pentagon   |
| 20    | triangle   |

These dice are built in, with numbered faces, so they need no images:

| die    | faces             |
|--------|-------------------|
| `d4`   | 1 to 4            |
| `d6`   | 1 to 6            |
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

## Containers

| field      | required | notes                                                         |
|------------|----------|---------------------------------------------------------------|
| `id`       | yes      | unique among containers                                       |
| `kind`     | yes      | `deck`, `bag`, `bowl`, or `tray`                              |
| `position` | yes      |                                                               |
| `rotation` | no       | defaults to 0                                                 |
| `size`     | decks    | `[width, depth]`                                              |
| `layer`    | no       | defaults to `pieces`                                          |
| `image`    | no       | decks: shown on top instead of the top card                   |
| `fixed`    | no       | starts locked; players can still take from it                 |
| `faceUp`   | no       | decks only: which way every card in it faces; defaults to false |
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

- **deck:** an ordered stack. Players draw from the top and can shuffle it. It starts twice as tall as the board
  layer and grows toward six times that as cards go in, showing its `image` or else the top card. An empty deck stays on the table
  as an outlined placeholder.
- **bag:** players can't see inside. Drawing takes a random member.
- **bowl:** contents sit visible in a pile. Players pick any member.
- **tray:** dice only. Dice sit side by side with their current faces showing. Rolling the tray rolls them all.

A piece belongs to at most one container. Hands are containers too, but each seat creates its own, so the
manifest doesn't list them.

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
