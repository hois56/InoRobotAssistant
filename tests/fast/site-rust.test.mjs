import assert from 'node:assert/strict';
import test from 'node:test';
import '../../shared/site-engine.js';
import { integrateStepMesh } from '../../3_ToolSelector/tool-mass.mjs';

const engine = globalThis.InoSite;

test('catalogs keep separate rows, translated fields and self-excluding filter counts', () => {
    const models = engine.catalog([0, 0, 1], 2, [[0, 2], [1, 2], [1]]);
    const documents = engine.catalog([0], 1, [[0], [0]]);
    documents.setSearchFields([['引数', '이더캣'], ['ethercat', '']]);

    const selected = models.select([1, 0, 1]);
    assert.deepEqual([...selected.rows], [0]);
    assert.deepEqual([...selected.available], [1, 1, 1]);
    assert.deepEqual([...models.select([1, 1, 1]).rows], [0, 1]);
    assert.deepEqual([...documents.select([0], '더캣').rows], [0]);
    assert.deepEqual([...documents.select([0], 'ether').rows], [1]);
    documents.setSearchFields([['設備'], ['設計']]);
    assert.deepEqual([...documents.select([0], '設備').rows], [0]);
    assert.deepEqual([...documents.select([0], 'ether').rows], []);
});

test('history keeps Unicode byte offsets and parses one tag per bullet', () => {
    const markdown = ['## 앞', '### 기록', '- 이전', '## 선택', '### 버전 一',
        '- `[개선]` **[본문]** 한글', '- 기본', '---', '### 숨김', '## 다음'].join('\r\n');
    assert.deepEqual(engine.history(markdown, '선택', true), [
        { title: true, tag: '안내', text: '버전 一' },
        { title: false, tag: '개선', text: '**[본문]** 한글' },
        { title: false, tag: '안내', text: '기본' }
    ]);
});

test('the cart workbook writes UTF-8 file names, ZIP offsets and a valid CRC-32', async () => {
    const filename = 'xl/표.xml';
    const binary = Buffer.from(await engine.workbook({ [filename]: '123456789' }, 'application/zip').arrayBuffer());
    const nameLength = Buffer.byteLength(filename);
    const directory = binary.readUInt32LE(binary.length - 6);
    assert.equal(binary.readUInt32LE(0), 0x04034b50);
    assert.equal(binary.readUInt16LE(6), 0x800);
    assert.equal(binary.readUInt32LE(14), 0xcbf43926);
    assert.equal(binary.readUInt32LE(18), 9);
    assert.equal(binary.toString('utf8', 30, 30 + nameLength), filename);
    assert.equal(binary.toString('utf8', 30 + nameLength, directory), '123456789');
    assert.equal(binary.readUInt32LE(directory), 0x02014b50);
    assert.equal(binary.readUInt32LE(directory + 42), 0);
    assert.equal(binary.readUInt32LE(binary.length - 22), 0x06054b50);
});

test('calibration rounds encoder half-turns and their neighbors like the original controller tool', () => {
    const turn = 1048576;
    for (const factory of [0, 52343, -88]) {
        for (const delta of [-1.51, -1.5, -0.500001, -0.5, -0.499999, 0.49, 0.5, 1.5, 452]) {
            const teaching = factory + delta * turn;
            assert.equal(engine.calibrate(factory, teaching), factory + Math.round((teaching - factory) / turn) * turn);
        }
    }
});

test('robot suitability uses unrounded limits and keeps the worst axis verdict', () => {
    const inputs = [[5, 10], [9.1, 10], [10, 10], [10.00001, 10]];
    const { worst, marginsAndVerdicts } = engine.loadVerdicts(inputs.map(([value, limit]) => ['axis', value, limit]));
    assert.equal(worst, 2);
    assert.deepEqual(Array.from(marginsAndVerdicts).filter((_, i) => i % 2), [0, 1, 1, 2]);
    for (const [i, [value, limit]] of inputs.entries()) {
        assert.equal(marginsAndVerdicts[i * 2], (1 - value / limit) * 100);
    }
});

test('STEP rejects a non-numeric coordinate before JavaScript coercion can replace it with zero', () => {
    const positions = [[null, 0, 0], [1, 0, 0], [0, 1, 0], [0, 0, 1]];
    const mesh = { attributes: { position: { array: positions } }, index: { array: [0,2,1, 0,1,3, 0,3,2, 1,2,3] } };
    assert.throws(() => integrateStepMesh(mesh), /non-finite coordinate/);
    positions[0][0] = 0;
    assert.equal(integrateStepMesh(mesh).volumeMm3, 1 / 6);
});
