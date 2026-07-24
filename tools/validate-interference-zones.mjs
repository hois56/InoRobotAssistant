import assert from 'node:assert/strict';
import {
    INTERFERENCE_ZONE_COUNT,
    cloneInterferenceZones,
    createDefaultInterferenceZone,
    getInterferenceZoneBounds,
    normalizeInterferenceZones,
    pointInInterferenceRegion,
    pointInsideRawInterferenceZone,
    segmentIntersectsInterferenceRegion,
    validateInterferenceZone
} from '../2_3DSimulation/interference-zone-core.mjs';

const zones = normalizeInterferenceZones();
assert.equal(zones.length, INTERFERENCE_ZONE_COUNT);
assert.deepEqual(zones.map((zone) => zone.id), Array.from({ length: 16 }, (_, index) => index));

const diagonal = createDefaultInterferenceZone(0);
diagonal.geometry.p1 = [10, 30, 50];
diagonal.geometry.p2 = [-10, 0, 100];
assert.deepEqual(getInterferenceZoneBounds(diagonal, false).min, [-10, 0, 50]);
assert.deepEqual(getInterferenceZoneBounds(diagonal, false).max, [10, 30, 100]);
assert.equal(pointInsideRawInterferenceZone([0, 10, 75], diagonal), true);
assert.equal(pointInsideRawInterferenceZone([0, 40, 75], diagonal), false);

const datum = createDefaultInterferenceZone(1);
datum.geometry.method = 'datumOffset';
datum.geometry.datum = [100, 100, 100];
datum.geometry.offset = [-50, 25, -10];
assert.deepEqual(getInterferenceZoneBounds(datum, false).min, [50, 100, 90]);
assert.deepEqual(getInterferenceZoneBounds(datum, false).max, [100, 125, 100]);

const inside = createDefaultInterferenceZone(2);
inside.geometry.p1 = [0, 0, 0];
inside.geometry.p2 = [100, 100, 100];
inside.safetyDistance = 10;
assert.equal(pointInInterferenceRegion([105, 50, 50], inside), true);
assert.equal(segmentIntersectsInterferenceRegion([-50, 50, 50], [150, 50, 50], inside), true);

const outside = createDefaultInterferenceZone(3);
outside.insideOutside = 'outside';
outside.geometry.p1 = [0, 0, 0];
outside.geometry.p2 = [100, 100, 100];
outside.safetyDistance = 10;
assert.equal(pointInInterferenceRegion([50, 50, 50], outside), false);
assert.equal(pointInInterferenceRegion([5, 50, 50], outside), true);
assert.equal(segmentIntersectsInterferenceRegion([50, 50, 50], [105, 50, 50], outside), true);

const invalid = createDefaultInterferenceZone(4);
invalid.geometry.p1 = [0, 0, 0];
invalid.geometry.p2 = [0, 10, 10];
assert.equal(validateInterferenceZone(invalid).valid, false);

const clone = cloneInterferenceZones([diagonal]);
clone[0].geometry.p1[0] = 999;
assert.equal(diagonal.geometry.p1[0], 10);

const monitoringSelection = createDefaultInterferenceZone(5);
assert.equal(monitoringSelection.monitoringObjectId, 'currentTcp');
monitoringSelection.monitoringObjectId = 3;
assert.equal(normalizeInterferenceZones([monitoringSelection])[0].monitoringObjectId, 3);

console.log('Interference zone validation passed.');
