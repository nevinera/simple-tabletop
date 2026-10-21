# Simple Tabletop

A shared virtual table for groups who already play together. A game module is a JSON manifest plus images,
hosted anywhere. Players move pieces by hand, with no physics and no rules engine.

## Docs

| Doc | Description |
|---|---|
| [docs/architecture.md](docs/architecture.md) | Server, client, data model, and sync |
| [docs/making-a-module.md](docs/making-a-module.md) | Building a game module, step by step, with recipes |
| [docs/manifest-format.md](docs/manifest-format.md) | Every manifest field, in full |

## Development

### Requirements

- Ruby 4.0.6
- Node 22
- SQLite

### Setup

```sh
rvm use 4.0.6@simple-tabletop
bundle install
npm install
bin/rails db:prepare
```

### Running

```sh
bin/dev
```

This runs the Rails server on port 3000 and rebuilds the client into `public/client` on change.

### Tests

```sh
bundle exec rspec
npm test
```
