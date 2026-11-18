import { copyFile, mkdir, readFile, readdir, rename, stat, writeFile, cp, mkdtemp } from 'node:fs/promises';
import { buildEngine } from './build-engine.mjs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';

const project = path.dirname(fileURLToPath(import.meta.url));
const repo = path.dirname(project);
const engine = '2_3DSimulation/wasm/simulation.wasm';

if (!process.argv.includes('--package-only')) {
    await buildEngine();
}
await WebAssembly.compile(await readFile(path.join(repo, engine)));

// Assemble in a fresh directory. A failed copy leaves the last runnable
// package intact. Only replace a directory marked as this tool's output.
const scratch = path.join(project, 'target');
const dist = path.join(scratch, 'standalone');
const marker = '.inorobot-simulator-package';
const prior = await stat(dist).catch(e => { if (e.code !== 'ENOENT') throw e; });
if (prior && (await readFile(path.join(dist, marker), 'utf8')) !== '1\n') throw Error('Unknown output directory: ' + dist);
await mkdir(scratch, { recursive: true });
const stage = await mkdtemp(path.join(scratch, 'package-'));
async function copy(relative) {
    const destination = path.join(stage, relative);
    await mkdir(path.dirname(destination), { recursive: true });
    await cp(path.join(repo, relative), destination, { recursive: true });
}

for (const name of await readdir(path.join(repo, '2_3DSimulation'))) {
    if (/\.(?:html|css|m?js)$/.test(name) && name !== 'native-matrix-arithmetic.mjs') {
        await copy('2_3DSimulation/' + name);
    }
}
for (const name of [
    '2_3DSimulation/models', '2_3DSimulation/test-assets', '2_3DSimulation/wasm',
    '2_3DSimulation/urdf', '2_3DSimulation/usd', '2_3DSimulation/bridge/InoRobotVirtualControllerBridge.zip',
    '7_DebuggingTool/Trace/InoRobotTrace_V1.5.zip', '1_RobotModelSelect/INOVANCE_Logo.png',
    '3_ToolSelector/continuous-transform-rotation.mjs', '3_ToolSelector/mass-properties.mjs',
    '3_ToolSelector/snap-geometry.mjs', 'Language/runtime', '0_Home/tool-guide-embed.js',
    'favicon.png', 'analytics-config.js', 'analytics.js', 'tools/serve-local.cjs',
    'tools/virtual-vision-server.cjs', 'tools/virtual-vision-protocols.cjs', 'tools/collaboration-server.cjs',
    'simulator-rust/src', 'simulator-rust/Cargo.toml', 'simulator-rust/Cargo.lock', 'simulator-rust/build-engine.mjs'
]) await copy(name);

const simulationPage = path.join(stage, '2_3DSimulation', 'index.html');
const html = await readFile(simulationPage, 'utf8');
const body = /<body\b([^>]*)>([\s\S]*?)<\/body>/i.exec(html);
const main = body?.[2].match(/<script type="module" src="(main\.js[^"]*)"><\/script>/);
const guide = body?.[2].match(/<script src="([^"]*tool-guide-embed\.js[^"]*)"><\/script>/);
const head = html.slice(0, body?.index);
const i18n = head.match(/<script src="([^"]*\/i18n\.js[^"]*)" defer><\/script>/);
if (!body || !main || !guide || !i18n) throw new Error('Simulator page entry scripts are missing');
const shell = '<body' + body[1] + ' data-local-collaboration="true">\n'
    + '<script type="module" id="rust-simulator" src="./rust-ui.mjs" data-main="' + main[1]
    + '" data-guide="' + guide[1] + '" data-i18n="' + i18n[1] + '"></script>\n</body>';
await writeFile(simulationPage, head.replace(i18n[0], '') + shell + html.slice(body.index + body[0].length));

const redirect = '<!doctype html><meta charset="utf-8"><title>3D Simulation</title>' +
    '<script>location.replace("/2_3DSimulation/"+location.search+location.hash)</script>' +
    '<a href="/2_3DSimulation/">3D Simulation</a>\n';
await writeFile(path.join(stage, 'index.html'), redirect);
for (const lang of ['ko','kr','en','zh-CN','vi','tr','ru']) {
    const home = path.join(stage, '0_Home', lang);
    await mkdir(home, { recursive: true });
    await writeFile(path.join(home, 'index.html'), redirect);
}
await copyFile(path.join(project, 'start.cjs'), path.join(stage, 'start.cjs'));
await copyFile(path.join(project, 'README.md'), path.join(stage, 'README.md'));
await writeFile(path.join(stage, marker), '1\n');
// Windows file indexers may briefly hold an archive in the copied tree.
async function movePackage(from, to) {
    for (let attempt = 0; ; attempt++) {
        try { return await rename(from, to); }
        catch (error) {
            if (process.platform !== 'win32' || !['EBUSY', 'EPERM', 'EACCES'].includes(error.code) || attempt === 10) throw error;
            await delay((attempt + 1) * 150);
        }
    }
}
// Retain the previous output under Cargo's generated target directory until
// the replacement succeeds, then remove that generated package.
let previous;
if (prior) {
    const backup = await mkdtemp(path.join(scratch, 'previous-'));
    previous = path.join(backup, 'dist');
    await movePackage(dist, previous);
}
try {
    await movePackage(stage, dist);
} catch (error) {
    if (previous) await movePackage(previous, dist);
    throw error;
}
if (previous) {
    const { rm } = await import('node:fs/promises');
    try {
        await rm(path.dirname(previous), { recursive: true, maxRetries: 5, retryDelay: 150 });
    } catch (error) {
        if (!['EBUSY', 'EPERM', 'EACCES'].includes(error.code)) throw error;
        console.warn('Standalone package is ready. The previous build is still locked at ' + previous);
    }
}
console.log('Standalone simulator: ' + dist);
