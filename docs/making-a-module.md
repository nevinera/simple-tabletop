# Making a module

This guide walks through building a game module from nothing, then covers common recipes, hosting, and what to
do when something goes wrong. [manifest-format.md](manifest-format.md) is the full reference for every field.

## What a module is

A module is a folder with a `manifest.json` and the images it uses:

```
my-game/
  manifest.json
  thumbnail.png        optional; nothing reads it, but it's handy for a listing
  assets/
    board.jpg
    cards.png          a sheet of card faces
    card-back.png
```

The manifest says how big the table is, what pieces exist, what they look like, and where they start. Players
do the rest by hand. There's no rules engine and no scripting, so a module can't enforce turns or score a game.
What it can do is make the physical parts easy to use: decks that shuffle and deal, bags that hand out tokens,
spots pieces snap to, dice that roll.

Paths in the manifest are relative to the manifest's own URL, so the folder can live on any static host.

## A first module

Start with the smallest manifest that loads: one table, one layer, one piece.

```json
{
  "formatVersion": 1,
  "id": "my-game",
  "name": "My Game",
  "version": "0.1.0",
  "table": { "size": [80, 60] },
  "layers": [{ "id": "pieces", "thickness": 0.03 }],
  "pieces": [
    { "id": "hero", "kind": "token", "shape": "circle", "size": [3], "face": "assets/hero.png", "position": [40, 30] }
  ]
}
```

Sizes and positions are in centimeters, measured from the table's near left corner, with y running away from
you. A real poker card is `[6.3, 8.8]`, so measure your physical components and copy the numbers.

### Try it

Put the folder somewhere your browser can fetch over HTTPS with CORS (see [Hosting](#hosting)), then open:

```
https://tabletop.nevinera.dev/sandbox?manifest=https://example.com/my-game/manifest.json
```

The sandbox is a table that lives only in your browser, so you can poke at a module without starting a game.
The home page does the same with "Try it alone" after you paste a manifest URL. If the manifest has a mistake,
the page says what and where, like `Piece "hero" needs a face image.`

### Add a board

Boards go on the `board` layer, under everything else. List the layers bottom first:

```json
"layers": [
  { "id": "board", "thickness": 0.2 },
  { "id": "pieces", "thickness": 0.03 }
],
"pieces": [
  { "id": "board", "kind": "board", "size": [50, 50], "face": "assets/board.jpg", "position": [40, 30], "fixed": true },
  { "id": "hero", "kind": "token", "shape": "circle", "size": [3], "face": "assets/hero.png", "position": [40, 30] }
]
```

`fixed` starts the board locked, so nobody knocks it around. Players can still unlock it from its menu.

### Use piece types for repeats

When many pieces share a size, back, or kind, put the shared fields in `pieceTypes` and have each piece name its
type. A piece can override anything its type sets.

```json
"pieceTypes": {
  "card": { "kind": "card", "size": [6.3, 8.8], "back": "assets/card-back.png" }
},
"pieces": [
  { "id": "fire", "type": "card", "face": "assets/fire.png" },
  { "id": "water", "type": "card", "face": "assets/water.png" }
]
```

Types also let containers say what they take (`"accepts": [{ "type": "card" }]`), and let tokens and tiles of
one type pile into stacks.

### Put cards in a deck

Pieces listed in a container don't need a `position`; they start inside it.

```json
"containers": [
  { "id": "deck", "kind": "deck", "position": [20, 30], "size": [6.3, 8.8], "members": ["fire", "water"] }
]
```

The first member is the top card. Decks start face down unless `faceUp` is true. Players shuffle, draw, deal,
search, and peek from the deck's menu.

### Use a sheet for big card sets

Fifty separate images load slowly. Put the faces in one grid image instead and point at cells by index, left to
right, then top to bottom, from 0:

```json
"sheets": { "cards": { "image": "assets/cards.png", "columns": 10, "rows": 7 } },
"pieces": [
  { "id": "fire", "type": "card", "face": { "sheet": "cards", "index": 0 } },
  { "id": "water", "type": "card", "face": { "sheet": "cards", "index": 1 } }
]
```

Every cell must be the same size. Leave any unused cells blank.

### Add seats and hands

Without `seats`, anyone can sit at any side, up to eight players. For a game with fixed colors or places, list
the seats:

```json
"hands": true,
"seats": [
  { "id": "red", "name": "Red", "side": "south", "color": "#c0392b" },
  { "id": "blue", "name": "Blue", "side": "north", "color": "#2e64b0" }
]
```

`hands: true` gives each seat a private hand tray just off its edge of the table. Players see their own cards
face up and everyone else's backs.

## Recipes

### A card game

A deck, a face-up discard pile, and hands:

```json
"hands": true,
"containers": [
  { "id": "deck", "kind": "deck", "position": [45, 35], "size": [6.3, 8.8], "members": ["..."] },
  { "id": "discard", "kind": "deck", "position": [55, 35], "size": [6.3, 8.8], "faceUp": true, "members": [] }
]
```

An empty deck stays on the table as an outline, so the discard pile has a home before anything's in it. Add
`"splay": "right"` to a deck to fan its cards out, like a market row or a tableau.

### A supply of tokens

An infinite bag hands out a fresh piece every time, and takes them back for good:

```json
"pieceTypes": {
  "coin": { "kind": "chip", "size": [2.5], "face": "assets/coin.png", "edge": "#c9a227" }
},
"containers": [
  { "id": "bank", "kind": "bag", "position": [70, 10], "size": [8, 8], "infinite": "coin", "text": "Coins", "fixed": true }
]
```

Chips of the same size pile into stacks that show a band per chip in its `edge` color. With many pieces in a
pile, `maxStackShown` decides how tall a stack draws before it shows a count instead.

### Spots on a board

Snap points make pieces land neatly on a grid, like the squares of a chessboard:

```json
"snaps": [
  { "radius": 2.75, "grid": { "origin": [12.75, 12.75], "step": [5.5, 5.5], "count": [8, 8] } }
]
```

`origin` is the first spot's center, `step` the distance between spots, and `radius` how close a piece has to
land to jump to one. Use `points` for spots that aren't on a grid, and `accepts` to snap only some pieces.

### Dice

Built-in dice need no images:

```json
"pieces": [
  { "id": "d1", "kind": "die", "die": "d6pips", "size": [1.6] },
  { "id": "d2", "kind": "die", "die": "d6pips", "size": [1.6] }
],
"containers": [
  { "id": "dice", "kind": "tray", "position": [70, 50], "size": [10, 10], "members": ["d1", "d2"] }
]
```

A tray rolls all its dice at once. Custom dice with their own face images go in `dieTypes`.

### Pits full of seeds

A bowl keeps its pieces in view and shows how many it holds, like a Mancala pit:

```json
{ "id": "pit-1", "kind": "bowl", "position": [20, 30], "size": [6], "fixed": true, "members": ["seed-1", "seed-2"] }
```

### Keeping score

- A **counter** is a labeled number players nudge up and down.
- A **score sheet** keeps every player's score round by round and shows the running totals.
- A **note** holds free text, like a reminder of a house rule.

An infinite bag of any of them lets players take as many as they need.

### Rulebooks

`documents` lists files players open from the Docs menu, like a rulebook PDF:

```json
"documents": [{ "name": "Rules", "url": "docs/rules.pdf" }]
```

## Images

- PNG, JPEG, WebP, and SVG all work. Use JPEG or WebP for photos and big boards, and PNG or SVG for crisp art.
- Keep each image at most 4096 pixels on its longest side. Phones refuse bigger textures.
- An SVG needs `width` and `height` attributes, not just a `viewBox`, or it draws at no size at all.
- A piece's image stretches to its `size`, so match the image's shape to the piece's.
- A piece's images load once it's out on the table, so a big module with hundreds of cards in decks and bags
  still starts quickly. Sheets help even more.

## Hosting

Any static host works, as long as it serves the manifest and every image over HTTPS with an
`Access-Control-Allow-Origin` header:

- **GitHub:** commit the folder and use the raw file URL, or turn on GitHub Pages. Both send the header.
- **S3 or similar:** add a CORS rule that allows GET from any origin.
- **Your own server:** add the header for the module's folder.

Simple Tabletop never copies a module. Every player's browser fetches it from your host, so it has to stay up
while people play. Anyone with the manifest URL can load the module, so a long random folder name is the only
privacy a module gets.

## Changing a module later

Players can save a table to a file and pick it up later at a new table, with whatever version of the module
the manifest URL serves then. A saved table matches pieces and containers by `id`:

- Keep ids stable. Renaming a piece's id drops it from saved tables.
- Removing a piece is fine: saved tables leave it out.
- Adding pieces is fine, but a table picked up from a save only has the pieces it was saved with.
- Bump `version` when you change things, so players can tell which one they have.

## When something's wrong

| You see | What it means |
|---|---|
| `Couldn't reach … Check the URL and that the host sends CORS headers.` | The manifest URL is wrong, the host is down, or it doesn't send `Access-Control-Allow-Origin`. |
| A message naming a piece or container | That entry breaks a rule in the reference. The message says which one and what's missing. |
| Pieces stay plain gray | Their images didn't load: a wrong path, a missing CORS header on the images, or an SVG without `width` and `height`. |
| A piece won't drop somewhere | It would overlap something that can't hold it up, like a pawn, or land off the table. Only flat things (cards, boards, tiles, chips, tokens, decks, and stacks) hold others up. |
| Pieces pile up in a heap at the start | Two pieces start in the same place. Pieces that overlap stack up in the order the manifest lists them. |

The built-in games are good examples. Their manifests are in `public/builtins/`, and the scripts that draw
their art and write their manifests are in `script/builtins/`.
