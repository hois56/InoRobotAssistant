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

test('모든 언어의 버전 기록 항목은 [태그]로 시작해 안내로 표시되지 않는다', () => {
    const history = loadVersionHistory(fileURLToPath(root));
    const tagPattern = /^(`\[[^\]]+\]`|\*\*\[[^\]]+\]\*\*)\s/;
    const untagged = [];
    for (const [locale, value] of Object.entries(history.locales)) {
        for (const kind of ['versionHistory', 'debugVersionHistory']) {
            for (const section of value[kind].sections) {
                for (const version of section.versions) {
                    for (const item of version.items) {
                        if (!tagPattern.test(item)) untagged.push(`${locale} ${section.title} ${version.title}: ${item.slice(0, 40)}`);
                    }
                }
            }
        }
    }
    for (const file of fs.readdirSync(new URL('7_DebuggingTool/', root), { withFileTypes: true })) {
        const historyFile = new URL(`7_DebuggingTool/${file.name}/업데이트_기록.md`, root);
        if (!file.isDirectory() || !fs.existsSync(historyFile)) continue;
        for (const line of fs.readFileSync(historyFile, 'utf8').split(/\r?\n/)) {
            if (line.startsWith('- ') && !tagPattern.test(line.slice(2))) untagged.push(`${file.name}: ${line.slice(2, 42)}`);
        }
    }
    assert.deepEqual(untagged.slice(0, 10), [], `태그가 없는 버전 기록 ${untagged.length}개`);
});
