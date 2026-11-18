import { defineConfig } from '@playwright/test';
import base from '../playwright.config.mjs';
import { fileURLToPath } from 'node:url';

const standalone = fileURLToPath(new URL('./target/standalone/', import.meta.url));
const port = Number(process.env.TEST_SERVER_PORT || 4392);
const baseURL = 'http://127.0.0.1:' + port;

export default defineConfig({
    ...base,
    testDir: '../tests/ui',
    testMatch: ['simulation-*.spec.mjs', 'conveyor-settings.spec.mjs', 'vacuum-surface.spec.mjs'],
    outputDir: './target/browser-results',
    use: { ...base.use, baseURL },
    webServer: {
        cwd: standalone,
        command: 'node start.cjs ' + port,
        url: baseURL + '/2_3DSimulation/',
        reuseExistingServer: false,
        timeout: 30_000
    }
});
