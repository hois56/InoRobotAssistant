import assert from 'node:assert/strict';
import {
    END_MONITORING_OBJECT_COUNT,
    cloneEndMonitoringObjects,
    createDefaultEndMonitoringObject,
    getEndMonitoringCuboidBounds,
    getEndMonitoringCuboidTransform,
    normalizeEndMonitoringObjects,
    validateEndMonitoringObject
} from '../2_3DSimulation/end-monitoring-core.mjs';

const objects = normalizeEndMonitoringObjects();
assert.equal(objects.length, END_MONITORING_OBJECT_COUNT);
assert.deepEqual(objects.map((object) => object.id), Array.from({ length: END_MONITORING_OBJECT_COUNT }, (_, index) => index));
assert.deepEqual(objects[0].mtcpToolIds, ['tool0']);

const mtcp = createDefaultEndMonitoringObject(1);
mtcp.mtcpToolIds = ['tcp0', 'tcp2'];
assert.equal(validateEndMonitoringObject(mtcp).valid, true);
mtcp.mtcpToolIds = [];
assert.equal(validateEndMonitoringObject(mtcp).valid, false);

const diagonal = createDefaultEndMonitoringObject(2);
diagonal.type = 'cuboid';
diagonal.cuboid.p1 = [50, 25, 10];
diagonal.cuboid.p2 = [-20, 100, 40];
assert.deepEqual(getEndMonitoringCuboidBounds(diagonal), {
    min: [-20, 25, 10],
    max: [50, 100, 40]
});
assert.equal(validateEndMonitoringObject(diagonal).valid, true);

const datum = createDefaultEndMonitoringObject(3);
datum.type = 'cuboid';
datum.cuboid.method = 'datumOffset';
datum.cuboid.datum = [100, 100, 100];
datum.cuboid.offset = [-30, 20, -10];
assert.deepEqual(getEndMonitoringCuboidBounds(datum), {
    min: [70, 100, 90],
    max: [100, 120, 100]
});

const fourPoints = createDefaultEndMonitoringObject(4);
fourPoints.type = 'cuboid';
fourPoints.cuboid.method = 'fourPointsHeight';
fourPoints.cuboid.points = [[0, 0, 10], [100, 0, 10], [100, 50, 10], [0, 50, 10]];
fourPoints.cuboid.height = 75;
assert.deepEqual(getEndMonitoringCuboidBounds(fourPoints), {
    min: [0, 0, 10],
    max: [100, 50, 85]
});
assert.deepEqual(getEndMonitoringCuboidTransform(fourPoints), {
    center: [50, 25, 47.5],
    axes: [[1, 0, 0], [0, 1, 0], [0, 0, 1]],
    halfSizes: [50, 25, 37.5]
});
assert.equal(validateEndMonitoringObject(fourPoints).valid, true);
fourPoints.cuboid.height = 0;
assert.equal(validateEndMonitoringObject(fourPoints).valid, false);
fourPoints.cuboid.height = 75;
fourPoints.cuboid.points[2] = [80, 40, 10];
assert.equal(validateEndMonitoringObject(fourPoints).valid, false);

const clone = cloneEndMonitoringObjects([diagonal]);
clone[0].cuboid.p1[0] = 999;
assert.equal(diagonal.cuboid.p1[0], 50);

console.log('End monitoring validation passed.');
