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
5. The player claims an empty seat, or watches without one.

There are no accounts for now.

## Data model

### `games`

| column          | notes                                        |
|-----------------|----------------------------------------------|
| `invite_token`  | random, unique, used in the invite link      |
| `manifest_url`  | absolute URL; clients resolve assets from it |
| `name`          |                                              |
| `sequence`      | bumped on every change; see [Sync](#sync)    |

### `players`

| column         | notes                                    |
|----------------|------------------------------------------|
| `game_id`      |                                          |
| `name`         |                                          |
| `cookie_token` | random; matches the player's cookie      |
| `seat_key`     | manifest seat id, or null when watching  |
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
| `held_at`        | when the claim started or last moved                          |

### `containers`

Decks, bags, bowls, and hands.

| column         | notes                                                         |
|----------------|---------------------------------------------------------------|
| `game_id`      |                                                               |
| `key`          | manifest container id                                         |
| `x`, `y`       | table position; hands ignore these and follow their seat       |
| `rotation`     |                                                               |
| `member_keys`  | ordered JSON array of piece keys; index 0 is the top          |
| `held_by_id`   |                                                               |
| `held_at`      |                                                               |

A piece inside a container has no position of its own. The container's `member_keys` holds the order, so
shuffling a 500-card deck rewrites one row. Moving a piece in or out of a container updates the piece row and
the container row in one transaction.

`fixed` lives only in the manifest. Clients refuse to pick up fixed pieces. The server doesn't check, because
clients are trusted.

## Held pieces

A piece or container can only move while one player holds it.

- **Grab:** the client asks to hold a piece. The server grants it if nobody else holds it.
- **Drag:** the client broadcasts positions as the pointer moves, throttled to about 20 per second. The server
  relays them and doesn't save them.
- **Drop:** the client sends the final state. The server saves it and releases the hold.
- **Disconnect:** the server releases everything the player held when their cable connection closes.
- **Stale holds:** the server releases a hold with no movement for 30 seconds, in case a disconnect slipped
  through.
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
| `shuffle` | replace a container's `member_keys` with a new order            |
| `roll`    | set new `value`s for one die or every die in a tray             |
| `draw`    | move the top member of a container to the table or another one |
| `release` | let go without changing anything                               |

The client that shuffles picks the order, and the client that rolls picks the result. Clients are trusted, so
the server doesn't need to.

## Dice

Dice are built in: d4, d6, d8, d10, d10z, d10t, d12, and d20, each with numbered faces. A module can add its own
die types by mapping an image to each face. Dice are flat tiles that show their current face, cut to the shape
of that die's face: a triangle for a d4, d8, or d20, a square for a d6, a kite for a d10, and a pentagon for a
d12. There are no 3D dice and no physics.

A tray is a container that lays its dice out side by side. Rolling a tray rolls every die in it at once, which
is how players roll a handful of dice together. A single loose die can also be rolled.

## Hands

Each seat in the manifest has a hand: a container that renders in front of that seat. Cards in your hand render
face-up for you and face-down for everyone else. Dropping a card on your hand zone adds it to your hand.

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
