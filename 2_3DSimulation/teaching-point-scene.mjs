import * as THREE from 'three';
import { formatTeachingPointLabel } from './teaching-point-core.mjs?v=20261023-teaching-labels-2';

function createTeachingPointLabel(text, color) {
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    const font = '600 28px Inter, Arial, sans-serif';
    ctx.font = font;
    canvas.width = Math.min(4096, Math.ceil(ctx.measureText(text).width) + 20);
    canvas.height = 44;
    ctx.font = font; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillStyle = color; ctx.fillText(text, canvas.width / 2, canvas.height / 2);
    const texture = new THREE.CanvasTexture(canvas);
    texture.generateMipmaps = false; texture.minFilter = THREE.LinearFilter;
    const label = new THREE.Sprite(new THREE.SpriteMaterial({ map: texture, transparent: true,
        depthTest: true, depthWrite: false, toneMapped: false }));
    label.renderOrder = 22;
    label.userData.text = text;
    return label;
}

// Calculate the TCP chain without changing joints, collision state or controller output.
export function teachingJointMatrix(robot, values) {
    const joints = robot.userData.joints;
    if (values.length < joints.length || !values.every(Number.isFinite)) throw new Error('JP');
    const base = robot.userData.controllerBaseFrame || robot;
    const chain = [];
    for (let node = robot.userData.tcpFrame; node !== base; node = node.parent) {
        if (!node) throw new Error('TCP');
        chain.unshift(node);
    }
    const matrix = new THREE.Matrix4();
    for (const node of chain) {
        const index = joints.findIndex(joint => joint.group === node);
        let position = node.position, quaternion = node.quaternion;
        if (index >= 0) {
            const joint = joints[index], value = values[index];
            position = joint.basePosition.clone();
            quaternion = new THREE.Quaternion();
            if (joint.definition.type === 'prismatic') position.addScaledVector(joint.axis, value);
            else quaternion.setFromAxisAngle(joint.axis, THREE.MathUtils.degToRad(value));
        }
        matrix.multiply(new THREE.Matrix4().compose(position, quaternion, node.scale));
    }
    return matrix;
}

export class TeachingPointScene {
    constructor(scene) {
        this.group = new THREE.Group();
        this.group.name = 'Teaching positions';
        scene.add(this.group);
        this.geometry = new THREE.BufferGeometry();
        const canvas = document.createElement('canvas');
        canvas.width = canvas.height = 32;
        const ctx = canvas.getContext('2d');
        ctx.fillStyle = '#ffffff'; ctx.beginPath(); ctx.arc(16, 16, 12, 0, Math.PI * 2); ctx.fill();
        this.texture = new THREE.CanvasTexture(canvas);
        this.material = new THREE.PointsMaterial({ color: 0x38bdf8, size: 10, sizeAttenuation: false,
            map: this.texture, alphaTest: 0.3, transparent: true, depthWrite: false, toneMapped: false });
        this.dots = new THREE.Points(this.geometry, this.material);
        this.dots.frustumCulled = false;
        this.group.add(this.dots);
        this.axes = new THREE.AxesHelper(1);
        this.group.add(this.axes);
        this.selection = new THREE.Sprite(new THREE.SpriteMaterial({ map: this.texture,
            color: 0xfbbf24, depthWrite: false, toneMapped: false }));
        this.group.add(this.selection);
        this.points = []; this.labels = []; this.selectedKey = null;
    }

    clearLabels() {
        for (const label of this.labels) {
            label.removeFromParent(); label.material.map?.dispose(); label.material.dispose();
        }
        this.labels = [];
    }

    setPoints(points) {
        this.points = points;
        this.geometry.dispose();
        this.geometry = new THREE.BufferGeometry();
        this.dots.geometry = this.geometry;
        this.geometry.setAttribute('position', new THREE.Float32BufferAttribute(points.flatMap(p => p.position.toArray()), 3));
        this.geometry.computeBoundingSphere();
        this.clearLabels();
        this.labelMode = null;
        this.detailLabel?.removeFromParent();
        if (this.detailLabel) { this.detailLabel.material.map?.dispose(); this.detailLabel.material.dispose(); }
        this.detailLabel = null;
        this.selectedKey = null;
    }

    select(key, labelMode = 'id') {
        const modeChanged = labelMode !== this.labelMode;
        if (modeChanged) {
            this.labelMode = labelMode;
            this.clearLabels();
            // shortcut: label at most 100 points plus the selection; add label layout if dense files need more.
            this.points.slice(0, 100).forEach(point => {
                const text = formatTeachingPointLabel(point, labelMode);
                if (!text) return;
                const label = createTeachingPointLabel(text, '#7dd3fc');
                label.userData.point = point; this.group.add(label); this.labels.push(label);
            });
        }
        if (key === this.selectedKey && !modeChanged) return;
        this.selectedKey = key;
        if (this.detailLabel) {
            this.detailLabel.removeFromParent(); this.detailLabel.material.map?.dispose(); this.detailLabel.material.dispose();
            this.detailLabel = null;
        }
        const point = this.points.find(p => p.key === key);
        const text = point ? formatTeachingPointLabel(point, labelMode) : '';
        if (text) {
            this.detailLabel = createTeachingPointLabel(text, '#fbbf24');
            this.detailLabel.userData.point = point;
            this.group.add(this.detailLabel);
        }
    }

    update(camera, height, settings) {
        this.group.visible = settings.enabled;
        if (!settings.enabled) return;
        this.material.depthTest = !settings.xray;
        const selected = this.points.find(p => p.key === this.selectedKey);
        this.axes.visible = this.selection.visible = Boolean(selected);
        const pixelSize = position => camera.isOrthographicCamera
            ? (camera.top - camera.bottom) / camera.zoom / Math.max(1, height)
            : 2 * position.distanceTo(camera.position) * Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)) / Math.max(1, height);
        if (selected) {
            const size = pixelSize(selected.position);
            this.axes.position.copy(selected.position); this.axes.quaternion.copy(selected.quaternion);
            this.axes.scale.setScalar(size * 42);
            this.axes.material.depthTest = !settings.xray;
            this.selection.position.copy(selected.position); this.selection.scale.setScalar(size * 17);
            this.selection.material.depthTest = !settings.xray;
        }
        for (const label of [...this.labels, ...(this.detailLabel ? [this.detailLabel] : [])]) {
            const point = label.userData.point, selectedLabel = label === this.detailLabel;
            const projected = point.position.clone().project(camera);
            label.visible = projected.z > -1 && projected.z < 1 && Math.abs(projected.x) <= 1 && Math.abs(projected.y) <= 1
                && settings.labels && (selectedLabel || point.key !== this.selectedKey);
            label.position.copy(point.position);
            const size = pixelSize(point.position);
            const image = label.material.map.image;
            label.scale.set(size * 22 * image.width / image.height, size * 22, 1);
            label.center.set(0.5, -0.15);
            label.material.depthTest = !settings.xray;
        }
    }

    hit(event, camera, canvas, models, xray) {
        const rect = canvas.getBoundingClientRect(), candidates = [];
        for (const point of this.points) {
            const ndc = point.position.clone().project(camera);
            if (ndc.z <= -1 || ndc.z >= 1) continue;
            const x = rect.left + (ndc.x + 1) * rect.width / 2;
            const y = rect.top + (1 - ndc.y) * rect.height / 2;
            if (Math.hypot(event.clientX - x, event.clientY - y) > 13) continue;
            if (!xray) {
                const ray = new THREE.Raycaster();
                ray.setFromCamera(new THREE.Vector2(ndc.x, ndc.y), camera);
                const distance = point.position.clone().sub(ray.ray.origin).dot(ray.ray.direction);
                ray.far = Math.max(0, distance - 0.5);
                const occluded = ray.intersectObjects(models, true).some(hit => hit.object.isMesh
                    && hit.object.visible && hit.object.material?.visible !== false
                    && !hit.object.userData.isOutline
                    && (() => { for (let node = hit.object; node; node = node.parent) if (!node.visible) return false; return true; })());
                if (occluded) continue;
            }
            candidates.push(point);
        }
        return candidates;
    }

    dispose() {
        this.clearLabels();
        if (this.detailLabel) { this.detailLabel.material.map?.dispose(); this.detailLabel.material.dispose(); }
        this.geometry.dispose(); this.material.dispose(); this.texture.dispose();
        this.axes.geometry.dispose(); this.axes.material.dispose(); this.selection.material.dispose();
        this.group.removeFromParent();
    }
}
