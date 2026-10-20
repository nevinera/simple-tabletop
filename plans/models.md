# 3D model plan

Let a module ship its own 3D pieces, like chess pieces. A model piece is a pawn whose look comes from a
file instead of a built-in shape, so it moves, turns, bags, and stacks like any other pawn.

Most models will come from Tabletop Simulator workshop mods, so the format mirrors TTS custom models: a
Wavefront `.obj` mesh plus a texture image and an optional normal map. glTF binary (`.glb`) works too, for
models from anywhere else.

## Manifest

Models are declared once in a top-level `models` map, like `dieTypes`, and pieces name one as their
`shape`:

```json
{
  "models": {
    "knight": { "mesh": "assets/knight.obj", "texture": "assets/knight.png" },
    "king": { "mesh": "assets/king.glb", "height": 2.4 }
  },
  "pieceTypes": {
    "white-knight": { "kind": "pawn", "shape": "knight", "color": "#f4f1ea", "size": [1.6] }
  }
}
```

| field       | required | notes                                                                  |
|-------------|----------|------------------------------------------------------------------------|
| `mesh`      | yes      | a `.obj` or `.glb`, resolved relative to the manifest like images      |
| `texture`   | no       | `.obj` only: the color image, TTS's "diffuse"                          |
| `normalMap` | no       | `.obj` only: TTS's "normal" image                                      |
| `height`    | no       | height as a multiple of width; defaults to the model's own proportions |
| `footprint` | no       | `circle` (default) or `rect`; `rect` covers the model's base box       |

- Model keys can't reuse the built-in pawn shape names.
- The piece's `color` multiplies the model's colors, like TTS's color tint. White (the default for
  models) leaves a painted model as it is; an untextured white model takes the color outright, so one
  knight serves both sides.
- No colliders. TTS needs them for physics; we don't.
- `.glb`, not `.gltf`, so a model is one file with no side files to resolve or host.

## Fitting the model

Authors shouldn't have to care about units or origin. On load, the client measures the model's bounding
box, centers it over its footprint, sets its base on the table, and scales it so it's `size[0]` wide.
Height follows the model's proportions unless `height` or `size[1]` overrides it. The model's "front"
is its -Z side. Check a few TTS meshes to confirm they agree, since Unity's axes are left-handed.

## Loading

- Fetch every model in the manifest before the scene builds, alongside its textures, so `buildPawn`
  stays synchronous. Use Three's `OBJLoader` and `GLTFLoader` from `three/examples/jsm`.
- Cache by resolved URL and clone per piece. Tinted pieces share geometry and get one material per color.
- A model that fails to load, or is bigger than a size cap (say 5 MB), is a manifest error naming the
  file, like a missing image.
- Hosts need CORS headers, same as images. Add `.obj` and `.glb` to the hosting notes. Steam's
  workshop file host probably doesn't send them, so imported models get copied, not linked.
- Keep instancing working: pieces sharing a model and color go in one instanced mesh per model mesh.

## UI

The magnifier and bag contents draw pawns as SVG outlines from `pawnOutline`, which a model doesn't
have. Render each model and color once to a small offscreen image at load, and show that instead.

## Importing a TTS mod

A command-line importer that takes a TTS save or workshop JSON and writes a module folder: it downloads
each `CustomMesh` object's mesh, diffuse, and normal URLs into `assets/`, writes a `models` entry per
distinct mesh, and places a pawn per object with its `ColorDiffuse` as `color`. Built as a service object
so a rake task, tests, and later an upload page can all call it. Cards, boards, and decks from the same
save could follow, but models come first.

TTS mods often bundle art their uploaders don't own. The importer is for personal tables; nothing
imported goes into `public/builtins/` unless its license allows it.

## Server

No change. Pieces keep syncing as positions and orientations, and the server never fetches assets.

## Proving it

Add chess as a built-in in `public/builtins/chess/` with six CC0 `.obj` pieces, tinted white and black.
It exercises tinting and a board full of models. Separately, run the importer on a TTS chess mod for a
personal table.
