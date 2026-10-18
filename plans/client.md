# Client plan

Build the table client on its own first, with state held in the browser. Server sync comes after, by swapping
where state actions go.

## Controls

### Pointer (mouse and touch)

#### Selecting and placing

Clicking or tapping a movable piece selects it: it lifts slightly, you hold it, and a shadow shows where it
will land. While it's selected you can flip, rotate, or drag it. Placing it sets it down and deselects it.
There are three ways to place a piece:

- **Drag and release:** press on the piece, drag, and release. This works with or without selecting first.
- **Desktop:** click an open spot on the table.
- **Touch:** tap and hold an open spot on the table.

On touch, a plain tap on open table cancels: the piece goes back where it was and deselects. On either
pointer, selecting a different piece puts the first one back.

#### Other gestures

| gesture                                        | effect                                                     |
|------------------------------------------------|------------------------------------------------------------|
| drag a movable deck                            | move the deck                                              |
| drag a locked deck                             | draw the top card and move it                              |
| drag a locked bag                              | draw a random piece and move it                            |
| drag a locked stack                            | take the top piece and move it                             |
| drop a tile, chip, or token on one just like it | make a stack of the two                                   |
| drag empty table or a locked piece             | orbit the camera                                           |
| right-drag, or two-finger drag                 | pan                                                        |
| wheel, or pinch                                | zoom                                                       |
| right-click, or tap and hold                   | context menu: at the cursor, or in a popover on touch      |
| double-click or double-tap a deck              | draw the top card into your hand                           |
| drop onto a container that accepts the piece   | add it                                                     |

A right-click that moves more than a few pixels counts as a pan, not a menu.

Touch gestures for flipping and rotating: TBD.

### Keys

Keys check the physical key (`event.code`), and are ignored while focus is in one of the app's own inputs.

| key                    | effect                                       |
|------------------------|----------------------------------------------|
| W A S D                | pan                                          |
| Q / E                  | turn left / right                            |
| `-` / `=`              | zoom out / in                                |
| `_` / `+`              | tilt toward the horizon / toward top-down    |
| 0-9                    | jump to that camera point                    |
| Shift+0-9              | save the current view to that camera point   |
| F                      | flip the selected or hovered piece           |
| R / T                  | rotate it 45° counterclockwise / clockwise   |
| Shift+R / Shift+T      | rotate it 22.5°                              |
| G                      | draw from the hovered deck or bag, to place  |
| Shift+G                | draw from the hovered deck or bag into your hand |
| L                      | lock or unlock the selected or hovered thing |
| hold Alt               | magnify the hovered or selected card         |
| X                      | roll the hovered or selected die             |
| Shift+X                | roll every die in the hovered tray           |

Camera keys work while holding a piece. Every camera point starts at the starting view.

## Layouts

Three layouts, picked the way Delve does it (copy `useViewportMode.js`, including `?forceViewport=`):

| layout           | toolbar   | action bar                         |
|------------------|-----------|------------------------------------|
| desktop          | top       | bottom; off until Options turns it on |
| mobile portrait  | top       | bottom                             |
| mobile landscape | left side | right side                         |

### Toolbar

Menus for taking or leaving a seat, options, toggling your hand, and help.

### Action bar

Small buttons that each expand a menu:

- Camera points: jump to and save.
- Flip and rotate the selected piece.
- Zoom in and out.
- Toggle joysticks.

### Joysticks

Two overlays: the left one pans, the right one controls the camera. Hidden by default. The action bar toggles
them, and they hide again after 10 seconds without use. Copy Delve's `Joystick.jsx` (nipplejs).

## Manifest changes

Update docs/manifest-format.md before building on them.

- `layers` become objects with a thickness. The board layer renders as solid slabs that thick. Pieces sit on
  top of the boards, at their layer's thickness. Per-piece `thickness` goes away.
  ```json
  "layers": [
    { "id": "board", "thickness": 0.3 },
    { "id": "pieces", "thickness": 0.03 }
  ]
  ```
- Pieces and piece types get `categories`. A piece's categories combine its own with its type's.
- Containers get `accepts`, a list of `{ type, category }` matchers. A piece fits if it matches any one, and a
  matcher with both fields needs both. Without `accepts`, decks take their starting members' type, trays take
  dice, and bags and bowls take anything.
- New top-level `labels`: text, position, rotation, font size, color, and layer. Rendered only, never edited
  during play.
- An empty deck stays visible as an outlined placeholder.

## Milestones

1. **Look around a table.** The four aces on a green table, in all three layouts with the toolbar and action
   bar. Full camera control by pointer, keys, and joysticks, plus camera points. Board slabs and labels render.
   Nothing moves yet.
2. **Local state store.** One module holds piece and container state and takes the actions the server will
   take later: `grab`, `drag`, `drop`, `release`, `flip`, `rotate`. The scene renders from it.
3. **Select and move pieces.** Select, then drag or place, with the lift and landing shadow. Fixed pieces
   can't be selected. A placed piece lands on top, and draw order breaks ties between overlapping pieces.
4. **Flip and rotate.** Keys on selected and hovered pieces, the action bar, and the context menu.
5. **Containers.** Decks as one stack, drawing by drag, G, and the menu, adding by drop with `accepts`,
   shuffling, empty placeholders, locking, and making a deck from a card.
6. **Hands.** Picking a seat when you join, generated seats that split from four to eight, hand trays on the
   table, the hand strip on screen, dropping into hands with ordering, Shift+G, and magnify (Alt, or the
   touch toggle and menu item). Without a server, one browser is one player.
7. **Dice and trays.** 3D dice with the top face bright and the rest dimmed, a swirling sphere while a roll
   lands, trays with random non-overlapping spots capped at an eighth of their area, X and Shift+X.
8. **Bags.** Boxes with a color, side text, and a circled lid image. Drawing a random piece by drag, G, and
   the menu, adding by drop, Alt to list what's inside, and infinite bags that make and delete pieces.
   Bowls come later.
9. **Piece kinds and stacks.** Every piece has a kind (card, board, tile, chip, token, die) that decides its
   shape, thickness, and where it can go. Tiles, chips, and tokens that are alike stack, up to five tall, then
   show a count.
10. **Standees.** Upright cut-out figures in clear holders, as thick as tiles. The holder is the footprint, and
    turning replaces flipping.
11. **Splay.** Cards dropped on cards like them make decks. Decks fan out left, right, away, or toward, by a
    spacing from the module or the player, and any card in the fan can be pulled out. Reorder shows a deck's
    faces in a list to drag into order.
