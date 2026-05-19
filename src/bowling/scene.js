import * as THREE from 'three';

const LANE_WIDTH = 1.06;
const LANE_LENGTH = 18.29;
const GUTTER_WIDTH = 0.23;
const PIN_SPACING = 0.305;

export class BowlingScene {
  constructor(canvas) {
    this.canvas = canvas;
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: false });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.setClearColor(0x0a0a1a);
    this.renderer.shadowMap.enabled = false;

    this.scene = new THREE.Scene();
    this.scene.fog = new THREE.Fog(0x0a0a1a, 16, 22);

    this.camera = new THREE.PerspectiveCamera(50, 1, 0.1, 50);
    this.camera.position.set(0, 2.5, 1.5);
    this.camera.lookAt(0, 0.3, -LANE_LENGTH * 0.6);

    this._setupLights();
    this._createLane();
    this._createGutters();
    this._createBall();
    this._createPins();
    this._createArrows();

    this.pinMeshes = [];
    this.pinStanding = new Array(10).fill(true);
    this._layoutPins();

    this._handleResize();
    window.addEventListener('resize', () => this._handleResize());
  }

  _setupLights() {
    const ambient = new THREE.AmbientLight(0xffffff, 0.5);
    this.scene.add(ambient);

    const dirLight = new THREE.DirectionalLight(0xffffff, 0.8);
    dirLight.position.set(2, 8, 2);
    this.scene.add(dirLight);

    const spotLight = new THREE.SpotLight(0xfff5e6, 1.2, 25, Math.PI / 6, 0.5);
    spotLight.position.set(0, 6, -LANE_LENGTH + 2);
    spotLight.target.position.set(0, 0, -LANE_LENGTH + 1);
    this.scene.add(spotLight);
    this.scene.add(spotLight.target);
  }

  _createLane() {
    const laneGeo = new THREE.PlaneGeometry(LANE_WIDTH, LANE_LENGTH);
    const laneMat = new THREE.MeshStandardMaterial({
      color: 0xd4a056,
      roughness: 0.4,
      metalness: 0.0,
    });
    this.lane = new THREE.Mesh(laneGeo, laneMat);
    this.lane.rotation.x = -Math.PI / 2;
    this.lane.position.set(0, 0, -LANE_LENGTH / 2);
    this.scene.add(this.lane);

    const foulGeo = new THREE.PlaneGeometry(LANE_WIDTH, 0.03);
    const foulMat = new THREE.MeshStandardMaterial({ color: 0x222222 });
    const foulLine = new THREE.Mesh(foulGeo, foulMat);
    foulLine.rotation.x = -Math.PI / 2;
    foulLine.position.set(0, 0.001, -0.1);
    this.scene.add(foulLine);

    const approachGeo = new THREE.PlaneGeometry(LANE_WIDTH, 2);
    const approachMat = new THREE.MeshStandardMaterial({ color: 0xb8894a, roughness: 0.5 });
    const approach = new THREE.Mesh(approachGeo, approachMat);
    approach.rotation.x = -Math.PI / 2;
    approach.position.set(0, -0.001, 0.9);
    this.scene.add(approach);
  }

  _createGutters() {
    const gutterGeo = new THREE.BoxGeometry(GUTTER_WIDTH, 0.08, LANE_LENGTH);
    const gutterMat = new THREE.MeshStandardMaterial({ color: 0x222222, roughness: 0.8 });

    const leftGutter = new THREE.Mesh(gutterGeo, gutterMat);
    leftGutter.position.set(-(LANE_WIDTH / 2 + GUTTER_WIDTH / 2), -0.04, -LANE_LENGTH / 2);
    this.scene.add(leftGutter);

    const rightGutter = new THREE.Mesh(gutterGeo, gutterMat);
    rightGutter.position.set(LANE_WIDTH / 2 + GUTTER_WIDTH / 2, -0.04, -LANE_LENGTH / 2);
    this.scene.add(rightGutter);
  }

  _createArrows() {
    const arrowMat = new THREE.MeshStandardMaterial({ color: 0x8b4513, roughness: 0.3 });
    const arrowPositions = [-0.3, -0.15, 0, 0.15, 0.3];
    const arrowZ = -4.5;

    for (const x of arrowPositions) {
      const shape = new THREE.Shape();
      shape.moveTo(0, 0.12);
      shape.lineTo(0.04, 0);
      shape.lineTo(-0.04, 0);
      shape.closePath();

      const geo = new THREE.ShapeGeometry(shape);
      const mesh = new THREE.Mesh(geo, arrowMat);
      mesh.rotation.x = -Math.PI / 2;
      mesh.position.set(x, 0.002, arrowZ);
      this.scene.add(mesh);
    }
  }

  _createBall() {
    const ballGeo = new THREE.SphereGeometry(0.109, 24, 24);
    const ballMat = new THREE.MeshStandardMaterial({
      color: 0x6c63ff,
      roughness: 0.2,
      metalness: 0.3,
    });
    this.ball = new THREE.Mesh(ballGeo, ballMat);
    this.ball.position.set(0, 0.109, 0);
    this.scene.add(this.ball);
  }

  _createPinGeometry() {
    const group = new THREE.Group();

    const bodyGeo = new THREE.CylinderGeometry(0.03, 0.055, 0.25, 8);
    const bodyMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.3 });
    const body = new THREE.Mesh(bodyGeo, bodyMat);
    body.position.y = 0.125;
    group.add(body);

    const neckGeo = new THREE.CylinderGeometry(0.02, 0.03, 0.08, 8);
    const neck = new THREE.Mesh(neckGeo, bodyMat);
    neck.position.y = 0.29;
    group.add(neck);

    const headGeo = new THREE.SphereGeometry(0.03, 8, 8);
    const head = new THREE.Mesh(headGeo, bodyMat);
    head.position.y = 0.35;
    group.add(head);

    const stripeMat = new THREE.MeshStandardMaterial({ color: 0xcc0000, roughness: 0.4 });
    const stripeGeo = new THREE.CylinderGeometry(0.032, 0.038, 0.03, 8);
    const stripe = new THREE.Mesh(stripeGeo, stripeMat);
    stripe.position.y = 0.28;
    group.add(stripe);

    return group;
  }

  _createPins() {
    this.pinGroup = new THREE.Group();
    this.scene.add(this.pinGroup);
  }

  _layoutPins() {
    while (this.pinGroup.children.length) {
      this.pinGroup.remove(this.pinGroup.children[0]);
    }
    this.pinMeshes = [];

    const pinZ = -LANE_LENGTH + 1;
    const positions = this._getPinPositions(pinZ);

    for (let i = 0; i < 10; i++) {
      const pin = this._createPinGeometry();
      pin.position.copy(positions[i]);
      pin.userData.index = i;
      pin.userData.fallen = false;
      pin.userData.origPos = positions[i].clone();
      this.pinGroup.add(pin);
      this.pinMeshes.push(pin);
    }
  }

  _getPinPositions(z) {
    const s = PIN_SPACING;
    return [
      new THREE.Vector3(0, 0, z),                         // 1
      new THREE.Vector3(-s / 2, 0, z - s * 0.866),        // 2
      new THREE.Vector3(s / 2, 0, z - s * 0.866),         // 3
      new THREE.Vector3(-s, 0, z - s * 1.732),            // 4
      new THREE.Vector3(0, 0, z - s * 1.732),             // 5
      new THREE.Vector3(s, 0, z - s * 1.732),             // 6
      new THREE.Vector3(-s * 1.5, 0, z - s * 2.598),      // 7
      new THREE.Vector3(-s / 2, 0, z - s * 2.598),        // 8
      new THREE.Vector3(s / 2, 0, z - s * 2.598),         // 9
      new THREE.Vector3(s * 1.5, 0, z - s * 2.598),       // 10
    ];
  }

  setBallPosition(x) {
    const halfLane = LANE_WIDTH / 2 - 0.12;
    this.ball.position.x = Math.max(-halfLane, Math.min(halfLane, x));
  }

  getBallPosition() {
    return this.ball.position.clone();
  }

  resetBall() {
    this.ball.position.set(0, 0.109, 0);
    this.ball.rotation.set(0, 0, 0);
    this.ball.visible = true;
  }

  resetAllPins() {
    this.pinStanding = new Array(10).fill(true);
    this._layoutPins();
  }

  resetForSpare() {
    for (let i = 0; i < this.pinMeshes.length; i++) {
      if (!this.pinStanding[i]) {
        this.pinMeshes[i].visible = false;
      }
    }
  }

  knockDownPins(indices) {
    for (const idx of indices) {
      if (idx < this.pinMeshes.length && this.pinStanding[idx]) {
        this.pinStanding[idx] = false;
        const pin = this.pinMeshes[idx];
        pin.userData.fallen = true;
        pin.userData.fallDir = new THREE.Vector3(
          (Math.random() - 0.5) * 0.5 + (this.ball.position.x > pin.userData.origPos.x ? 0.3 : -0.3),
          0,
          -0.3 - Math.random() * 0.3
        ).normalize();
        pin.userData.fallProgress = 0;
      }
    }
  }

  getStandingPinCount() {
    return this.pinStanding.filter(Boolean).length;
  }

  animatePinFall(dt) {
    let anyAnimating = false;
    for (const pin of this.pinMeshes) {
      if (pin.userData.fallen && pin.userData.fallProgress < 1) {
        anyAnimating = true;
        pin.userData.fallProgress = Math.min(1, pin.userData.fallProgress + dt * 3);
        const p = pin.userData.fallProgress;
        const dir = pin.userData.fallDir;

        pin.position.x = pin.userData.origPos.x + dir.x * p * 0.3;
        pin.position.z = pin.userData.origPos.z + dir.z * p * 0.2;
        pin.position.y = pin.userData.origPos.y + Math.sin(p * Math.PI) * 0.05 - p * 0.15;

        pin.rotation.x = dir.z * p * Math.PI * 0.5;
        pin.rotation.z = -dir.x * p * Math.PI * 0.5;
      }
    }
    return anyAnimating;
  }

  render() {
    this.renderer.render(this.scene, this.camera);
  }

  _handleResize() {
    const w = this.canvas.clientWidth;
    const h = this.canvas.clientHeight;
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  }

  dispose() {
    this.renderer.dispose();
    window.removeEventListener('resize', () => this._handleResize());
  }
}

export { LANE_WIDTH, LANE_LENGTH, PIN_SPACING };
