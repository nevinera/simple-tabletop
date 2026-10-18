# Architecture

Simple Tabletop is a shared virtual table for groups who already play together. It has no physics, no rules
engine, and no matchmaking. A game module describes the pieces and where they start. Players move them around
by hand, like a real board game.

## Goals

- Play any game a group owns, including private, unpublished implementations of commercial games.
- Keep the server out of the content business. The server never fetches, stores, proxies, or caches module
  assets. Browsers load them straight from the module's host.
- Persist every change, so a game survives refreshes, disconnects, and server restarts.
- Trust the players. Clients see all state, including hidden cards. Hiding happens only at render time.

## Non-goals

- Rules enforcement, turn order, or scoring.
- Scripted modules. Modules are data only.
- Finding players or public lobbies.
- Stopping cheaters. A forked client can read every hand.

## Components

### Rails app

- Creates games and invite links.
- Tracks players and their seats.
- Stores the current state of every piece and container.
- Hands out held claims on pieces and releases them.
- Relays changes to every connected client over Action Cable.

The server never reads the manifest. It stores state keyed by the ids the manifest assigns, and it doesn't know
what a card looks like or how big a board is.

### Client

- React for the surrounding UI (seats, player list, menus).
- Three.js for the table.
- Vite builds it.

Each client fetches the manifest and its assets on its own.

## Joining a game

1. The host pastes a manifest URL, or picks a published module.
2. The host's browser fetches the manifest and posts the starting state (every piece's position, orientation,
   and container) to the server. This is the only time a client sends a full state.
3. The server creates the game and returns an invite link.
4. A player opens the link and picks a name. The server sets a cookie that ties the browser to that player,
   so a refresh or reconnect lands them back in the same seat.
5. The player claims an empty seat. Nobody can touch the table without a seat.

There are no accounts for now.

## Data model

### `games`

| column          | notes                                        |
|-----------------|----------------------------------------------|
| `invite_token`  | random, unique, used in the invite link      |
| `manifest_url`  | absolute URL; clients resolve assets from it |
| `name`          |                                              |
| `sequence`      | bumped on every change; see [Sync](#sync)    |
| `seating`       | `four` or `eight`; see [Hands](#hands)       |

### `players`

| column         | notes                                    |
|----------------|------------------------------------------|
| `game_id`      |                                          |
| `name`         |                                          |
| `cookie_token` | random; matches the player's cookie      |
| `seat_key`     | seat id, or null until they pick one     |
| `host`         | boolean                                  |

### `pieces`

One row per piece the manifest defines, including fixed board pieces.

| column           | notes                                                         |
|------------------|---------------------------------------------------------------|
| `game_id`        |                                                               |
| `key`            | manifest piece id, unique within the game                     |
| `x`, `y`         | table position; ignored while the piece is in a container     |
| `rotation`       | degrees around the vertical axis                              |
| `face_up`        | boolean                                                       |
| `value`          | dice only: index of the face showing up                       |
| `stack_order`    | draw order among loose pieces on the same layer               |
| `container_id`   | null when the piece sits loose on the table                   |
| `held_by_id`     | player holding it, or null                                    |
| `locked`         | boolean; starts as the manifest's `fixed`                     |

### `containers`

Decks, bags, bowls, and hands.

| column         | notes                                                         |
|----------------|---------------------------------------------------------------|
| `game_id`      |                                                               |
| `key`          | manifest container id                                         |
| `x`, `y`       | table position; hands ignore these and follow their seat       |
| `rotation`     |                                                               |
| `face_up`      | decks: which way every card in the deck faces                 |
| `spots`        | trays: JSON map of die key to `[x, y]` within the tray        |
| `spawned`      | infinite bags: how many pieces the bag has handed out         |
| `splay`        | decks: `left`, `right`, `away`, `toward`, or null when closed |
| `splay_distance` | decks: a player's spacing for the fan in cm, or null for the deck's own |
| `member_keys`  | ordered JSON array of piece keys; index 0 is the top          |
| `held_by_id`   |                                                               |
| `locked`       | boolean; starts as the manifest's `fixed`                     |
| `spec`         | JSON for containers made during play: decks have `kind`, `size`, `layer`, `accepts`; stacks have `kind: "stack"` |

A piece inside a container has no position of its own. The container's `member_keys` holds the order, so
shuffling a 500-card deck rewrites one row. Moving a piece in or out of a container updates the piece row and
the container row in one transaction.

Players can lock and unlock pieces and containers on any layer. Clients refuse to pick up locked things. The
server doesn't check, because clients are trusted.

A piece drawn from an infinite bag gets a new piece row keyed `<bag key>#<n>`, where `n` is the bag's `spawned`
count after the draw. Dropping it back in deletes the row.

Dropping a tile, chip, or token on a loose one just like it makes a stack keyed `#stack-<sequence>`, using the
game's `sequence` before the drop. A stack drawn down to one piece is deleted, and that piece goes back on the
table where the stack was.

Dropping a card on a loose card of the same type and size makes a deck keyed `#deck-<sequence>`, facing the
way the card underneath did. A player can also turn a loose card into a deck. The client picks the new container's key and sends its `spec`,
since the manifest doesn't list it.

## Held pieces

A piece or container can only move while one player holds it.

- **Grab:** the client asks to hold a piece. The server grants it if nobody else holds it.
- **Drag:** the client broadcasts positions as the pointer moves, throttled to about 20 per second. The server
  relays them and doesn't save them.
- **Drop:** the client sends the final state. The server saves it and releases the hold.
- **Disconnect:** the server releases everything the player held when their cable connection closes.
- **No timeouts:** a hold lasts as long as the player wants, since selecting a piece holds it. A cable heartbeat
  catches dead connections, which then release like any other disconnect.
- **Containers:** holding a container holds everything in it. Nobody else can take, add, shuffle, or roll its
  members until it's released.

There's no free-form multi-select. To move or roll several things together, put them in a container.

## Sync

- On subscribe, the client gets a full snapshot of every piece and container, plus the game's `sequence`.
- Every saved change bumps `sequence` and broadcasts a delta carrying the new value.
- A client that sees a gap in `sequence` throws away its state and asks for a new snapshot.
- Drag positions aren't saved, so they don't carry a sequence number.

### Client to server

| message   | effect                                                         |
|-----------|----------------------------------------------------------------|
| `grab`    | claim a piece or container                                     |
| `drag`    | relay an in-progress position; not saved                       |
| `drop`    | save position, rotation, facing, or container; release         |
| `flip`    | toggle `face_up`                                               |
| `rotate`   | turn a piece or container by some degrees, clockwise when positive |
| `lock`     | toggle `locked`                                                |
| `shuffle`  | replace a container's `member_keys` with a new order            |
| `roll`     | set new `value`s for one die or every die in a tray, and new `spots` in a tray |
| `draw`     | take a deck's top card, a bag's `pick`, or a new piece from an infinite bag; the drawing player holds it, or with `toHand` it goes in their hand |
| `makeDeck` | turn a loose card into a new deck holding just that card        |
| `splay`    | fan a deck's cards out in a `direction`, or close it with null, and set its `distance` |
| `release`  | let go without changing anything                               |

`flip`, `rotate`, and `lock` also work on things nobody holds, so players can act on what they're pointing at.
Nobody can act on something someone else holds. Locked things can't move, flip, or rotate, but a locked deck can
still be drawn from and shuffled. Flipping a deck turns it over: `face_up` toggles and `member_keys` reverses,
so the bottom card comes out on top.

Objects on the same layer can't overlap. A drop, rotation, or splay that would overlap something is refused,
except that a piece dropped with its center over a container that accepts it goes in. A splayed deck's
footprint is its whole fan.

Players can pull any card out of a splayed deck nobody else holds, the way they take cards from their hand. A
card pulled out faces the way the deck does. A locked deck can still splay.

The client that shuffles picks the order, the client that rolls picks the result, and the client that draws
from a bag picks the member. Clients are trusted, so
the server doesn't need to.

## Dice

Dice are built in: d4, d6, d8, d10, d10z, d10t, d12, and d20, each with numbered faces. A module can add its own
die types by mapping an image to each face. Dice are 3D solids that sit still with their current face up,
bright, and the other faces dimmed. There's no rolling or tumbling. While a roll lands, a fuzzy swirling sphere
stands in for the die for a second.

A tray is a container that holds dice at random spots inside it, never overlapping. Dice can fill at most an
eighth of its area. Rolling a tray rolls every die in it at once and scatters them to new spots, which is how
players roll a handful of dice together. A single die can also be rolled, loose or in a tray. Anyone can take a
die out of a tray nobody holds.

X rolls the die you point at or hold. Shift+X rolls the whole tray you point at, so a slightly off aim can't
roll a tray's worth of dice by accident.

## Hands

With hands on, each seat has a hand: a container keyed `hand-<seat id>` that renders as a tray in front of that
seat. Its position comes from the seat, not from the row. Cards in your hand render face-up for you and
face-down for everyone else. You can drag your own hand's cards to reorder them or play them, but not anyone
else's.

When the module lists no seats, seat ids are the eight half-sides (`south-left` and so on). With `seating` at
`four`, only the left halves are open, and each one stands for its whole side. The game switches to `eight`
for good when a fifth player joins.

On screen, a strip along the bottom shows your hand too, and you can drag cards to and from it.

## Magnify

Holding Alt shows the card under the pointer, or the one you hold, enlarged. On touch, a toggle on the action
bar makes taps magnify instead of select, and the tap-and-hold menu has a Magnify item. Magnify shows the side
you're allowed to see.

## Rendering

- Perspective camera with orbit, pan, and zoom. Nothing locks it to top-down.
- Number keys jump to saved camera slots. Shift plus a number saves the current view to that slot.
- Slots live in localStorage, keyed by game. The manifest can ship starting slots per seat.
- Layers draw in order: board, then pieces.
- A deck or other stacked container draws as one mesh, not one per card.
- Loose pieces that share a texture use instanced meshes, so a table with hundreds of loose pieces stays fast.

## Stack

- Rails 8 with SQLite and Solid Cable.
- Vite, React, and Three.js on the client.

SQLite allows one writer at a time. Games have a handful of players and save only on drop, so that's plenty.

## Security

- The server never fetches a manifest URL, so it can't be pointed at internal addresses.
- Manifests are data. The client never renders manifest strings as HTML.
- Asset hosts must send CORS headers, or WebGL won't load the textures. See
  [manifest-format.md](manifest-format.md#hosting).
