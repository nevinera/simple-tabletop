import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { tableToThree, threeToTable } from "./coordinates";
import { FELT_TILE_CM, feltTexture } from "./felt";
import { buildLabel } from "./labels";
import { buildPiece } from "./pieces";
import { applyMotion, clampTarget, orbit, sumMotions } from "./rig";
import { TextureCache } from "./textures";

const BACKGROUND = 0x1b1b1f;
const TARGET_MARGIN = 0.1; // how far past the table edge the orbit target may go, as a fraction of its size

// Owns the Three scene for one table. Camera views come in and go out in
// table coordinates; see coordinates.js.
export class TableScene {
  constructor(container) {
    this.container = container;
    this.motions = new Map();
    this.content = new THREE.Group();

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
    this.controls.enableDamping = true;
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

  async show(manifest) {
    this.#clearContent();
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
      ...manifest.pieces.filter((p) => p.position).map((p) => buildPiece(p, this.textures)),
    ]);
    if (this.disposed) return;
    this.content.add(table, ...manifest.labels.map(buildLabel), ...pieces);
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
  }

  #resize() {
    const { clientWidth: width, clientHeight: height } = this.container;
    if (!width || !height) return;
    this.renderer.setSize(width, height);
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
  }
}
