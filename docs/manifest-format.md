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
  "table": { "size": [100, 100], "image": "assets/felt.jpg" },
  "layers": ["board", "pieces"],
  "sheets": {
    "cards": { "image": "assets/cards.png", "columns": 13, "rows": 4 }
  },
  "pieceTypes": {
    "card": {
      "shape": "rect",
      "size": [6.3, 8.8],
      "thickness": 0.03,
      "back": "assets/card-back.png"
    }
  },
  "seats": [
    {
      "id": "south",
      "name": "South",
      "color": "#c0392b",
      "hand": { "position": [50, 8], "rotation": 0, "size": [40, 10] },
      "cameras": {
        "1": { "position": [50, 60, -10], "target": [50, 0, 40] }
      }
    }
  ],
  "pieces": [
    { "id": "AS", "type": "card", "face": { "sheet": "cards", "index": 0 } },
    { "id": "2S", "type": "card", "face": { "sheet": "cards", "index": 1 } }
  ],
  "containers": [
    {
      "id": "deck",
      "kind": "deck",
      "position": [50, 50],
      "rotation": 0,
      "fixed": true,
      "faceUp": false,
      "members": ["AS", "2S"]
    }
  ]
}
```

## Coordinates and units

- The table is a flat plane. `position` is `[x, y]` on it, with `[0, 0]` at one corner.
- Units are centimeters, so real card and board sizes carry over.
- `rotation` is in degrees, clockwise when seen from above. 0 points along +y.
- Clients work out height from the layer and the stacking order. Manifests don't set it.

## Top-level fields

| field           | required | notes                                                    |
|-----------------|----------|----------------------------------------------------------|
| `formatVersion` | yes      | `1`                                                      |
| `id`            | yes      | short slug                                               |
| `name`          | yes      | shown to players                                         |
| `version`       | no       | free-form                                                |
| `table`         | yes      | `size` as `[width, depth]`, optional `image`             |
| `layers`        | yes      | draw order, bottom first; `board` and `pieces` for now   |
| `sheets`        | no       | image grids that many pieces share                       |
| `pieceTypes`    | no       | shared defaults that pieces inherit                      |
| `dieTypes`      | no       | custom dice; see [Dice](#dice)                           |
| `seats`         | yes      | at least one                                             |
| `pieces`        | yes      | every piece in the game                                  |
| `containers`    | no       | decks, bags, and bowls                                   |

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
| `thickness`| no       | defaults to 0.1                                               |
| `die`      | dice     | a built-in die name, or a key in `dieTypes`                   |
| `face`     | yes*     | image for the up side; not used by dice                       |
| `back`     | no       | image for the down side; defaults to `face`                   |
| `position` | no*      | required unless a container lists the piece                   |
| `rotation` | no       | defaults to 0                                                 |
| `faceUp`   | no       | defaults to true                                              |
| `value`    | no       | dice only: index of the starting face; defaults to 0          |
| `fixed`    | no       | players can't move it; defaults to false                      |

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
| `fixed`    | no       | the container stays put; players can still take from it       |
| `faceUp`   | no       | decks only; defaults to false                                 |
| `members`  | no       | piece ids, top first                                          |

### Kinds

- **deck:** an ordered stack. Players draw from the top and can shuffle it.
- **bag:** players can't see inside. Drawing takes a random member.
- **bowl:** contents sit visible in a pile. Players pick any member.
- **tray:** dice only. Dice sit side by side with their current faces showing. Rolling the tray rolls them all.

A piece belongs to at most one container. Hands are containers too, but each seat creates its own, so the
manifest doesn't list them.

## Seats

| field     | required | notes                                                            |
|-----------|----------|------------------------------------------------------------------|
| `id`      | yes      |                                                                  |
| `name`    | yes      |                                                                  |
| `color`   | no       | hex                                                              |
| `hand`    | no       | `position`, `rotation`, and `size` of the hand zone              |
| `cameras` | no       | starting camera slots, keyed `"1"` to `"9"`                      |

A camera is a `position` and a `target`, each `[x, height, y]` in table units. Players' own saved slots replace
these.

## Hosting

Any static host works: a GitHub repository, GitHub Pages, S3, or your own server.

- The host must send `Access-Control-Allow-Origin` for the manifest and every image, or browsers will refuse to
  use them. GitHub's raw file host and GitHub Pages already do. S3 needs a CORS rule.
- Use HTTPS.
- Assets only need to stay up while people are playing. Simple Tabletop never copies them.
