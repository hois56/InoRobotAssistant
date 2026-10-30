import * as THREE from 'three';

// AO affects lit, opaque model surfaces only. Helpers, logos' original shader
// hooks, transparency and the renderer's existing tone mapping stay intact.
const pipelines = new WeakMap();
const hooks = new WeakMap();
const uniforms = {
    contactAoMap: { value: null },
    contactAoViewport: { value: new THREE.Vector2() },
    contactAoEnabled: { value: 0 }
};

function isOpaqueLitMaterial(material) {
    return material && (material.isMeshStandardMaterial || material.isMeshLambertMaterial || material.isMeshPhongMaterial)
        && material.visible !== false && !material.transparent && material.opacity >= 0.99
        && material.depthTest && material.depthWrite;
}

function attachMaterial(material) {
    if (hooks.get(material) === material.onBeforeCompile) return;
    const previous = material.onBeforeCompile;
    const cacheKey = material.customProgramCacheKey();
    const hook = function (shader, renderer) {
        previous.call(this, shader, renderer);
        Object.assign(shader.uniforms, uniforms);
        shader.fragmentShader = shader.fragmentShader.replace('#include <common>', `#include <common>
uniform sampler2D contactAoMap;
uniform vec2 contactAoViewport;
uniform float contactAoEnabled;`).replace('#include <opaque_fragment>', `
#ifdef OPAQUE
if (contactAoEnabled > 0.5) {
    outgoingLight *= texture2D(contactAoMap, gl_FragCoord.xy / contactAoViewport).r;
}
#endif
#include <opaque_fragment>`);
    };
    material.onBeforeCompile = hook;
    material.customProgramCacheKey = () => `${cacheKey}|contact-ao-v1`;
    hooks.set(material, hook);
    material.needsUpdate = true;
}

const vertexShader = `varying vec2 vUv;
void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }`;
const reconstruction = `
varying vec2 vUv;
uniform sampler2D surfaceDepth;
uniform sampler2D surfaceNormal;
uniform mat4 inverseProjection;
uniform vec2 resolution;
uniform float radius;
vec3 viewPosition(vec2 uv, float depth) {
    vec4 p = inverseProjection * vec4(uv * 2.0 - 1.0, depth * 2.0 - 1.0, 1.0);
    return p.xyz / p.w;
}`;

class ContactAmbientOcclusion {
    constructor(renderer) {
        this.renderer = renderer;
        this.size = new THREE.Vector2();
        this.depthCamera = null;
        this.depth = new THREE.DepthTexture(1, 1, THREE.UnsignedIntType);
        this.normal = new THREE.WebGLRenderTarget(1, 1, {
            minFilter: THREE.NearestFilter, magFilter: THREE.NearestFilter,
            depthBuffer: true, depthTexture: this.depth
        });
        this.raw = new THREE.WebGLRenderTarget(1, 1, { depthBuffer: false });
        this.blurred = this.raw.clone();
        this.normalMaterial = new THREE.MeshNormalMaterial({ side: THREE.DoubleSide });
        this.passUniforms = {
            surfaceDepth: { value: this.depth }, surfaceNormal: { value: this.normal.texture },
            inverseProjection: { value: new THREE.Matrix4() },
            projectionScale: { value: 1 }, perspective: { value: 1 },
            resolution: { value: new THREE.Vector2() }, radius: { value: 35 },
            aoMap: { value: this.raw.texture }
        };
        this.aoMaterial = new THREE.ShaderMaterial({
            uniforms: this.passUniforms, vertexShader, depthTest: false, depthWrite: false,
            toneMapped: false,
            fragmentShader: `${reconstruction}
uniform float projectionScale;
uniform float perspective;
void main() {
    float depth = texture2D(surfaceDepth, vUv).r;
    if (depth >= 1.0 || texture2D(surfaceNormal, vUv).a < 0.5) { gl_FragColor = vec4(1.0); return; }
    vec3 center = viewPosition(vUv, depth);
    vec3 normal = normalize(texture2D(surfaceNormal, vUv).xyz * 2.0 - 1.0);
    float pixels = clamp(radius * projectionScale / mix(1.0, max(-center.z, 0.01), perspective), 1.0, 28.0);
    float occlusion = 0.0;
    for (int i = 0; i < 16; i++) {
        float angle = float(i) * 2.39996323;
        vec2 offset = vec2(cos(angle), sin(angle)) * sqrt((float(i) + 0.5) / 16.0) * pixels / resolution;
        vec2 uv = vUv + offset;
        if (any(lessThan(uv, vec2(0.0))) || any(greaterThan(uv, vec2(1.0)))) continue;
        float sampleDepth = texture2D(surfaceDepth, uv).r;
        if (sampleDepth >= 1.0 || texture2D(surfaceNormal, uv).a < 0.5) continue;
        vec3 delta = viewPosition(uv, sampleDepth) - center;
        float distanceToSurface = length(delta);
        float alignment = max(dot(normal, delta / max(distanceToSurface, 0.001)) - 0.12, 0.0);
        occlusion += alignment * (1.0 - smoothstep(radius * 0.15, radius, distanceToSurface));
    }
    float ao = max(0.75, 1.0 - occlusion * 2.8 / 16.0);
    gl_FragColor = vec4(vec3(ao), 1.0);
}`
        });
        this.blurMaterial = new THREE.ShaderMaterial({
            uniforms: this.passUniforms, vertexShader, depthTest: false, depthWrite: false,
            toneMapped: false,
            fragmentShader: `${reconstruction}
uniform sampler2D aoMap;
void main() {
    float depth = texture2D(surfaceDepth, vUv).r;
    if (depth >= 1.0 || texture2D(surfaceNormal, vUv).a < 0.5) { gl_FragColor = vec4(1.0); return; }
    vec3 center = viewPosition(vUv, depth);
    vec3 normal = texture2D(surfaceNormal, vUv).xyz * 2.0 - 1.0;
    float total = texture2D(aoMap, vUv).r * 4.0;
    float weight = 4.0;
    for (int i = 0; i < 8; i++) {
        float angle = float(i) * 0.78539816;
        vec2 uv = vUv + vec2(cos(angle), sin(angle)) * 1.5 / resolution;
        float d = texture2D(surfaceDepth, uv).r;
        vec3 n = texture2D(surfaceNormal, uv).xyz * 2.0 - 1.0;
        if (d < 1.0 && dot(normal, n) > 0.85 && abs(viewPosition(uv, d).z - center.z) < radius * 0.2) {
            total += texture2D(aoMap, uv).r;
            weight += 1.0;
        }
    }
    gl_FragColor = vec4(vec3(total / weight), 1.0);
}`
        });
        this.quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), this.aoMaterial);
        this.passScene = new THREE.Scene();
        this.passScene.add(this.quad);
        this.passCamera = new THREE.Camera();
    }

    prepare(scene, camera, models) {
        const { renderer } = this;
        if (!this.depthCamera || this.depthCamera.type !== camera.type) this.depthCamera = camera.clone(false);
        else this.depthCamera.copy(camera, false);
        // The main camera spans fractions of a millimetre to kilometres. A
        // separate near plane keeps contact depths precise at factory scale
        // without changing the visible camera or its clipping range.
        this.depthCamera.near = Math.min(camera.far * 0.5, Math.max(camera.near, 5));
        this.depthCamera.updateProjectionMatrix();
        renderer.getDrawingBufferSize(this.size);
        const scale = Math.min(0.65, 1024 / Math.max(this.size.x, this.size.y));
        const width = Math.max(1, Math.round(this.size.x * scale));
        const height = Math.max(1, Math.round(this.size.y * scale));
        if (this.normal.width !== width || this.normal.height !== height) {
            for (const target of [this.normal, this.raw, this.blurred]) target.setSize(width, height);
        }
        const meshes = new Set();
        for (const root of models) root.traverse(object => {
            if (!object.isMesh) return;
            const materials = Array.isArray(object.material) ? object.material : [object.material];
            if (!materials.length || !materials.every(isOpaqueLitMaterial)) return;
            meshes.add(object);
            materials.forEach(attachMaterial);
        });
        if (!meshes.size) return false;
        const hidden = [];
        const original = {
            target: renderer.getRenderTarget(), clear: renderer.getClearColor(new THREE.Color()),
            alpha: renderer.getClearAlpha(), autoClear: renderer.autoClear,
            shadowUpdate: renderer.shadowMap.autoUpdate,
            background: scene.background, override: scene.overrideMaterial
        };
        try {
            scene.traverse(object => {
                if (object.visible && (object.isMesh || object.isLine || object.isPoints || object.isSprite) && !meshes.has(object)) {
                    hidden.push(object); object.visible = false;
                }
            });
            renderer.autoClear = true;
            renderer.shadowMap.autoUpdate = false;
            scene.background = null;
            scene.overrideMaterial = this.normalMaterial;
            renderer.setClearColor(0x000000, 0);
            renderer.setRenderTarget(this.normal);
            renderer.render(scene, this.depthCamera);
            scene.overrideMaterial = original.override;
            this.passUniforms.inverseProjection.value.copy(this.depthCamera.projectionMatrixInverse);
            this.passUniforms.resolution.value.set(width, height);
            this.passUniforms.projectionScale.value = Math.abs(camera.projectionMatrix.elements[5]) * height * 0.5;
            this.passUniforms.perspective.value = camera.isPerspectiveCamera ? 1 : 0;
            this.quad.material = this.aoMaterial;
            renderer.setRenderTarget(this.raw);
            renderer.render(this.passScene, this.passCamera);
            this.quad.material = this.blurMaterial;
            renderer.setRenderTarget(this.blurred);
            renderer.render(this.passScene, this.passCamera);
        } finally {
            hidden.forEach(object => { object.visible = true; });
            scene.background = original.background;
            scene.overrideMaterial = original.override;
            renderer.autoClear = original.autoClear;
            renderer.shadowMap.autoUpdate = original.shadowUpdate;
            renderer.setClearColor(original.clear, original.alpha);
            renderer.setRenderTarget(original.target);
        }
        uniforms.contactAoMap.value = this.blurred.texture;
        uniforms.contactAoViewport.value.copy(this.size);
        return true;
    }

    dispose() {
        for (const target of [this.normal, this.raw, this.blurred]) target.dispose();
        this.normalMaterial.dispose(); this.aoMaterial.dispose(); this.blurMaterial.dispose();
        this.quad.geometry.dispose();
    }
}

export function renderWithContactAO(renderer, scene, camera, models) {
    uniforms.contactAoEnabled.value = 0;
    if (models.length && (renderer.capabilities.isWebGL2 || renderer.extensions.has('WEBGL_depth_texture'))) {
        let pipeline = pipelines.get(renderer);
        if (!pipeline) { pipeline = new ContactAmbientOcclusion(renderer); pipelines.set(renderer, pipeline); }
        uniforms.contactAoEnabled.value = pipeline.prepare(scene, camera, models) ? 1 : 0;
    }
    try { renderer.render(scene, camera); }
    finally { uniforms.contactAoEnabled.value = 0; }
}

export function disposeContactAO(renderer) {
    pipelines.get(renderer)?.dispose();
    pipelines.delete(renderer);
}
