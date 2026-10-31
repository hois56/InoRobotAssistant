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

test('같은 날짜의 기록은 언어별 구분 순서로 모으고 같은 구분의 작성 순서는 유지한다', () => {
    const localeTags = [
        ['추가', '개선', '변경', '수정', '업데이트'],
        ['Added', 'Improved', 'Changed', 'Fixed', 'Updated'],
        ['新增', '改进', '变更', '修复', '更新'],
        ['Thêm', 'Cải tiến', 'Thay đổi', 'Sửa lỗi', 'Cập nhật'],
        ['Eklendi', 'İyileştirme', 'Değiştirildi', 'Düzeltildi', 'Güncellendi'],
        ['Добавлено', 'Улучшено', 'Изменено', 'Исправлено', 'Обновлено']
    ];
    for (const tags of localeTags) {
        const entries = tags.map((tag, index) => `\`[${tag}]\` item ${index}`);
        const repeated = `**[${tags[0]}]** second addition`;
        const unknown = '`[Other]` other entry';
        const older = [`\`[${tags[3]}]\` older fix`, `\`[${tags[0]}]\` older addition`];
        const history = { title: 'History', sections: [{ title: 'Tool', versions: [
            { title: 'Ver 26.10.31', items: [entries[3], unknown, entries[0], entries[4], entries[1], repeated, entries[2]] },
            { title: 'Ver 26.10.30', items: older }
        ] }] };
        const original = structuredClone(history);
        const markdown = historyToMarkdown(history);
        const expected = [entries[0], repeated, entries[1], entries[2], entries[3], entries[4], unknown, older[1], older[0]];
        assert.deepEqual(markdown.split('\n').filter(line => line.startsWith('- ')).map(line => line.slice(2)), expected);
        assert.ok(markdown.indexOf('Ver 26.10.31') < markdown.indexOf('Ver 26.10.30'));
        assert.deepEqual(history, original, '정렬 중 원본 기록을 변경하면 안 됩니다.');
    }
});

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
