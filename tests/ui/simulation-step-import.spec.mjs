import { test, expect } from '@playwright/test';

test('실제 STEP Worker는 같은 정밀도로 연속 변환하고 형상·면 정보를 보존한다', async ({ page }) => {
    test.setTimeout(90_000);
    await page.goto('/health');
    const results = await page.evaluate(async () => {
        const worker = new Worker('/2_3DSimulation/step-import-worker.js');
        const source = await (await fetch('/2_3DSimulation/test-assets/3D_model/Conveyor.step')).arrayBuffer();
        const digest = async array => {
            const hash = await crypto.subtle.digest('SHA-256', array);
            return Array.from(new Uint8Array(hash), value => value.toString(16).padStart(2, '0')).join('');
        };
        const parse = requestId => new Promise((resolve, reject) => {
            const meshes = [];
            const timeout = setTimeout(() => finish(new Error('STEP conversion timeout')), 40_000);
            const finish = (error, done) => {
                clearTimeout(timeout);
                worker.removeEventListener('message', onMessage);
                worker.removeEventListener('error', onError);
                if (error) reject(error);
                else resolve({ meshes, timings: done.timings });
            };
            const onMessage = ({ data }) => {
                if (data.requestId !== requestId) return;
                if (data.type === 'mesh') meshes.push(data.mesh);
                if (data.type === 'error') finish(new Error(data.message));
                if (data.type === 'done') finish(null, data);
            };
            const onError = event => finish(new Error(event.message));
            worker.addEventListener('message', onMessage);
            worker.addEventListener('error', onError);
            const fileBuffer = source.slice(0);
            worker.postMessage({ type: 'parse', engine: 'large', requestId,
                fileName: 'Conveyor.step', fileBuffer,
                parameters: { linearDeflectionAbsolute: 1, angularDeflection: 0.8 }
            }, [fileBuffer]);
        });
        try {
            const results = [];
            for (const id of [1, 2]) {
                const { meshes, timings } = await parse(id);
                const geometry = [];
                let vertices = 0, triangles = 0;
                for (const mesh of meshes) {
                    vertices += mesh.positions.length / 3;
                    triangles += mesh.indices.length / 3;
                    geometry.push({
                        positions: await digest(mesh.positions.buffer),
                        indices: await digest(mesh.indices.buffer),
                        normals: await digest(mesh.normals.buffer),
                        brepFaces: mesh.brepFaces,
                        partId: mesh.partId, partName: mesh.partName
                    });
                }
                results.push({ vertices, triangles, geometry, timings });
            }
            return results;
        } finally {
            worker.terminate();
        }
    });
    expect(results[0].vertices).toBe(3220);
    expect(results[0].triangles).toBe(2480);
    expect(results[1].geometry).toEqual(results[0].geometry);
    expect(results[0].geometry.every(mesh => mesh.brepFaces?.length > 0)).toBe(true);
    expect(results[1].timings.engineInitMs).toBeLessThan(results[0].timings.engineInitMs);
    for (const result of results) {
        for (const phase of ['engineInitMs', 'readingMs', 'tessellationMs', 'packingMs']) {
            expect(result.timings[phase]).toBeGreaterThanOrEqual(0);
        }
    }
});
