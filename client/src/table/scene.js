import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { landing, reachBounds } from "../state/footprint";
import {
  DICE_TRAY_FLOOR, HAND_TRAY_HEIGHT, fanSpots, findObject, handSlots, looseObjects, objectHeight, pieceDef,
} from "../state/objects";
import { fromTray } from "../state/trays";
import { playerColor } from "../state/seats";
import { tableRotationToThree, tableToThree, threeToTable } from "./coordinates";
import { applyBagPlacement, buildBag } from "./bags";
import { applyDeckPlacement, buildDeck, deckTopImage, setDeckTop } from "./decks";
import { applyDiePlacement, buildDie, hideDie, setSwirling } from "./dice";
import { buildDiceTray, placeDiceTray } from "./diceTrays";
import { Easing } from "./easing";
import { FELT_TILE_CM, feltTexture } from "./felt";
import { buildTray, placeTray } from "./hands";
import { buildLabel } from "./labels";
import { buildNameTag, disposeNameTag, placeNameTag } from "./nameTags";
import { HELD_LIFT, applyHandSlot, applyPlacement, buildPiece, stackRanks } from "./pieces";
import { applyStackPlacement, buildStack, faceCamera, setStackTop } from "./stacks";
import { applyStandeePlacement, buildStandee } from "./standees";
import { applyMotion, clampTarget, orbit, sumMotions } from "./rig";
import { TextureCache } from "./textures";

const BACKGROUND = 0x1b1b1f;
const TARGET_MARGIN = 0.1; // how far past the table edge the orbit target may go, as a fraction of its size
const WIGGLE_MS = 250;
const WIGGLE_DEGREES = 8; // how far a blocked rotation turns before springing back
const SWIRL_MS = 1000; // how long a rolled die shows as a swirl
const UNSEATED_COLOR = "#555555"; // name tags for players without a seat

// Owns the Three scene for one table. Camera views come in and go out in
// table coordinates; see coordinates.js.
export class TableScene {
  constructor(container) {
    this.container = container;
    this.motions = new Map();
    this.content = new THREE.Group();
    this.pieceMeshes = new Map(); // piece id -> mesh
    this.deckGroups = new Map(); // deck, bag, or stack id -> group
    this.trays = new Map(); // hand id -> group
    this.diceTrays = new Map(); // tray id -> group
    this.rollsSeen = new Map(); // die id -> roll count already shown
    this.swirls = new Map(); // die id -> start time
    this.viewerSeat = null; // whose hand shows face-up
    this.wiggles = new Map(); // object id -> { start, direction }
    this.easing = new Easing();
    this.tags = new Map(); // object id -> name tag, for what others hold
    this.playerId = null; // whose holds are this browser's own
    this.names = new Map(); // player id -> name
    this.raycaster = new THREE.Raycaster();

    this.renderer = new THREE.WebGLRenderer({ antialias: true });
    this.renderer.setPixelRatio(window.devicePixelRatio);
    container.appendChild(this.renderer.domElement);
    this.textures = new TextureCache(this.renderer.capabilities.getMaxAnisotropy());

    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(BACKGROUND);
    this.scene.add(new THREE.AmbientLight(0xffffff, 1.2));
    const sun = new THREE.DirectionalLight(0xffffff, 1.2);
    sun.position.set(30, 100, 20);
    this.scene.add(sun, this.content);

    this.camera = new THREE.PerspectiveCamera(45, 1, 0.1, 5000);
    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.enableDamping = false; // the camera stops when the drag stops
    this.controls.screenSpacePanning = false; // pan across the table, not the screen
    this.controls.minPolarAngle = 0.01; // not exactly top-down, so "forward" stays defined
    this.controls.maxPolarAngle = Math.PI / 2 - 0.05; // stay above the table
    this.controls.minDistance = 5;
    this.controls.mouseButtons = { LEFT: THREE.MOUSE.ROTATE, MIDDLE: THREE.MOUSE.DOLLY, RIGHT: THREE.MOUSE.PAN };
    this.controls.touches = { ONE: THREE.TOUCH.ROTATE, TWO: THREE.TOUCH.DOLLY_PAN };

    this.resizeObserver = new ResizeObserver(() => this.#resize());
    this.resizeObserver.observe(container);
    this.#resize();

    this.clock = new THREE.Clock();
    this.renderer.setAnimationLoop(() => this.#frame());
  }

  // Builds the table for a manifest. Pieces stay hidden until render() gives
  // them state.
  async show(manifest) {
    this.#clearContent();
    this.manifest = manifest;
    this.shown = false;
    const [width, depth] = manifest.table.size;
    this.bounds = {
      minX: -width * TARGET_MARGIN,
      maxX: width * (1 + TARGET_MARGIN),
      minZ: -depth * (1 + TARGET_MARGIN),
      maxZ: depth * TARGET_MARGIN,
    };
    this.controls.maxDistance = Math.max(width, depth) * 4;
    this.startingView = {
      position: [width / 2, Math.max(width, depth) * 0.85, -depth * 0.35],
      target: [width / 2, 0, depth / 2],
    };
    this.setCameraView(this.startingView);

    const [table, ...pieces] = await Promise.all([
      this.#buildTable(manifest.table),
      ...manifest.pieces.map((p) => this.#buildMesh(p)),
    ]);
    if (this.disposed || this.manifest !== manifest) return;
    this.content.add(table, ...manifest.labels.map(buildLabel));
    pieces.forEach((mesh) => this.#addPieceMesh(mesh));
    this.rollsSeen.clear();
    this.shown = true;
    if (this.state) this.render(this.state);
  }

  // Moves meshes to match table state (see state/actions.js).
  render(state) {
    this.state = state;
    if (!this.manifest || !this.shown) return;
    const defs = Object.keys(state.pieces).map((id) => pieceDef(this.manifest, id));
    const ranks = stackRanks(defs, state.pieces);
    for (const def of defs) {
      const mesh = this.pieceMeshes.get(def.id);
      if (!mesh) {
        this.#buildSpawned(def);
        continue;
      }
      if (def.kind === "die") this.#placeLooseDie(mesh, def, state);
      else if (def.kind === "standee") applyStandeePlacement(mesh, def, state.pieces[def.id], this.#hover(def.id, state));
      else applyPlacement(mesh, def, state.pieces[def.id], ranks.get(def.id) || 0, this.#hover(def.id, state));
    }
    // Pieces that went into an infinite bag are gone.
    for (const [id, mesh] of this.pieceMeshes) {
      if (!state.pieces[id]) hideMesh(mesh);
    }
    for (const id of Object.keys(state.containers)) {
      const container = findObject(this.manifest, state, id);
      if (container.def.kind === "tray") this.#renderDiceTray(container, state);
      if (container.def.kind === "bag") {
        applyBagPlacement(this.#bagGroup(container), container.def, container.state, this.#hover(id, state));
      }
      if (container.def.kind === "stack") {
        const group = this.#stackGroup(container);
        applyStackPlacement(group, container.def, container.state, this.#hover(id, state));
        this.#updateTop(group, this.#stackTopImage(container, state), setStackTop);
      }
      if (container.def.kind !== "deck") continue;
      const group = this.#deckGroup(container);
      const hover = this.#hover(id, state);
      applyDeckPlacement(group, container.def, container.state, hover);
      this.#updateDeckTop(group, container);
      if (container.state.splay) this.#renderFan(container, state, hover);
    }
    // Stacks down to one piece are gone.
    for (const [id, group] of this.deckGroups) {
      if (!state.containers[id]) group.visible = group.userData.ghost.visible = group.userData.shadow.visible = false;
    }
    this.#renderHands(state);
    this.#settle(state);
    this.#renderTags(state);
  }

  // Sets whose holds are this browser's: others' get their seat color and a
  // name tag.
  setPlayer(playerId) {
    this.playerId = playerId;
    if (this.state) this.render(this.state);
  }

  // roster: [{ id, name }], for the name tags.
  setRoster(roster) {
    this.names = new Map(roster.map((player) => [player.id, player.name]));
    if (this.state) this.render(this.state);
  }

  // Sets whose hand this browser sees face-up.
  setViewer(seatId) {
    this.viewerSeat = seatId;
    if (this.state) this.render(this.state);
  }

  get canvas() {
    return this.renderer.domElement;
  }

  // The id of the top object under a screen point, or null.
  pick(clientX, clientY) {
    this.#aim(clientX, clientY);
    const targets = [...this.pieceMeshes.values(), ...this.deckGroups.values(), ...this.trays.values(), ...this.diceTrays.values()];
    const hit = this.raycaster.intersectObjects(targets, true)
      .find(({ object }) => object.userData.objectId && shown(object));
    if (!hit) return null;
    // A splayed deck's top card stands for the deck.
    const id = hit.object.userData.objectId;
    const deckId = this.state.pieces[id]?.containerId;
    const deck = deckId && this.state.containers[deckId];
    return deck?.splay && deck.members[0] === id ? deckId : id;
  }

  // Where a screen point meets the plane an object rests on, as table [x, y].
  tablePoint(clientX, clientY, id) {
    const object = this.manifest && this.state && findObject(this.manifest, this.state, id);
    if (!object) return null;
    const layer = object.def.layer;
    this.#aim(clientX, clientY);
    const height = layer.base + layer.thickness / 2;
    const plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), -height);
    const point = this.raycaster.ray.intersectPlane(plane, new THREE.Vector3());
    if (!point) return null;
    const [x, , y] = threeToTable(point.toArray());
    return [x, y];
  }

  // Keeps a dragged object over the table or the hand trays around it.
  clampToTable([x, y]) {
    const { minX, maxX, minY, maxY } = reachBounds(this.manifest, this.state);
    return [Math.min(maxX, Math.max(minX, x)), Math.min(maxY, Math.max(minY, y))];
  }

  setCameraEnabled(enabled) {
    this.controls.enabled = enabled;
  }

  #aim(clientX, clientY) {
    const rect = this.canvas.getBoundingClientRect();
    const ndc = new THREE.Vector2(
      ((clientX - rect.left) / rect.width) * 2 - 1,
      -((clientY - rect.top) / rect.height) * 2 + 1
    );
    this.raycaster.setFromCamera(ndc, this.camera);
  }

  cameraView() {
    return {
      position: threeToTable(this.camera.position.toArray()),
      target: threeToTable(this.controls.target.toArray()),
    };
  }

  setCameraView({ position, target }) {
    this.camera.position.fromArray(tableToThree(position));
    this.controls.target.fromArray(tableToThree(target));
    this.controls.update();
  }

  zoomBy(factor) {
    orbit(this.camera.position, this.controls.target, { zoom: factor }, this.controls);
    this.controls.update();
  }

  // Starts turning an object the given way, then springs it back: a
  // rotation that couldn't happen.
  wiggle(id, degrees) {
    this.wiggles.set(id, { start: performance.now(), direction: Math.sign(degrees) });
  }

  // Continuous camera motion from one input (keys, a joystick). null stops it.
  setMotion(source, motion) {
    if (motion) this.motions.set(source, motion);
    else this.motions.delete(source);
  }

  dispose() {
    this.disposed = true;
    this.renderer.setAnimationLoop(null);
    this.resizeObserver.disconnect();
    this.controls.dispose();
    this.#clearContent();
    this.textures.dispose();
    this.renderer.dispose();
    this.renderer.domElement.remove();
  }

  #frame() {
    const dt = Math.min(this.clock.getDelta(), 0.1);
    if (this.motions.size) {
      applyMotion(this.camera.position, this.controls.target, sumMotions(this.motions.values()), dt, this.controls);
    }
    this.controls.update();
    this.easing.step(dt);
    for (const [id, tag] of this.tags) placeNameTag(tag, this.#object3d(id));
    this.#animateWiggles();
    this.#animateSwirls();
    for (const group of this.deckGroups.values()) {
      if (group.visible && group.userData.counter) faceCamera(group, this.camera.position);
    }
    if (this.bounds) clampTarget(this.camera.position, this.controls.target, this.bounds);
    this.renderer.render(this.scene, this.camera);
  }

  async #buildTable(table) {
    const [width, depth] = table.size;
    let texture;
    if (table.image) {
      texture = await this.textures.get(table.image);
    } else {
      texture = feltTexture(table.color);
      texture.repeat.set(width / FELT_TILE_CM, depth / FELT_TILE_CM);
    }
    const mesh = new THREE.Mesh(
      new THREE.PlaneGeometry(width, depth),
      new THREE.MeshStandardMaterial({ map: texture, roughness: 1 })
    );
    mesh.rotation.x = -Math.PI / 2;
    mesh.position.fromArray(tableToThree([width / 2, 0, depth / 2]));
    return mesh;
  }

  #animateWiggles() {
    if (!this.wiggles.size) return;
    const now = performance.now();
    for (const [id, { start, direction }] of this.wiggles) {
      const mesh = this.pieceMeshes.get(id) || this.deckGroups.get(id);
      const t = (now - start) / WIGGLE_MS;
      if (!mesh || !this.state || t >= 1) {
        this.wiggles.delete(id);
        if (this.state) this.render(this.state);
        continue;
      }
      const object = findObject(this.manifest, this.state, id);
      const turn = direction * WIGGLE_DEGREES * Math.sin(Math.PI * t);
      mesh.rotation.y = tableRotationToThree(object.state.rotation + turn);
      if (object.state.splay) this.#renderFan(object, this.state, {}, turn);
    }
  }

  // For a held object: whether it can land where it hovers, and how high it
  // has to float to clear what's under it. Someone else's hold shows their
  // seat color instead of whether it can land.
  #hover(id, state) {
    const object = findObject(this.manifest, state, id);
    const holder = object.state.heldBy;
    if (!holder) return {};
    const { x, y } = object.state.drag || object.state;
    if (x == null) return {};
    const target = landing(this.manifest, state, id, x, y, object.state.rotation, holder);
    const under = [...(target.blocked || []), target.into, target.onto].filter(Boolean);
    const floor = Math.max(0, ...under.map((other) => objectHeight(findObject(this.manifest, state, other))));
    if (holder !== this.playerId) return { floor, color: playerColor(this.manifest, state, holder) || undefined };
    return { blocked: Boolean(target.blocked), floor };
  }

  #object3d(id) {
    return this.pieceMeshes.get(id) || this.deckGroups.get(id) || this.diceTrays.get(id);
  }

  // Eases everything to where render() put it, except what you're moving: what
  // you hold, and what sits in something you hold.
  #settle(state) {
    const mine = (object) => Boolean(object?.heldBy) && object.heldBy === this.playerId;
    const direct = (id) => {
      const object = state.pieces[id] || state.containers[id];
      return mine(object) || mine(state.containers[object?.containerId]);
    };
    for (const [id, object3d] of [...this.pieceMeshes, ...this.deckGroups, ...this.diceTrays]) {
      this.easing.settle(object3d, direct(id));
    }
  }

  // A name tag over each thing someone else holds.
  #renderTags(state) {
    const held = new Map(); // object id -> holder
    for (const objects of [state.pieces, state.containers]) {
      for (const [id, object] of Object.entries(objects)) {
        if (object.heldBy && object.heldBy !== this.playerId && this.#object3d(id)?.visible) held.set(id, object.heldBy);
      }
    }
    for (const [id, tag] of this.tags) {
      const holder = held.get(id);
      if (holder && tag.userData.key === this.#tagLabel(state, holder).join("\n")) continue;
      this.content.remove(tag);
      disposeNameTag(tag);
      this.tags.delete(id);
    }
    for (const [id, holder] of held) {
      if (this.tags.has(id)) continue;
      const tag = buildNameTag(...this.#tagLabel(state, holder));
      this.tags.set(id, tag);
      this.content.add(tag);
      placeNameTag(tag, this.#object3d(id));
    }
  }

  // [name, color] for a name tag.
  #tagLabel(state, holder) {
    return [this.names.get(holder) || "Someone", playerColor(this.manifest, state, holder) || UNSEATED_COLOR];
  }

  #placeLooseDie(mesh, def, state) {
    const die = state.pieces[def.id];
    this.#noticeRoll(def.id, die);
    if (die.containerId) {
      // Trays place their own dice; anywhere else, a die doesn't show.
      if (!state.containers[die.containerId]?.spots) hideDie(mesh);
      return;
    }
    const { x, y } = die.drag || die;
    const rest = die.drag ? { x: die.x, y: die.y, base: def.layer.base } : null;
    applyDiePlacement(mesh, def, die, { x, y, base: def.layer.base }, { ...this.#hover(def.id, state), rest });
  }

  #renderDiceTray(tray, state) {
    let group = this.diceTrays.get(tray.id);
    if (!group) {
      group = buildDiceTray(tray.id, tray.def);
      this.diceTrays.set(tray.id, group);
      this.content.add(group);
    }
    const hover = this.#hover(tray.id, state);
    placeDiceTray(group, tray.def, tray.state, { floor: hover.floor, lift: HELD_LIFT });
    // The dice ride along with the tray, wherever it floats.
    const pose = { ...tray.state, ...(tray.state.drag || {}) };
    const trayLift = tray.state.heldBy ? (hover.floor || 0) + HELD_LIFT : 0;
    const base = tray.def.layer.base + DICE_TRAY_FLOOR;
    for (const id of tray.state.members) {
      const mesh = this.pieceMeshes.get(id);
      if (!mesh) continue;
      const die = state.pieces[id];
      const def = pieceDef(this.manifest, id);
      const [restX, restY] = fromTray(pose, tray.state.spots[id]);
      const rest = { x: restX, y: restY, base: base + trayLift };
      if (die.heldBy && die.drag) {
        applyDiePlacement(mesh, def, die, { ...die.drag, base: def.layer.base }, { ...this.#hover(id, state), rest });
      } else {
        applyDiePlacement(mesh, def, die, rest);
      }
    }
  }

  // Starts the swirl for a die whose roll count went up since last time.
  #noticeRoll(id, die) {
    const seen = this.rollsSeen.get(id);
    this.rollsSeen.set(id, die.rolls);
    if (seen != null && die.rolls > seen) this.swirls.set(id, performance.now());
  }

  #animateSwirls() {
    if (!this.swirls.size) return;
    const now = performance.now();
    for (const [id, start] of this.swirls) {
      const mesh = this.pieceMeshes.get(id);
      const elapsed = (now - start) / 1000;
      const done = !mesh || now - start >= SWIRL_MS;
      if (mesh) setSwirling(mesh, !done, elapsed);
      if (done) {
        this.swirls.delete(id);
        if (this.state) this.render(this.state);
      }
    }
  }

  #renderHands(state) {
    const hands = looseObjects(this.manifest, state).filter((object) => object.def.kind === "hand");
    for (const tray of this.trays.values()) tray.visible = false;
    for (const hand of hands) {
      let tray = this.trays.get(hand.id);
      if (!tray) {
        const seat = this.manifest.seats.find((s) => s.id === hand.def.seatId);
        tray = buildTray(hand.id, hand.def, seat.color);
        this.trays.set(hand.id, tray);
        this.content.add(tray);
      }
      tray.visible = true;
      placeTray(tray, hand.def);

      const members = hand.state.members.map((id) => ({ id, def: pieceDef(this.manifest, id), state: state.pieces[id] }));
      const cardWidth = Math.max(0, ...members.map((member) => member.def.size[0]));
      const slots = handSlots(hand.def, members.length, cardWidth);
      const mine = hand.def.seatId === this.viewerSeat;
      members.forEach((member, i) => {
        const mesh = this.pieceMeshes.get(member.id);
        if (!mesh) return;
        const slot = slots[i];
        if (member.state.heldBy && member.state.drag) {
          // Dragged out of the hand: it floats like a loose piece, with its
          // ghost left in its spot.
          const loose = { ...member.state, containerId: null, x: slot.x, y: slot.y, rotation: hand.def.rotation, faceUp: mine };
          applyPlacement(mesh, member.def, loose, i, this.#hover(member.id, state));
          return;
        }
        applyHandSlot(mesh, member.def, {
          x: slot.x,
          y: slot.y,
          height: hand.def.layer.base + HAND_TRAY_HEIGHT,
          rotation: hand.def.rotation,
          faceUp: mine,
          lifted: Boolean(member.state.heldBy),
        }, i);
      });
    }
  }

  // Lays a splayed deck's cards out along its fan, bottom card lowest, riding
  // along with the deck while it's held. turn adds to the deck's rotation,
  // for a wiggle.
  #renderFan(deck, state, { floor = 0 }, turn = 0) {
    const pose = { ...deck.state, ...(deck.state.drag || {}), rotation: deck.state.rotation + turn };
    const lift = deck.state.heldBy ? floor + HELD_LIFT : 0;
    const moved = { ...deck, state: pose };
    const spots = fanSpots(moved);
    const rests = fanSpots({ ...deck, state: { ...deck.state, rotation: pose.rotation } });
    const count = deck.state.members.length;
    deck.state.members.forEach((id, i) => {
      const mesh = this.pieceMeshes.get(id);
      if (!mesh) return;
      const def = pieceDef(this.manifest, id);
      const card = state.pieces[id];
      const rank = count - 1 - i;
      if (card.heldBy && card.drag) {
        // Pulled out of the fan: it floats like a loose card, with its ghost
        // left in its place.
        const loose = { ...card, containerId: null, ...rests[i], rotation: deck.state.rotation, faceUp: deck.state.faceUp };
        applyPlacement(mesh, def, loose, rank, this.#hover(id, state));
        return;
      }
      applyHandSlot(mesh, def, {
        ...spots[i],
        height: def.layer.base + lift + def.thickness * rank,
        rotation: pose.rotation,
        faceUp: deck.state.faceUp,
        lifted: Boolean(card.heldBy),
      }, rank);
    });
  }

  #buildMesh(def) {
    if (def.kind === "die") return buildDie(def, this.textures);
    if (def.kind === "standee") return buildStandee(def, this.textures);
    return buildPiece(def, this.textures);
  }

  #addPieceMesh(mesh) {
    mesh.visible = false;
    this.pieceMeshes.set(mesh.name, mesh);
    this.content.add(mesh, mesh.userData.shadow, mesh.userData.ghost);
    if (mesh.userData.swirl) this.content.add(mesh.userData.swirl);
  }

  // Builds the mesh for a piece drawn from an infinite bag, then renders
  // again to place it.
  #buildSpawned(def) {
    this.building ||= new Set();
    if (this.building.has(def.id)) return;
    this.building.add(def.id);
    const manifest = this.manifest;
    Promise.resolve(this.#buildMesh(def)).then((mesh) => {
      this.building.delete(def.id);
      if (this.disposed || this.manifest !== manifest) return;
      this.#addPieceMesh(mesh);
      if (this.state) this.render(this.state);
    });
  }

  #bagGroup(bag) {
    let group = this.deckGroups.get(bag.id);
    if (!group) {
      group = buildBag(bag.id, bag.def, this.textures);
      this.deckGroups.set(bag.id, group);
      this.content.add(group, group.userData.ghost, group.userData.shadow);
    }
    return group;
  }

  #deckGroup(deck) {
    let group = this.deckGroups.get(deck.id);
    if (!group) {
      group = buildDeck(deck.id, deck.def);
      this.deckGroups.set(deck.id, group);
      this.content.add(group, group.userData.ghost, group.userData.shadow);
    }
    return group;
  }

  #stackGroup(stack) {
    let group = this.deckGroups.get(stack.id);
    if (!group) {
      group = buildStack(stack.id, stack.def);
      this.deckGroups.set(stack.id, group);
      this.content.add(group, group.userData.ghost, group.userData.shadow);
    }
    return group;
  }

  #stackTopImage(stack, state) {
    const topId = stack.state.members[0];
    const def = pieceDef(this.manifest, topId);
    return state.pieces[topId].faceUp ? def.face : def.back;
  }

  #updateDeckTop(group, deck) {
    const top = deck.state.members[0];
    this.#updateTop(group, deckTopImage(deck.def, deck.state, top && pieceDef(this.manifest, top)), setDeckTop);
  }

  // Loads the image for a deck's or stack's top when it changes.
  #updateTop(group, image, set) {
    const key = image ? `${image.url}#${image.index ?? ""}` : null;
    if (group.userData.topKey === key) return;
    group.userData.topKey = key;
    if (!image) return;
    this.textures.get(image).then((texture) => {
      if (group.userData.topKey === key) set(group, texture);
    });
  }

  #clearContent() {
    this.content.traverse((object) => {
      object.geometry?.dispose();
      const materials = Array.isArray(object.material) ? object.material : [object.material];
      materials.forEach((material) => {
        material?.map?.dispose();
        material?.dispose();
      });
    });
    this.content.clear();
    this.easing.clear();
    this.tags.clear();
    this.pieceMeshes.clear();
    this.deckGroups.clear();
    this.trays.clear();
    this.diceTrays.clear();
    this.swirls.clear();
    this.building?.clear();
  }

  #resize() {
    const { clientWidth: width, clientHeight: height } = this.container;
    if (!width || !height) return;
    this.renderer.setSize(width, height);
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
  }
}

function hideMesh(mesh) {
  for (const part of [mesh, mesh.userData.shadow, mesh.userData.ghost, mesh.userData.swirl]) {
    if (part) part.visible = false;
  }
}

// Whether an object and everything it sits in are visible.
function shown(object) {
  for (let node = object; node; node = node.parent) {
    if (!node.visible) return false;
  }
  return true;
}
