import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';

const require = createRequire(import.meta.url);
const { loadVersionHistory, historyToMarkdown } = require('../../tools/version-history.cjs');
const root = new URL('../../', import.meta.url);

test('홈페이지가 사용하는 모든 언어의 버전 기록은 최신 배포 기록과 일치한다', () => {
    const history = loadVersionHistory(fileURLToPath(root));
    const context = { window: {} };
    vm.runInNewContext(fs.readFileSync(new URL('Language/runtime/locales-data.js', root), 'utf8'), context);
    for (const [locale, value] of Object.entries(history.locales)) {
        const digest = text => createHash('sha256').update(text).digest('hex');
        assert.equal(digest(context.window.INOROBOT_LOCALES[locale].historyMarkdown),
            digest(historyToMarkdown(value.versionHistory)), `${locale}: 홈페이지에 이전 버전 기록이 표시됩니다.`);
    }
});
