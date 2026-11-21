import * as THREE from 'three';
import { materialShaderBeforeAO } from './contact-ambient-occlusion.mjs?v=20261120-record';

// Only moving objects need a pose per sample. Keep the end of a stationary
// interval so starting a move does not interpolate across the preceding wait.
class Keyframes {
    constructor(apply, animated) {
        this.apply = apply;
        this.animated = animated;
        this.keys = [];
        this.cursor = 0;
    }

    sample(time, values, cut = false) {
        const previous = this.keys.at(-1);
        if (!previous || values.some((value, index) => value !== previous.values[index])) {
            if (previous && this.lastTime > previous.time) {
                this.keys.push({ time: this.lastTime, values: previous.values });
            }
            const key = { time, values: values.slice(), cut };
            this.keys.push(key);
            if (previous) this.animated.add(this);
            else this.apply(key.values, key.values, 0);
        }
        this.lastTime = time;
    }

    play(time) {
        if (this.keys[this.cursor].time > time || this.keys[this.cursor + 2]?.time <= time) {
            let low = 0, high = this.keys.length;
            while (low < high) {
                const mid = Math.floor((low + high) / 2);
                if (this.keys[mid].time <= time) low = mid + 1; else high = mid;
            }
            this.cursor = Math.max(0, low - 1);
        } else if (this.keys[this.cursor + 1]?.time <= time) this.cursor++;
        const a = this.keys[this.cursor];
        const b = this.keys[this.cursor + 1];
        const fraction = b && !b.cut ? Math.max(0, (time - a.time) / (b.time - a.time)) : 0;
        this.apply(a.values, b?.values ?? a.values, fraction);
    }
}

const position = new THREE.Vector3(), rotation = new THREE.Quaternion(), scale = new THREE.Vector3();
const nextRotation = new THREE.Quaternion();
const pose = new Array(10);
const mix = THREE.MathUtils.lerp;

function readPose(source) {
    if (source.matrixAutoUpdate) {
        source.position.toArray(pose, 0);
        source.quaternion.toArray(pose, 3);
        source.scale.toArray(pose, 7);
    } else {
        source.matrix.decompose(position, rotation, scale);
        position.toArray(pose, 0);
        rotation.toArray(pose, 3);
        scale.toArray(pose, 7);
    }
    return pose;
}

function applyPose(copy, a, b, t) {
    copy.position.set(mix(a[0], b[0], t), mix(a[1], b[1], t), mix(a[2], b[2], t));
    copy.quaternion.fromArray(a, 3).slerp(nextRotation.fromArray(b, 3), t);
    copy.scale.set(mix(a[7], b[7], t), mix(a[8], b[8], t), mix(a[9], b[9], t));
}

function copyNode(source) {
    // Application userData contains robot joints, DOM and circular references.
    // Copy render properties only, and leave live controls and scripts behind.
    const view = Object.create(source, { userData: { value: {} } });
    let copy;
    if (source.isScene || source.isLight || source.isCamera || source.isSkinnedMesh || source.isInstancedMesh) {
        copy = view.clone(false);
    } else {
        const Type = source.isMesh ? THREE.Mesh : source.isLineSegments ? THREE.LineSegments
            : source.isLineLoop ? THREE.LineLoop : source.isLine ? THREE.Line
            : source.isPoints ? THREE.Points : source.isSprite ? THREE.Sprite
            : source.isBone ? THREE.Bone : THREE.Group;
        copy = new Type().copy(view, false);
    }
    copy.matrixAutoUpdate = true;
    copy.matrixWorldAutoUpdate = true;
    return copy;
}

function updateBuffer(source, copy, previous, addEvent) {
    const data = source.array;
    let first = 0, end = data.length;
    while (first < end && data[first] === previous[first]) first++;
    while (end > first && data[end - 1] === previous[end - 1]) end--;
    if (end === first) return;
    const changed = data.slice(first, end);
    previous.set(changed, first);
    addEvent(() => { copy.array.set(changed, first); copy.needsUpdate = true; });
}

export class SceneRecording {
    constructor(getBeltAnimation) {
        this.getBeltAnimation = getBeltAnimation;
        this.nodes = new Map();
        this.materials = new Map();
        this.geometries = new Map();
        this.animated = new Set();
        this.events = [];
        this.nextEvent = 0;
        this.serial = 0;
        this.time = 0;
        this.playbackSkeletons = [];
        this.modelRoots = new Set();
    }

    event = apply => { this.events.push({ time: this.time, apply }); };

    material(source) {
        let entry = this.materials.get(source);
        if (!entry) {
            const copy = Object.create(source, { userData: { value: {} } }).clone();
            const belt = this.getBeltAnimation(source);
            const shader = materialShaderBeforeAO(source);
            const travel = { value: belt?.travel.value ?? 0 };
            copy.onBeforeCompile = function(program, renderer) {
                shader.call(this, program, renderer);
                if (belt) program.uniforms.conveyorTravel = travel;
            };
            const cacheKey = source.customProgramCacheKey();
            copy.customProgramCacheKey = () => cacheKey;
            entry = { copy, belt };
            if (belt) entry.phase = new Keyframes(([a], [b], t) => {
                const delta = b - a;
                travel.value = a + t * (delta - Math.round(delta / belt.length) * belt.length);
            }, this.animated);
            this.materials.set(source, entry);
        }
        if (entry.serial !== this.serial) {
            entry.serial = this.serial;
            const style = [source.color?.r, source.color?.g, source.color?.b, source.emissive?.r,
                source.emissive?.g, source.emissive?.b, source.opacity, source.transparent, source.visible,
                source.wireframe, source.depthWrite, source.emissiveIntensity];
            if (!entry.style || style.some((value, i) => value !== entry.style[i])) {
                entry.style = style;
                const copy = entry.copy;
                this.event(() => {
                    copy.color?.fromArray(style);
                    copy.emissive?.fromArray(style, 3);
                    [copy.opacity, copy.transparent, copy.visible, copy.wireframe, copy.depthWrite, copy.emissiveIntensity] = style.slice(6);
                    copy.needsUpdate = true;
                });
            }
            if (entry.belt) entry.phase.sample(this.time, [entry.belt.travel.value], this.discontinuous);
        }
        return entry.copy;
    }

    geometry(source) {
        let entry = this.geometries.get(source);
        if (!entry) {
            const mutable = Object.entries(source.attributes).filter(([, attribute]) =>
                !attribute.isInterleavedBufferAttribute && (attribute.usage === THREE.DynamicDrawUsage || attribute.count <= 64));
            // Large CAD vertex buffers are shared. Mutable path/guide buffers
            // retain only the changed ranges while recording.
            const copy = source.isInstancedBufferGeometry ? new THREE.InstancedBufferGeometry() : new THREE.BufferGeometry();
            if (source.isInstancedBufferGeometry) copy.instanceCount = source.instanceCount;
            copy.index = source.index;
            copy.attributes = { ...source.attributes };
            copy.morphAttributes = source.morphAttributes;
            copy.morphTargetsRelative = source.morphTargetsRelative;
            copy.groups = source.groups.slice();
            copy.boundingBox = source.boundingBox?.clone() ?? null;
            copy.boundingSphere = source.boundingSphere?.clone() ?? null;
            const buffers = mutable.map(([name, attr]) => {
                copy.setAttribute(name, attr.clone());
                return { attr, copy: copy.attributes[name], last: attr.array.slice(), version: attr.version };
            });
            entry = { copy, buffers };
            this.geometries.set(source, entry);
        }
        if (entry.serial !== this.serial) {
            entry.serial = this.serial;
            for (const buffer of entry.buffers) {
                if (buffer.attr.version === buffer.version) continue;
                buffer.version = buffer.attr.version;
                buffer.initial ??= buffer.last.slice();
                updateBuffer(buffer.attr, buffer.copy, buffer.last, this.event);
                this.event(() => { entry.copy.boundingSphere = null; entry.copy.boundingBox = null; });
            }
            const { start, count } = source.drawRange;
            if (entry.start !== start || entry.count !== count) {
                entry.start = start;
                entry.count = count;
                this.event(() => entry.copy.setDrawRange(start, count));
            }
        }
        return entry.copy;
    }

    visit(source, parent) {
        let node = this.nodes.get(source);
        if (!node) {
            const copy = copyNode(source);
            node = { copy, pose: new Keyframes((a, b, t) => applyPose(copy, a, b, t), this.animated) };
            this.nodes.set(source, node);
        }
        if (node.seen === this.serial) return node.copy;
        node.seen = this.serial;
        const copy = node.copy;
        const reparented = node.parent !== parent;
        if (reparented) {
            node.parent = parent;
            this.event(() => { if (parent) parent.add(copy); else copy.removeFromParent(); });
        }
        node.pose.sample(this.time, readPose(source), this.discontinuous || (reparented && node.pose.keys.length > 0));
        if (node.visible !== source.visible || node.layers !== source.layers.mask) {
            const visible = node.visible = source.visible, layers = node.layers = source.layers.mask;
            this.event(() => { copy.visible = visible; copy.layers.mask = layers; });
        }
        if (source.geometry) {
            const geometry = this.geometry(source.geometry);
            if (node.geometry !== geometry) {
                node.geometry = geometry;
                this.event(() => { copy.geometry = geometry; });
            }
        }
        if (source.material) {
            const material = source.material;
            if (Array.isArray(material)) {
                const values = material.map(item => this.material(item));
                if (!Array.isArray(node.material) || values.length !== node.material.length || values.some((v, i) => v !== node.material[i])) {
                    node.material = values;
                    this.event(() => { copy.material = values; });
                }
            } else {
                const value = this.material(material);
                if (node.material !== value) {
                    node.material = value;
                    this.event(() => { copy.material = value; });
                }
            }
        }
        if (source.morphTargetInfluences?.length) {
            node.morphs ??= new Keyframes((a, b, t) => a.forEach((v, i) => { copy.morphTargetInfluences[i] = mix(v, b[i], t); }), this.animated);
            node.morphs.sample(this.time, source.morphTargetInfluences, this.discontinuous);
        }
        for (const child of source.children) {
            if (!child.isTransformControls) this.visit(child, copy);
        }
        return copy;
    }

    sample(scene, camera, time, models = [], discontinuous = false) {
        this.time = time;
        this.discontinuous = discontinuous;
        this.serial++;
        const sceneCopy = this.visit(scene, null);
        if (this.sourceScene !== scene) {
            this.sourceScene = scene;
            this.event(() => { this.scene = sceneCopy; });
        }
        for (const model of models) {
            const copy = this.nodes.get(model)?.copy;
            if (copy) this.modelRoots.add(copy);
        }
        const copy = this.visit(camera, this.nodes.get(camera.parent)?.copy ?? null);
        if (this.sourceCamera !== camera) {
            this.sourceCamera = camera;
            this.event(() => { this.camera = copy; });
        }
        const node = this.nodes.get(camera);
        const fields = camera.isPerspectiveCamera ? ['near', 'far', 'zoom', 'aspect', 'fov'] :
            ['near', 'far', 'zoom', 'left', 'right', 'top', 'bottom'];
        node.lens ??= new Keyframes((a, b, t) => {
            fields.forEach((key, i) => { copy[key] = mix(a[i], b[i], t); });
            copy.updateProjectionMatrix();
        }, this.animated);
        node.lens.sample(time, fields.map(key => camera[key]), this.discontinuous);
        for (const entry of this.nodes.values()) {
            if (entry.seen === this.serial || !entry.parent) continue;
            entry.parent = null;
            this.event(() => entry.copy.removeFromParent());
        }
    }

    prepare() {
        if (this.preparedNodes === this.nodes.size) return;
        this.preparedNodes = this.nodes.size;
        // Skeletons and light targets can refer across branches of the scene.
        for (const [source, node] of this.nodes) {
            const { copy } = node;
            if (source.isSkinnedMesh && source.skeleton && !node.skeletonReady) {
                copy.skeleton = new THREE.Skeleton(source.skeleton.bones.map(bone => this.nodes.get(bone)?.copy),
                    source.skeleton.boneInverses.map(matrix => matrix.clone()));
                this.playbackSkeletons.push(copy.skeleton);
                node.skeletonReady = source.skeleton.bones.every(bone => this.nodes.has(bone));
            }
            if (source.target && this.nodes.has(source.target)) copy.target = this.nodes.get(source.target).copy;
        }
    }

    play(time) {
        this.prepare();
        // Poses support random access. Rebuild discrete changes only when a
        // backwards seek crosses one (hierarchy, visibility, materials or geometry).
        if (this.nextEvent && this.events[this.nextEvent - 1].time > time) {
            for (const { copy } of this.nodes.values()) copy.removeFromParent();
            for (const { copy, buffers } of this.geometries.values()) {
                for (const buffer of buffers) {
                    if (!buffer.initial) continue;
                    buffer.copy.array.set(buffer.initial);
                    buffer.copy.needsUpdate = true;
                    copy.boundingSphere = null;
                }
            }
            this.nextEvent = 0;
        }
        while (this.nextEvent < this.events.length && this.events[this.nextEvent].time <= time) {
            this.events[this.nextEvent++].apply();
        }
        for (const track of this.animated) track.play(time);
    }

    dispose() {
        for (const { copy } of this.materials.values()) copy.dispose();
        for (const { copy } of this.geometries.values()) copy.dispose();
        for (const skeleton of this.playbackSkeletons) skeleton.dispose();
    }
}
