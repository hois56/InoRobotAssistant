import assert from 'node:assert/strict';
import {
    IO_SIMULATOR_DISPLAY_MODES,
    getIoSimulatorEntries,
    readIoSimulatorEntry,
    writeIoSimulatorEntry
} from '../2_3DSimulation/io-simulator-core.mjs';

const bitEntries = getIoSimulatorEntries('IN', IO_SIMULATOR_DISPLAY_MODES.BIT);
assert.equal(bitEntries.length, 2113);
assert.equal(bitEntries[0].label, 'In[0]');
assert.equal(bitEntries[64].label, 'In[64]');
assert.equal(bitEntries[65].label, 'In[512]');
assert.equal(bitEntries.at(-1).label, 'In[2559]');

const byteEntries = getIoSimulatorEntries('IN', IO_SIMULATOR_DISPLAY_MODES.BYTE);
assert.equal(byteEntries.length, 265);
assert.deepEqual(byteEntries.slice(0, 2).map((entry) => [entry.label, entry.bitStart, entry.bitWidth]), [
    ['InB[0]', 0, 8],
    ['InB[1]', 8, 8]
]);
assert.deepEqual(byteEntries.slice(8, 10).map((entry) => [entry.label, entry.bitStart, entry.bitWidth]), [
    ['InB[8]', 64, 1],
    ['InB[64]', 512, 8]
]);

const wordEntries = getIoSimulatorEntries('OUT', IO_SIMULATOR_DISPLAY_MODES.WORD);
assert.equal(wordEntries.length, 133);
assert.equal(wordEntries[4].label, 'OutW[4]');
assert.equal(wordEntries[4].bitWidth, 1);
assert.equal(wordEntries[5].label, 'OutW[32]');
assert.equal(wordEntries.at(-1).label, 'OutW[159]');

const bits = new Map();
const byteEntry = byteEntries.find((entry) => entry.label === 'InB[64]');
writeIoSimulatorEntry(byteEntry, 0xA5, (bit, value) => bits.set(bit, value));
assert.equal(readIoSimulatorEntry(byteEntry, (bit) => bits.get(bit) === true), 0xA5);
assert.equal(bits.get(512), true);
assert.equal(bits.get(513), false);
assert.equal(bits.get(515), false);

const wordEntry = wordEntries.find((entry) => entry.label === 'OutW[32]');
writeIoSimulatorEntry(wordEntry, 0x8001, (bit, value) => bits.set(bit, value));
assert.equal(readIoSimulatorEntry(wordEntry, (bit) => bits.get(bit) === true), 0x8001);

console.log('IO simulator core validation passed.');
