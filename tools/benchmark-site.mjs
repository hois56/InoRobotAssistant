// Run against either checkout's static server with the same Chromium binary.
import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import { readFile, writeFile } from 'node:fs/promises';

const port = process.env.TEST_SERVER_PORT || '8419';
const url = process.argv.slice(2).find(arg => /^https?:/.test(arg));
const option = name => process.argv.slice(2).find(arg => arg.startsWith('--'+name+'='))?.slice(name.length+3);
const filter = option('case');
const reference = option('compare') ? JSON.parse(await readFile(option('compare'), 'utf8')) : null;
const baselineURL = option('baseline-url');
if (reference && baselineURL) throw new Error('Choose a baseline server or a saved measurement');
const baseURL = url || 'http://127.0.0.1:' + port;
const server = url ? null : spawn(process.execPath, ['tools/static-server.mjs'], {
    env: { ...process.env, TEST_SERVER_PORT: port }, stdio: ['ignore', 'pipe', 'inherit']
});
if (server) await new Promise((resolve, reject) => {
    server.stdout.once('data', resolve);
    server.once('error', reject);
    server.once('exit', code => reject(new Error('Server exited with code ' + code)));
});
process.on('exit', () => server?.kill());
const browser = await chromium.launch({ headless: true }).catch(error => {
    server?.kill();
    throw error;
});
const errors = [];
const results = [];
let currentPage, baselinePage;

async function benchmarkPage(baseURL) {
    const page = await browser.newPage({ baseURL });
    const origin = new URL(baseURL).origin;
    page.on('pageerror', error => errors.push(error.message));
    await page.route(/^https?:\/\//, route => new URL(route.request().url()).origin === origin
        ? route.continue() : route.abort());
    return page;
}

async function timeBatch(page, rounds) {
    return page.evaluate(async rounds => {
        let check;
        const start = performance.now();
        for (let i = 0; i < rounds; i++) check = await window.benchmarkOperation(i);
        return { time: (performance.now() - start) / rounds, check };
    }, rounds);
}

async function measure(path, prepare, rounds, name = path) {
    if (filter && filter !== name) return;
    const pages = baselinePage ? [baselinePage, currentPage] : [currentPage];
    for (const page of pages) {
        await page.goto(path, { waitUntil: 'load' });
        await page.evaluate(prepare);
    }
    const samples = pages.map(() => []);
    const checks = [];
    for (let sample = 0; sample < 11; sample++) {
        const order = pages.length === 1 ? [0] : sample % 2 ? [1, 0] : [0, 1];
        for (const i of order) {
            if (baselinePage) await pages[i].bringToFront();
            const value = await timeBatch(pages[i], rounds);
            if (sample >= 2) samples[i].push(value.time);
            checks[i] = value.check;
        }
        if (baselinePage && JSON.stringify(checks[0]) !== JSON.stringify(checks[1])) {
            throw new Error('Output differs from baseline: ' + name);
        }
    }
    const medians = samples.map(times => times.sort((a, b) => a - b)[4]);
    const record = { name, medianMs: medians.at(-1), check: checks.at(-1) };
    if (reference || baselinePage) {
        const before = baselinePage ? { medianMs: medians[0], check: checks[0] }
            : reference.results.find(row => row.name === name);
        if (!before || JSON.stringify(before.check) !== JSON.stringify(record.check)) {
            throw new Error('Output differs from baseline: ' + name);
        }
        record.beforeMs = before.medianMs;
        record.speedup = record.beforeMs / record.medianMs;
    }
    results.push(record);
    console.log(JSON.stringify(record));
}
try {
    currentPage = await benchmarkPage(baseURL);
    if (baselineURL) baselinePage = await benchmarkPage(baselineURL);
    const environment = { chromium: browser.version(), samples: 9, warmup: 2, paired: Boolean(baselineURL) };
    if (reference && reference.chromium !== environment.chromium) throw new Error('Baseline browser version differs');
    console.log(JSON.stringify(environment));
    await measure('/0_Home/ko/', () => {
        const trigger = document.querySelector('[data-history-card="projectGenerator"]');
        const close = document.querySelector('#history-close-button');
        window.benchmarkOperation = async () => {
            trigger.click();
            await Promise.resolve();
            const count = document.querySelector('#history-dialog-body').childElementCount;
            close.click();
            return count;
        };
    }, 30);
    await measure('/1_RobotModelSelect/', () => {
        window.benchmarkOperation = () => {
            document.querySelector('.filter-option[data-filter-id="Type"][data-option-id="SCARA"]').click();
            const count = document.querySelector('#product-container').childElementCount;
            document.querySelector('#reset-btn').click();
            return count;
        };
    }, 8);
    await measure('/3_ToolSelector/', async () => {
        const source = await (await fetch('./mode-d.js')).text();
        const modulePath = source.match(/integrateStepMesh,?\s*(?:pointInFrame\s*)?\}\s*from '([^']+)'/)[1];
        const { integrateStepMesh } = await import(modulePath);
        // 20,000 closed tetrahedra, indexed as in the STEP importer.
        const vertices = new Float32Array(20000 * 12), indices = new Uint32Array(vertices.length);
        for (let i = 0; i < 20000; i++) {
            const x = i % 32;
            vertices.set([x,0,0, x+1,0,0, x,1,0, x,0,1], i*12);
            indices.set([0,2,1, 0,1,3, 0,3,2, 1,2,3].map(k => k + i*4), i*12);
        }
        const mesh = { attributes: { position: { array: vertices } }, index: { array: indices } };
        window.benchmarkOperation = () => Math.round(integrateStepMesh(mesh).volumeMm3 * 1000);
    }, 5);
    await measure('/3_ToolSelector/', () => {
        const tabs = ['direct', 'calc', 'shape'].map(mode => document.querySelector('[data-mode="' + mode + '"]'));
        const calculate = document.getElementById('main-calculate');
        const result = document.getElementById('restable');
        const robot = document.getElementById('robot');
        const models = [0, window.ToolSelectorRobotModels.findIndex(item => item.type === 'scara')];
        for (const [id, value] of Object.entries({ d_m: 3.5, d_lx: 40, d_ly: 90, d_lz: 110, d_iyy: 0.02, d_izz: 0.03 })) {
            document.getElementById(id).value = String(value);
        }
        const dimensions = { x: 120, y: 80, z: 60, cx: 40, cy: 30, cz: 20, m: 3.5 };
        document.querySelectorAll('#blocks input, #coms input, #sblocks input').forEach(input => {
            input.value = String(dimensions[input.dataset.k || input.dataset.sk]);
        });
        window.benchmarkOperation = i => {
            document.getElementById('d_m').value = String(3.5 + i * 0.01);
            document.querySelector('#blocks [data-k="x"]').value = String(120 + i);
            document.querySelector('#sblocks [data-sk="m"]').value = String(3.5 + i * 0.01);
            const readings = [];
            for (const index of models) {
                robot.value = String(index);
                robot.dispatchEvent(new Event('change'));
                for (const tab of index === models[0] ? tabs : tabs.slice(0, 2)) {
                    tab.click();
                    calculate.click();
                    if (!result.rows.length || result.getBoundingClientRect().height <= 0) throw new Error('Missing tool result');
                    readings.push(result.textContent);
                }
            }
            return readings;
        };
    }, 5, 'tool-inputs');
    await measure('/4_ProjectGenerator/', () => {
        const lines = Array.from({ length: 900 }, (_, i) => 'P[' + i + '] = ' + i + ';');
        const before = lines.join('\n');
        const after = lines.map((line, i) => i % 15 ? line : line + ' # Changed').join('\n') + '\nEnd;';
        window.benchmarkOperation = () => ProjectEditor.diffLines(before, after).filter(row => row.after?.kind === 'added').length;
    }, 6);
    await measure('/4_ProjectGenerator/', () => {
        const steps = Array.from({ length: 12 }, (_, i) => Object.assign(new ProcessStep(i+1), {
            WorkType: i%2 ? 'Stage' : 'Tray', WorkMethod: i%2 ? 'Put' : 'Get', ExtraWaitCount: 3
        }));
        const settings = ProjectEditor.config(steps, { ...state.options, EnableToolControl: true,
            EnableMultiRecipe: true, RecipeCount: 3, EnableTorque: true }, 'Benchmark');
        const encoder = new TextEncoder();
        window.benchmarkOperation = () => Object.values(ProjectEditor.generate(settings, Generator))
            .reduce((sum, file) => sum + encoder.encode(file.replace(/(Time\s*=\s*")[^"]*/g, '$1')).length, 0);
    }, 10, 'generate');
    await measure('/5_Software/', () => {
        window.benchmarkOperation = () => {
            renderSoftwareList('InoRobotLab');
            const label = document.getElementById('softwareResultCount').textContent;
            renderSoftwareList('all');
            return label;
        };
    }, 300);
    await measure('/6_Document/', () => {
        const input = document.getElementById('manualSearch');
        window.benchmarkOperation = () => ['IR-S', 'EtherCAT', 'no-such-manual'].map(term => {
            input.value = term;
            input.dispatchEvent(new Event('input'));
            return Number(document.getElementById('manualCountValue').textContent);
        });
    }, 5);
    await measure('/7_DebuggingTool/ZeroCalibration/', () => {
        const input = document.getElementById('teaching-0');
        window.benchmarkOperation = i => {
            input.value = String(i * 1048576 + 3);
            input.dispatchEvent(new Event('input'));
            return document.getElementById('result-0').textContent;
        };
    }, 100);
    if (errors.length) throw new Error(errors.join('\n'));
    if (!results.length) throw new Error('No benchmark matched ' + filter);
    if (option('save')) await writeFile(option('save'), JSON.stringify({ ...environment, results }, null, 2) + '\n');
    if (reference || baselinePage) {
        const slower = results.filter(row => row.speedup <= 1);
        if (slower.length) throw new Error('No improvement for ' + slower.map(row => row.name).join(', '));
    }
} finally {
    await browser.close();
    server?.kill();
}
