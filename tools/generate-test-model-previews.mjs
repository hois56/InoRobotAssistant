import { chromium } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';
import { TEST_MODEL_CATALOG } from '../2_3DSimulation/test-model-catalog.mjs';

const browser = await chromium.launch({ headless: true });
try {
    const page = await browser.newPage();
    await page.route('**/2_3DSimulation/main.js*', async route => {
        const response = await route.fetch();
        await route.fulfill({ response, body: `${await response.text()}\nwindow.__preview = { THREE, parseUploaded3DFile, loadTestModelAssetFile, disposeObjectResources };` });
    });
    await page.goto(`http://127.0.0.1:${process.env.TEST_SERVER_PORT || 4173}/2_3DSimulation/index.html`);
    await page.waitForFunction(() => window.__preview);
    await mkdir('2_3DSimulation/test-assets/previews', { recursive: true });
    for (const asset of TEST_MODEL_CATALOG) {
        const data = await page.evaluate(async asset => {
            const { THREE, parseUploaded3DFile, loadTestModelAssetFile, disposeObjectResources } = window.__preview;
            const file = await loadTestModelAssetFile(asset.path);
            const object = await parseUploaded3DFile(file, file.name.split('.').pop(), 'scene', 'fast');
            object.traverse(child => {
                if (!child.isMesh) return;
                const materials = Array.isArray(child.material) ? child.material : [child.material];
                materials.forEach(material => material?.color?.set(asset.color));
            });
            const bounds = new THREE.Box3().setFromObject(object);
            const center = bounds.getCenter(new THREE.Vector3());
            const size = bounds.getSize(new THREE.Vector3());
            object.position.sub(center);
            const scene = new THREE.Scene();
            scene.background = new THREE.Color(0xedf2f7);
            scene.add(object, new THREE.HemisphereLight(0xffffff, 0x64748b, 3));
            const light = new THREE.DirectionalLight(0xffffff, 3);
            light.position.set(2, -3, 5);
            scene.add(light);
            const camera = new THREE.PerspectiveCamera(35, 1.5, 0.1, 100000);
            camera.up.set(0, 0, 1);
            const distance = size.length() * 1.9;
            camera.position.set(distance * 0.65, -distance * 0.8, distance * 0.65);
            camera.lookAt(0, 0, 0);
            const renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
            renderer.setSize(480, 320);
            renderer.render(scene, camera);
            const result = renderer.domElement.toDataURL('image/png').split(',')[1];
            disposeObjectResources(object);
            renderer.dispose();
            renderer.forceContextLoss();
            return result;
        }, asset);
        await writeFile(`2_3DSimulation/test-assets/previews/${asset.id}.png`, Buffer.from(data, 'base64'));
        console.log(`Preview: ${asset.name}`);
    }
} finally {
    await browser.close();
}
