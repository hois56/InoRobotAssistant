import { readFile } from 'node:fs/promises';

// Browser tests use an import map for Three. Keep relative engine imports
// anchored to the source module when a Node fixture uses a data URL.
export async function loadCollisionSystem(threeUrl, sourceUrl = new URL('../../2_3DSimulation/collision-system.mjs', import.meta.url)) {
    const source = (await readFile(sourceUrl, 'utf8'))
        .replace("from 'three';", `from '${threeUrl}';`)
        .replace(/from '(\.\/[^']+)'/g, (_, path) => `from '${new URL(path, sourceUrl).href}'`);
    return import('data:text/javascript;base64,' + Buffer.from(source).toString('base64'));
}
