import * as THREE from 'three';
import { createVisionCameraModel, describeVisionFov } from './vision-core.mjs?v=20261109-vision-lab-2';

const FOV_COLOR = 0x22d3ee;
const BODY_COLOR = 0x1f2937;

function cameraQuaternion(model) {
    // three.js cameras look along local -Z with +Y up in the image.
    const { x, y, z } = model.axes;
    const basis = new THREE.Matrix4().makeBasis(
        new THREE.Vector3(...x),
        new THREE.Vector3(-y[0], -y[1], -y[2]),
        new THREE.Vector3(-z[0], -z[1], -z[2])
    );
    return new THREE.Quaternion().setFromRotationMatrix(basis);
}

function disposeObject(object) {
    object.traverse(child => {
        child.geometry?.dispose?.();
        const materials = Array.isArray(child.material) ? child.material : [child.material];
        materials.forEach(material => { material?.map?.dispose?.(); material?.dispose?.(); });
    });
}

/** Camera body, frustum and FOV footprint drawn in the main scene. */
export class VisionRig {
    constructor() {
        this.group = new THREE.Group();
        this.group.name = 'Virtual vision';
        this.group.userData.virtualVisionHelper = true;
        this.body = new THREE.Group();
        const housing = new THREE.Mesh(new THREE.BoxGeometry(46, 46, 70), new THREE.MeshStandardMaterial({ color: BODY_COLOR, roughness: 0.45, metalness: 0.4 }));
        housing.position.z = 35;
        const lens = new THREE.Mesh(new THREE.CylinderGeometry(15, 15, 26, 28), new THREE.MeshStandardMaterial({ color: 0x0f172a, roughness: 0.3, metalness: 0.6 }));
        lens.rotation.x = Math.PI / 2;
        lens.position.z = -13;
        const ring = new THREE.Mesh(new THREE.TorusGeometry(15, 2.2, 10, 32), new THREE.MeshBasicMaterial({ color: FOV_COLOR }));
        ring.position.z = -26;
        this.body.add(housing, lens, ring);
        this.frustum = new THREE.LineSegments(new THREE.BufferGeometry(), new THREE.LineBasicMaterial({ color: FOV_COLOR, transparent: true, opacity: 0.85 }));
        this.footprint = new THREE.Mesh(new THREE.BufferGeometry(), new THREE.MeshBasicMaterial({ color: FOV_COLOR, transparent: true, opacity: 0.12, side: THREE.DoubleSide, depthWrite: false }));
        this.outline = new THREE.LineLoop(new THREE.BufferGeometry(), new THREE.LineBasicMaterial({ color: FOV_COLOR }));
        this.cross = new THREE.LineSegments(new THREE.BufferGeometry(), new THREE.LineBasicMaterial({ color: FOV_COLOR }));
        [this.frustum, this.footprint, this.outline, this.cross].forEach(object => { object.renderOrder = 5; object.frustumCulled = false; });
        this.group.add(this.body, this.frustum, this.footprint, this.outline, this.cross);
    }

    update(config) {
        const camera = config.camera;
        const fov = describeVisionFov(camera, camera.workPlaneZ);
        const model = fov.model;
        const origin = new THREE.Vector3(...model.position);
        this.body.position.copy(origin);
        // Body axes: housing extends along the camera's backward direction.
        const back = new THREE.Vector3(...model.axes.z).negate();
        const right = new THREE.Vector3(...model.axes.x);
        const up = new THREE.Vector3().crossVectors(back, right).normalize();
        this.body.quaternion.setFromRotationMatrix(new THREE.Matrix4().makeBasis(right, up, back));
        this.body.visible = true;
        const showFov = camera.showFrustum && Boolean(fov.corners);
        [this.frustum, this.footprint, this.outline, this.cross].forEach(object => { object.visible = showFov; });
        if (showFov) {
            const corners = fov.corners.map(point => new THREE.Vector3(...point));
            const lift = new THREE.Vector3(0, 0, model.axes.z[2] > 0 ? -0.6 : 0.6);
            const raised = corners.map(point => point.clone().add(lift));
            this.frustum.geometry.dispose();
            this.frustum.geometry = new THREE.BufferGeometry().setFromPoints(corners.flatMap(point => [origin, point]));
            this.outline.geometry.dispose();
            this.outline.geometry = new THREE.BufferGeometry().setFromPoints(raised);
            const plane = new THREE.BufferGeometry().setFromPoints([raised[0], raised[1], raised[2], raised[0], raised[2], raised[3]]);
            this.footprint.geometry.dispose();
            this.footprint.geometry = plane;
            const center = new THREE.Vector3(...fov.center).add(lift);
            const size = Math.max(5, Math.min(fov.width, fov.height) * 0.04);
            this.cross.geometry.dispose();
            this.cross.geometry = new THREE.BufferGeometry().setFromPoints([
                center.clone().add(new THREE.Vector3(-size, 0, 0)), center.clone().add(new THREE.Vector3(size, 0, 0)),
                center.clone().add(new THREE.Vector3(0, -size, 0)), center.clone().add(new THREE.Vector3(0, size, 0))
            ]);
        }
        return fov;
    }

    dispose() {
        this.group.removeFromParent();
        disposeObject(this.group);
    }
}

function markTexture() {
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = 128;
    const context = canvas.getContext('2d');
    context.fillStyle = '#ffffff';
    context.beginPath(); context.arc(64, 64, 63, 0, Math.PI * 2); context.fill();
    context.fillStyle = '#111827';
    context.beginPath(); context.arc(64, 64, 40, 0, Math.PI * 2); context.fill();
    context.fillStyle = '#ffffff';
    context.beginPath(); context.arc(64, 64, 14, 0, Math.PI * 2); context.fill();
    context.fillStyle = '#111827';
    context.fillRect(62, 4, 4, 24); context.fillRect(62, 100, 4, 24);
    context.fillRect(4, 62, 24, 4); context.fillRect(100, 62, 24, 4);
    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    return texture;
}

/** Circular calibration target mounted on the tool at an XY offset. */
export class CalibrationMark {
    constructor() {
        this.mesh = new THREE.Mesh(
            new THREE.CircleGeometry(0.5, 48),
            new THREE.MeshBasicMaterial({ map: markTexture(), side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: -2 })
        );
        this.mesh.name = 'Vision calibration mark';
        this.mesh.userData.virtualVisionHelper = true;
        this.mesh.renderOrder = 6;
        this.plate = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.5, 1, 32), new THREE.MeshStandardMaterial({ color: 0x9ca3af, roughness: 0.6 }));
        this.plate.rotation.x = Math.PI / 2;
        this.plate.position.z = -0.6;
        this.mesh.add(this.plate);
    }

    /**
     * Place the mark at the tool XY offset, keeping it horizontal (facing up).
     * Returns the world position even when the mark is hidden in the view.
     */
    update({ tcpFrame, offsetX, offsetY, size, visible }) {
        if (!tcpFrame) { this.mesh.visible = false; return null; }
        tcpFrame.updateWorldMatrix(true, false);
        const position = new THREE.Vector3(offsetX, offsetY, 0).applyMatrix4(tcpFrame.matrixWorld);
        const quaternion = tcpFrame.getWorldQuaternion(new THREE.Quaternion());
        const xAxis = new THREE.Vector3(1, 0, 0).applyQuaternion(quaternion);
        const yaw = Math.atan2(xAxis.y, xAxis.x);
        this.mesh.position.copy(position);
        this.mesh.quaternion.setFromAxisAngle(new THREE.Vector3(0, 0, 1), yaw);
        this.mesh.scale.set(size, size, 1);
        this.plate.scale.set(1.15, 1.15, 1.2 / Math.max(size, 1e-3));
        this.mesh.visible = Boolean(visible);
        this.mesh.updateMatrixWorld(true);
        return position;
    }

    dispose() {
        this.mesh.removeFromParent();
        disposeObject(this.mesh);
    }
}

/** Off-screen render of the virtual camera image. */
export class VisionImageRenderer {
    constructor(maxWidth = 640) {
        this.maxWidth = maxWidth;
        this.camera = new THREE.PerspectiveCamera(40, 1.25, 5, 200000);
        this.target = null;
        this.pixels = null;
    }

    size(config) {
        const { resolutionWidth: width, resolutionHeight: height } = config.camera;
        const scale = Math.min(1, this.maxWidth / width);
        return { width: Math.max(16, Math.round(width * scale)), height: Math.max(16, Math.round(height * scale)), scale };
    }

    /**
     * Render the scene through the vision camera and return ImageData.
     * `hidden` objects (helpers, grid) are hidden only during the capture.
     */
    render(renderer, scene, config, hidden = []) {
        const model = createVisionCameraModel(config.camera);
        const { width, height } = this.size(config);
        if (!this.target || this.target.width !== width || this.target.height !== height) {
            this.target?.dispose();
            this.target = new THREE.WebGLRenderTarget(width, height, { samples: 4 });
            this.target.texture.colorSpace = THREE.SRGBColorSpace;
            this.pixels = new Uint8Array(width * height * 4);
        }
        const camera = this.camera;
        camera.fov = model.verticalFovDeg;
        camera.aspect = model.width / model.height;
        camera.position.set(...model.position);
        camera.quaternion.copy(cameraQuaternion(model));
        camera.updateProjectionMatrix();
        camera.updateMatrixWorld(true);
        const captureHidden = new Set(hidden.filter(Boolean));
        scene.traverse(object => {
            if (object.type === 'AxesHelper' || object.isTransformControls || object.isTransformControlsRoot
                || object.isTransformControlsGizmo || object.userData?.workObjectRobot) captureHidden.add(object);
        });
        const states = [...captureHidden].map(object => [object, object.visible]);
        states.forEach(([object]) => { object.visible = false; });
        const previousTarget = renderer.getRenderTarget();
        const previousColor = renderer.getClearColor(new THREE.Color());
        const previousAlpha = renderer.getClearAlpha();
        const previousBackground = scene.background;
        try {
            scene.background = new THREE.Color(0x3a3f47);
            renderer.setRenderTarget(this.target);
            renderer.setClearColor(0x3a3f47, 1);
            renderer.clear();
            renderer.render(scene, camera);
            renderer.readRenderTargetPixels(this.target, 0, 0, width, height, this.pixels);
        } finally {
            renderer.setRenderTarget(previousTarget);
            renderer.setClearColor(previousColor, previousAlpha);
            scene.background = previousBackground;
            states.forEach(([object, visible]) => { object.visible = visible; });
        }
        const image = new ImageData(width, height);
        for (let y = 0; y < height; y++) {
            const source = (height - 1 - y) * width * 4, destination = y * width * 4;
            for (let x = 0; x < width * 4; x += 4) {
                const r = this.pixels[source + x], g = this.pixels[source + x + 1], b = this.pixels[source + x + 2];
                image.data[destination + x] = r; image.data[destination + x + 1] = g; image.data[destination + x + 2] = b;
                image.data[destination + x + 3] = 255;
            }
        }
        return { image, width, height, scale: width / model.width };
    }

    dispose() {
        this.target?.dispose();
        this.target = null;
    }
}

/** Local bounding box of an object's meshes in its own frame. */
export function objectLocalBounds(object) {
    object.updateWorldMatrix(true, true);
    const inverse = new THREE.Matrix4().copy(object.matrixWorld).invert();
    const box = new THREE.Box3();
    const temp = new THREE.Box3();
    object.traverse(child => {
        if (!child.isMesh || !child.geometry || child.visible === false) return;
        if (!child.geometry.boundingBox) child.geometry.computeBoundingBox();
        temp.copy(child.geometry.boundingBox).applyMatrix4(new THREE.Matrix4().multiplyMatrices(inverse, child.matrixWorld));
        box.union(temp);
    });
    return box.isEmpty() ? null : box;
}

/**
 * World feature points the vision measures on a work object: the center of
 * its camera-facing Z face and a point along its local +X axis on that face.
 */
export function objectFeaturePoints(object, viewingAxis = [0, 0, -1]) {
    const box = objectLocalBounds(object);
    if (!box) return null;
    const normal = new THREE.Vector3(0, 0, 1).transformDirection(object.matrixWorld);
    const faceZ = normal.dot(new THREE.Vector3(...viewingAxis)) > 0 ? box.min.z : box.max.z;
    const center = new THREE.Vector3((box.min.x + box.max.x) / 2, (box.min.y + box.max.y) / 2, faceZ);
    const half = Math.max(5, (box.max.x - box.min.x) / 2);
    const axis = center.clone().add(new THREE.Vector3(half, 0, 0));
    const corners = [];
    for (const x of [box.min.x, box.max.x]) for (const y of [box.min.y, box.max.y]) corners.push(new THREE.Vector3(x, y, faceZ));
    const world = point => point.applyMatrix4(object.matrixWorld).toArray();
    return { center: world(center.clone()), axis: world(axis), corners: [corners[0], corners[1], corners[3], corners[2]].map(world) };
}
