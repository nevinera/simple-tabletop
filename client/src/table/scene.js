import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { blockers } from "../state/footprint";
import { tableRotationToThree, tableToThree, threeToTable } from "./coordinates";
import { FELT_TILE_CM, feltTexture } from "./felt";
import { buildLabel } from "./labels";
import { applyPlacement, buildPiece, stackRanks } from "./pieces";
import { applyMotion, clampTarget, orbit, sumMotions } from "./rig";
import { TextureCache } from "./textures";

const BACKGROUND = 0x1b1b1f;
const TARGET_MARGIN = 0.1; // how far past the table edge the orbit target may go, as a fraction of its size
const WIGGLE_MS = 250;
const WIGGLE_DEGREES = 8; // how far a blocked rotation turns before springing back

// Owns the Three scene for one table. Camera views come in and go out in
// table coordinates; see coordinates.js.
export class TableScene {
  constructor(container) {
    this.container = container;
    this.motions = new Map();
    this.content = new THREE.Group();
    this.pieceMeshes = new Map(); // piece id -> mesh
    this.wiggles = new Map(); // piece id -> { start, direction }
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
      ...manifest.pieces.map((p) => buildPiece(p, this.textures)),
    ]);
    if (this.disposed || this.manifest !== manifest) return;
    this.content.add(table, ...manifest.labels.map(buildLabel), ...pieces);
    pieces.forEach((mesh) => {
      mesh.visible = false;
      this.pieceMeshes.set(mesh.name, mesh);
      this.content.add(mesh.userData.shadow, mesh.userData.ghost);
    });
    if (this.state) this.render(this.state);
  }

  // Moves piece meshes to match table state (see state/actions.js).
  render(state) {
    this.state = state;
    if (!this.manifest) return;
    const ranks = stackRanks(this.manifest.pieces, state.pieces);
    for (const def of this.manifest.pieces) {
      const mesh = this.pieceMeshes.get(def.id);
      if (mesh) applyPlacement(mesh, def, state.pieces[def.id], ranks.get(def.id) || 0, this.#blocked(def, state));
    }
  }

  get canvas() {
    return this.renderer.domElement;
  }

  // The id of the top piece under a screen point, or null.
  pick(clientX, clientY) {
    this.#aim(clientX, clientY);
    const meshes = [...this.pieceMeshes.values()].filter((mesh) => mesh.visible);
    const [hit] = this.raycaster.intersectObjects(meshes, false);
    return hit ? hit.object.name : null;
  }

  // Where a screen point meets the plane a piece rests on, as table [x, y].
  tablePoint(clientX, clientY, pieceId) {
    const def = this.manifest?.pieces.find((p) => p.id === pieceId);
    if (!def) return null;
    this.#aim(clientX, clientY);
    const height = def.layer.base + def.layer.thickness / 2;
    const plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), -height);
    const point = this.raycaster.ray.intersectPlane(plane, new THREE.Vector3());
    if (!point) return null;
    const [x, , y] = threeToTable(point.toArray());
    return [x, y];
  }

  clampToTable([x, y]) {
    const [width, depth] = this.manifest.table.size;
    return [Math.min(width, Math.max(0, x)), Math.min(depth, Math.max(0, y))];
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

  // Continuous camera motion from one input (keys, a joystick). null stops it.
  // Starts turning a piece the given way, then springs it back: a rotation
  // that couldn't happen.
  wiggle(pieceId, degrees) {
    this.wiggles.set(pieceId, { start: performance.now(), direction: Math.sign(degrees) });
  }

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
    this.#animateWiggles();
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
    for (const [pieceId, { start, direction }] of this.wiggles) {
      const mesh = this.pieceMeshes.get(pieceId);
      const t = (now - start) / WIGGLE_MS;
      if (!mesh || t >= 1) {
        this.wiggles.delete(pieceId);
        if (this.state) this.render(this.state);
        continue;
      }
      const piece = this.state.pieces[pieceId];
      mesh.rotation.y = tableRotationToThree(piece.rotation + direction * WIGGLE_DEGREES * Math.sin(Math.PI * t));
    }
  }

  #blocked(def, state) {
    const piece = state.pieces[def.id];
    if (!piece.heldBy || piece.containerId) return false;
    const { x, y } = piece.drag || piece;
    return blockers(this.manifest, state.pieces, def.id, x, y, piece.rotation).length > 0;
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
    this.pieceMeshes.clear();
  }

  #resize() {
    const { clientWidth: width, clientHeight: height } = this.container;
    if (!width || !height) return;
    this.renderer.setSize(width, height);
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
  }
}
