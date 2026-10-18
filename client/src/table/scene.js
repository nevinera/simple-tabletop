import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";

const TABLE_SIZE = 100; // cm
const TABLE_COLOR = 0x2e6b3f;

// Table coordinates are [x, y] on the table plane, which maps to Three's
// x/z. Height is Three's y.
export class TableScene {
  constructor(container) {
    this.container = container;

    this.renderer = new THREE.WebGLRenderer({ antialias: true });
    this.renderer.setPixelRatio(window.devicePixelRatio);
    container.appendChild(this.renderer.domElement);

    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x1b1b1f);
    this.scene.add(new THREE.AmbientLight(0xffffff, 1.5));
    const sun = new THREE.DirectionalLight(0xffffff, 1.5);
    sun.position.set(30, 100, 20);
    this.scene.add(sun);

    this.camera = new THREE.PerspectiveCamera(45, 1, 0.1, 2000);
    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.enableDamping = true;
    this.controls.maxPolarAngle = Math.PI / 2 - 0.05; // stay above the table
    this.setCameraView({
      position: [TABLE_SIZE / 2, 90, TABLE_SIZE * 1.1],
      target: [TABLE_SIZE / 2, 0, TABLE_SIZE / 2],
    });

    this.#buildTable();

    this.resizeObserver = new ResizeObserver(() => this.#resize());
    this.resizeObserver.observe(container);
    this.#resize();

    this.renderer.setAnimationLoop(() => {
      this.controls.update();
      this.renderer.render(this.scene, this.camera);
    });
  }

  cameraView() {
    return {
      position: this.camera.position.toArray(),
      target: this.controls.target.toArray(),
    };
  }

  setCameraView({ position, target }) {
    this.camera.position.fromArray(position);
    this.controls.target.fromArray(target);
    this.controls.update();
  }

  dispose() {
    this.renderer.setAnimationLoop(null);
    this.resizeObserver.disconnect();
    this.controls.dispose();
    this.renderer.dispose();
    this.renderer.domElement.remove();
  }

  #buildTable() {
    const table = new THREE.Mesh(
      new THREE.PlaneGeometry(TABLE_SIZE, TABLE_SIZE),
      new THREE.MeshStandardMaterial({ color: TABLE_COLOR })
    );
    table.rotation.x = -Math.PI / 2;
    table.position.set(TABLE_SIZE / 2, 0, TABLE_SIZE / 2);
    this.scene.add(table);
  }

  #resize() {
    const { clientWidth: width, clientHeight: height } = this.container;
    if (!width || !height) return;
    this.renderer.setSize(width, height);
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
  }
}
