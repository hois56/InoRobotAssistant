import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import test from 'node:test';

test('R16 J3 has no remote fragment and retains every original body triangle', () => {
    const stl = readFileSync(new URL('../../2_3DSimulation/models/IR-R16-210/P3.stl', import.meta.url));
    const count = stl.readUInt32LE(80);
    let minX = Infinity;
    for (let triangle = 0; triangle < count; triangle++) {
        for (let vertex = 0; vertex < 3; vertex++) minX = Math.min(minX, stl.readFloatLE(96 + triangle * 50 + vertex * 12));
    }
    assert.ok(minX > 0, 'The isolated fragment behind J3 must be removed.');
    assert.equal(count, 144037);
    assert.equal(stl.length, 84 + count * 50);
    // Digest of the retained triangle bytes from the original, unmodified STL.
    assert.equal(createHash('sha256').update(stl.subarray(84)).digest('hex'), 'f9e876473b164cf694720a12b6d6fa9bf4ead31e10b0d4a4468f5ec31b244be4');
});
