import assert from 'node:assert/strict';
import {
    IO_FUNCTION_MAPPING_ACTIONS,
    cloneIoFunctionMappings,
    getIoFunctionMappingAddressLabel,
    isSupportedIoFunctionMappingAddress,
    normalizeIoFunctionMapping,
    normalizeIoFunctionMappings
} from '../2_3DSimulation/io-function-mapping-core.mjs';

assert.equal(isSupportedIoFunctionMappingAddress(0), true);
assert.equal(isSupportedIoFunctionMappingAddress(64), true);
assert.equal(isSupportedIoFunctionMappingAddress(512), true);
assert.equal(isSupportedIoFunctionMappingAddress(2559), true);
assert.equal(isSupportedIoFunctionMappingAddress(65), false);
assert.equal(isSupportedIoFunctionMappingAddress(511), false);
assert.equal(isSupportedIoFunctionMappingAddress(2560), false);

const normalized = normalizeIoFunctionMapping({
    id: 'mapping-1',
    direction: 'OUT',
    address: 512,
    triggerValue: 0,
    action: IO_FUNCTION_MAPPING_ACTIONS.VIEW,
    viewSlot: 99
});
assert.deepEqual(normalized, {
    id: 'mapping-1',
    direction: 'OUT',
    address: 512,
    triggerValue: 0,
    action: IO_FUNCTION_MAPPING_ACTIONS.VIEW,
    gripObjectRef: '',
    viewSlot: 3,
    enabled: true
});
assert.equal(getIoFunctionMappingAddressLabel(normalized), 'Out[512]');

const mappings = normalizeIoFunctionMappings([
    { id: 'same', address: 0 },
    { id: 'same', address: 64 },
    { id: '', address: 2559, enabled: false }
]);
assert.deepEqual(mappings.map((mapping) => mapping.id), ['same', 'same-2', 'io-mapping-3']);
assert.equal(mappings[2].enabled, false);

const cloned = cloneIoFunctionMappings(mappings);
assert.notEqual(cloned, mappings);
assert.deepEqual(cloned, mappings);

console.log('IO function mapping core validation passed.');
