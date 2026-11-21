import assert from 'node:assert/strict';
import test from 'node:test';
import { VALIDATOR_GROUPS, defineValidatorTests, listValidatorScripts } from '../support/validator-runner.mjs';

// Site-wide contracts: localized pages, analytics worker and visitor counter.
defineValidatorTests('site');

test('every tools/validate-* script runs in exactly one validator group', () => {
    const grouped = Object.values(VALIDATOR_GROUPS).flat();
    assert.equal(new Set(grouped).size, grouped.length, 'A validator is listed in more than one group.');
    assert.deepEqual([...grouped].sort(), listValidatorScripts());
});
