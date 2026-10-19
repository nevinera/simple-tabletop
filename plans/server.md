# Server plan

How the Rails app stores a game, how clients change it, and what players see when two of them reach for the
same thing. It replaces the Data model, Held pieces, and Sync sections of
[architecture.md](../docs/architecture.md) once it's built.

This plan says "hold" for claiming an object so you can move it. "Lock" stays the name of the pin toggle that
stops anyone moving a thing.

## The core idea

The client already has the whole rule engine: `applyAction` in `client/src/state/actions.js` checks holds,
overlap, containers, and everything else, and needs the manifest to do it. The server never reads the
manifest. So the server doesn't run rules. It's a compare-and-set log:

1. A client runs an action against the newest state it has, at sequence `base`.
2. It sends the action and the rows that changed, plus `base`.
3. The server accepts it only if the game is still at `base`. It saves the rows, bumps the sequence, and
   broadcasts them.
4. If the game moved on, the server refuses. The client catches up, runs the action again on the newer state,
   and sends it again.

Since `base` must match exactly, every accepted action was checked against exactly the state it applies to.
The server doesn't need to know what a hold or an overlap is. Two clients can't both win a grab, and a drop
can't land on a spot someone filled a moment earlier, because the loser re-runs against the winner's result.

Players act at human speed, a handful of saved changes a second at most, so refusals are rare and a retry is
cheap. Drags aren't saved and don't take part.

## Storage

Every field that pieces and containers share gets a column. Fields only some objects have go in one JSON
column per table. Nothing the manifest fixes, like sizes, images, or kinds, goes in the database: clients read
those from the module.

### `games`

| column         | notes                                          |
|----------------|------------------------------------------------|
| `invite_token` | random, unique, used in the invite link        |
| `manifest_url` | absolute URL; clients resolve assets from it   |
| `name`         |                                                |
| `sequence`     | bumped on every accepted change                |
| `seating`      | `four` or `eight`                              |
| `table_locked` | boolean; see [The host](#the-host)             |

### `players`

| column         | notes                                          |
|----------------|------------------------------------------------|
| `game_id`      |                                                |
| `public_id`    | random; the `playerId` clients see in state    |
| `name`         |                                                |
| `cookie_token` | random; matches the player's cookie            |
| `seat_key`     | seat id, or null                               |
| `host`         | boolean                                        |
| `seen_at`      | last message or ping; see [Leaving](#leaving)  |

### `pieces`

| column          | notes                                                        |
|-----------------|--------------------------------------------------------------|
| `game_id`       |                                                              |
| `key`           | manifest id, or `bag#3` for a piece from an infinite bag     |
| `x`, `y`        | null while in a container                                    |
| `rotation`      | degrees                                                      |
| `face_up`       | boolean                                                      |
| `stack_order`   | draw order among loose pieces on a layer                     |
| `container_key` | null when loose                                              |
| `held_by`       | a player's `public_id`, or null; indexed                     |
| `locked`        | boolean                                                      |
| `extras`        | JSON: dice keep `value` and `rolls` here                     |

### `containers`

| column         | notes                                                         |
|----------------|---------------------------------------------------------------|
| `game_id`      |                                                               |
| `key`          | manifest id, `#deck-12`, `#stack-7`, or `hand-south`          |
| `x`, `y`       | null for hands, which follow their seat                       |
| `rotation`     | degrees                                                       |
| `face_up`      | boolean                                                       |
| `member_keys`  | JSON array of piece keys, top first                           |
| `held_by`      | a player's `public_id`, or null; indexed                      |
| `locked`       | boolean                                                       |
| `extras`       | JSON: `spec` for containers made during play, `spots` for trays, `spawned` for infinite bags, `splay` and `splayDistance` for decks |

Both tables are unique on `game_id, key`. A 500-card deck is 500 small piece rows and one container row, so a
shuffle rewrites one row.

`drag` isn't a column, since it's never saved.

A deck made during play stores a `spec` today with its size, layer, and accepts, all copied from a card. To
keep fixed data out of the database, the client should store the card's key instead and look the rest up in
the manifest.

### Rows on the wire

Clients send and receive rows in the client's shape: `{ x, y, rotation, faceUp, ... }`. The server maps the
shared fields to columns and puts every other field in `extras`, so a new field that only some objects have
needs no migration. A new shared field gets a column and a migration.

## Protocol

One Action Cable channel per game, `GameChannel`, identified by the player's cookie.

### Server to client

| message    | contents                                                           |
|------------|--------------------------------------------------------------------|
| `snapshot` | `sequence`, `seating`, `players`, every object                     |
| `change`   | `sequence`, `actor`, `actionId`, `action`, `rows`                  |
| `refused`  | to the sender only: `actionId`, `sequence` the game is at          |
| `drag`     | `id`, `x`, `y`, `actor`; not saved, and not sent back to its sender |
| `replaced` | to an older connection when the same player connects again         |

`rows` lists each changed object, player, or game field in full, with `null` for an object that's gone. `action`
is the action as the client sent it, minus anything bulky, so every browser can play its sound, swirl a rolled
die, or wiggle. Clients apply `rows` directly and never re-run someone else's action.

### Client to server

| message | contents                                                    |
|---------|-------------------------------------------------------------|
| `act`   | `actionId`, `base`, `tableAction`, `rows`                   |
| `drag`  | `id`, `x`, `y`                                              |
| `ping`  | nothing; keeps `seen_at` fresh while a player sits still    |
| `resync`| asks for a new `snapshot`                                   |
| `host`  | the host's commands; see [The host](#the-host)              |

`actionId` is random per action, so a client can match its own `change` when it comes back. The client sends
the action as `tableAction`, because Action Cable uses `action` for the channel method.

### What the server does with `act`

In one transaction:

1. Load the game row. SQLite takes one writer at a time, so this serializes every `act` in the game.
2. If `game.sequence != base`, send `refused` and stop. If the table is locked and the sender isn't the host,
   send `refused` unless the action is `join` or `leave`.
3. Write each row: upsert, or delete for `null`.
4. Bump `game.sequence`.
5. After commit, broadcast `change`.

The server checks nothing else. Clients are trusted, and `base` already proves the client checked the rules
against current state.

### What the server does with `drag`

Relay it to the game's stream without saving. Clients ignore a drag for an object the sender doesn't hold in
their state. The client throttles drags to about 20 a second and sends them only once its grab is confirmed.

### Sequence gaps

A client that gets a `change` whose `sequence` isn't one more than its own sends `resync`. Every snapshot, from
a resync or a reconnect, drops the action in flight, since it may or may not have taken. The client replays
the rest of its queue on the snapshot and keeps sending.

## Client changes

The store keeps two states:

- **confirmed:** built from the snapshot and every `change` since.
- **shown:** confirmed with the client's pending actions replayed on top. The scene and UI render this.

`dispatch` still runs `applyAction` on the shown state right away and returns its result, so the interaction
code keeps its synchronous `ok` and `blocked` checks. Then it queues the action for sending.

The queue sends one action at a time:

1. Run the action on confirmed state. Diff the result against confirmed state to get `rows`: the reducer
   copies only what changes, so a row changed if its object isn't the same object anymore.
2. Send `act` with `base` set to confirmed `sequence`.
3. On its own `change`: the action is confirmed. Drop it from the queue and send the next.
4. On `refused`: wait until confirmed state reaches the refused `sequence` (those `change`s are already on
   their way), then go back to step 1. If `applyAction` now rejects the action, drop it and tell the player
   (see [When you lose a race](#when-you-lose-a-race)). Give up after five tries in a row and resync.

Every `change`, yours or not, rebuilds shown state by replaying the queue on the new confirmed state. Random
choices (shuffle order, roll values, bag picks, new deck ids) live in the action, so a replay or a retry
gives the same result.

## Holds

A hold is the `heldBy` field, saved like any other. Grabbing is an action, so the race for a hold is the same
compare-and-set as everything else.

- **Grab:** the client lifts the object at once, and the drag starts locally. Drag messages wait for the grab
  to be confirmed, then send the newest position.
- **Drop, release, draw:** saved actions as now.
- **Holding a container** keeps others off its members, as the reducer already enforces.
- **No timeouts:** a hold lasts as long as the player keeps it, since selecting holds.

### Leaving

The server releases a player's holds once nobody has heard from them in 30 seconds. Each client pings
every 8 to 10 seconds, picked at random each time so players don't ping in step. Every ping refreshes the
sender's `seen_at`, then releases what quiet players in the game hold. As long as anyone is playing, a stuck
hold clears within about 40 seconds. Closing a connection releases nothing by itself, and no job runs.

Releasing clears `held_by` on every row the player holds, which puts the objects back at their saved
spots, bumps the sequence, and broadcasts a `change` with `actor: null`. The player keeps their seat, and
reconnecting gets them a snapshot.

### One connection per player

A player who opens the game in a second tab takes it over. The new connection broadcasts on the player's own
stream, and the older one stops and gets `replaced`. That tab says the game is open somewhere else and offers
to play there instead, which boots the other tab in turn. A booted tab never reconnects by itself.

## Concurrent actions

| race                                         | who wins | the loser's retry                          |
|----------------------------------------------|----------|--------------------------------------------|
| two players grab the same object             | first    | rejected: "Someone else is holding that"   |
| two players draw from the same deck          | both     | the second draws the next card             |
| a draw and a grab of the same deck           | first    | the draw or grab is rejected               |
| two drops onto the same open spot            | first    | blocked: the second piece keeps floating   |
| a drop into a deck someone just picked up    | first    | blocked: a held deck takes nothing, so the piece keeps floating |
| flip or rotate on something just grabbed     | first    | rejected                                   |
| reorder after someone drew from the deck     | first    | rejected: the panel says the deck changed  |
| two players take the same seat               | first    | rejected: "That seat isn't open"           |

Most races resolve themselves on retry, and the loser never sees them. Only a rejected retry needs any UX.

## When you lose a race

### The loser

A grab the server turns down usually arrives 50 to 150 milliseconds after the object lifted.

- The object settles back to wherever the winner's version is: lifted, in the winner's hands. It moves
  there over about 150 milliseconds instead of jumping.
- A small chip in the winner's seat color pops up by the pointer for about a second and a half: "Sam has
  that".
- The pointer gesture ends. Moving the mouse further doesn't move anything or turn the camera until you let
  go.
- A card you drew that came back rejected goes straight back into its deck or bag.

A blocked drop isn't a lost race to the player. The piece keeps floating with its red shadow, exactly as when
you drop onto something that was always there.

A rejected flip, rotate, or splay wiggles, like a rotation that would overlap.

### The winner

Nothing changes. Their grab went through, and they never learn someone else tried. A contest flash on the
winner's side would be noise in a game where reaching for the same card is normal.

### Everyone else

They see the winner's hold, the same as any hold. That works better if holds are easy to read in general:

- A held object's shadow takes the holder's seat color. Only your own holds tint red where they can't land,
  so a red seat never reads as blocked.
- A name tag floats above an object someone else holds.
- Hovering it shows a not-allowed cursor, and its menu says "Sam has that".
- Everything you aren't moving yourself slides to its new spot over about 150 milliseconds, so others' drags
  look smooth at 20 updates a second.

## The host

The player who creates the game is the host. Other players can't do any of this.

| command        | effect                                                                 |
|----------------|------------------------------------------------------------------------|
| `lockTable`    | toggles `table_locked`; while locked, only the host can change the table |
| `resetTable`   | replaces every piece and container with the starting state             |
| `kick`         | removes a player: frees their seat, releases their holds, closes their connection |
| `newInvite`    | replaces the invite token, so old links stop working                   |
| `handOff`      | makes another player the host                                          |

Each command bumps the sequence like an `act`. `lockTable`, `kick`, and `handOff` broadcast a `change`.
`resetTable` carries the starting state, which the host's browser builds from the manifest the same way it did
when it created the game, and broadcasts a fresh `snapshot`. Players keep their seats through a reset, but
their hands empty.

A kicked player can come back through the invite link and pick a name like anyone new. `newInvite` keeps them
out for good.

### A locked table

The server refuses table actions from everyone but the host, and clients check `tableLocked` too, so nobody
sees a lift that slides back.

- Everyone but the host sees a banner: "Sam has locked the table".
- Pointer gestures only move the camera. The cursor never shows grab.
- Menus only offer Magnify. Alt still magnifies, and players can still pick or leave a seat.
- Locking releases everything non-hosts hold, putting it back where it was.
- The host gets a toolbar toggle to lock and unlock, plus reset, kick, a new invite link, and hand off in a
  Host menu.

If the host leaves for good, nobody can use these commands until a player claims host. The plan leaves
that for later, since a group can just make a new game.

## Rails pieces

- `Game`, `Player`, `Piece`, `Container` models.
- `GamesController#create`: the host posts the manifest URL, name, and starting state; returns the invite
  link. `#show` serves the client for a game.
- `PlayersController#create`: takes a name, sets the cookie.
- `ApplicationCable::Connection`: finds the player by cookie, or refuses.
- `GameChannel`: `subscribed` streams the game and transmits a snapshot; `act`, `drag`, `ping`, `resync`, `host`.
- `Game#apply_change!`: the transaction in [What the server does with act](#what-the-server-does-with-act).
- `Game#release_stale_holds!`: run on every ping.

## Milestones

1. **Games and players.** Create a game from a manifest URL and starting state, invite links, names and
   cookies. The client loads a game's state from the server instead of building it.
2. **Change log.** `GameChannel` with `act`, `change`, `refused`, and snapshots. The store's confirmed and shown
   states and the send queue. One browser per player, two browsers on one table.
3. **Drags and holds.** Relayed drags, one connection per player, and releasing holds on stale pings.
4. **Race UX.** The seat-colored shadows, name tags, and the "Sam has that" chip.
5. **Host commands.** Locking the table, reset, kick, new invite links, and handing off host.

## Later

- Games never expire for now. A public server will need a way to clear out old ones.
