import assert from 'node:assert/strict';
import {
    WORKSPACE_SCHEMA_VERSION,
    WORKSPACE_DB_NAME,
    WORKSPACE_STORE_NAME,
    WORKSPACE_ASSET_STORE_NAME,
    WORKSPACE_LEASE_STORE_NAME,
    normalizeWorkspaceRecord,
    compareWorkspaceRecoveryRecords,
    collapseWorkspaceRecoveryRecords,
    normalizeWorkspaceAsset,
    collectWorkspaceAssetIds,
    collectOrphanWorkspaceAssetIds,
    evaluateWorkspaceLease,
    assertWorkspaceLeaseOwnership,
    decideWorkspaceStartup,
    createForkedWorkspaceRecord,
    getWorkspaceSummary,
    isWorkspaceQuotaError
} from '../2_3DSimulation/workspace-recovery-core.mjs';

assert.equal(WORKSPACE_SCHEMA_VERSION, 1);
assert.equal(WORKSPACE_DB_NAME, 'inorobot-3d-simulation-workspaces');
assert.deepEqual(
    [WORKSPACE_STORE_NAME, WORKSPACE_ASSET_STORE_NAME, WORKSPACE_LEASE_STORE_NAME],
    ['workspaces', 'assets', 'leases']
);

const source = normalizeWorkspaceRecord({
    id: 'workspace-a',
    schemaVersion: 1,
    revision: 7,
    createdAt: 100,
    updatedAt: 200,
    state: {
        motionProject: { robots: [{ instanceId: 'r1' }, { instanceId: 'r2' }] },
        importedModels: [
            { modelId: 'm1', assetId: 'asset-a' },
            { modelId: 'm2', assetId: 'asset-b' }
        ],
        catalogModels: [{ modelId: 'catalog-1' }],
        assetIds: ['asset-b']
    }
}, { now: 300 });
assert.equal(source.updatedAt, 200);
assert.equal(source.incompleteRecoveryFrom, null);
assert.deepEqual(collectWorkspaceAssetIds(source), ['asset-a', 'asset-b']);
assert.deepEqual(getWorkspaceSummary(source), { robots: 2, models: 3, olpProjects: 0 });
assert.deepEqual(getWorkspaceSummary({
    state: { olpProject: { files: [{ path: 'main.pro', text: 'End;' }] } }
}), { robots: 0, models: 0, olpProjects: 1 });

const fork = createForkedWorkspaceRecord(source, 'workspace-b', { now: 500 });
assert.equal(fork.id, 'workspace-b');
assert.equal(fork.forkedFrom, 'workspace-a');
assert.equal(fork.revision, 0);
fork.state.importedModels[0].modelId = 'changed-in-fork';
assert.equal(source.state.importedModels[0].modelId, 'm1', 'Fork metadata must be independent.');
assert.deepEqual(collectWorkspaceAssetIds(fork), ['asset-a', 'asset-b'], 'Forks must share immutable asset refs.');

const incompleteRecovery = normalizeWorkspaceRecord({
    id: 'workspace-partial',
    schemaVersion: 1,
    revision: 2,
    createdAt: 600,
    updatedAt: 700,
    incompleteRecoveryFrom: source.id,
    state: structuredClone(source.state)
}, { now: 800 });
assert.equal(incompleteRecovery.incompleteRecoveryFrom, source.id);
assert.equal(normalizeWorkspaceRecord({
    ...incompleteRecovery,
    incompleteRecoveryFrom: incompleteRecovery.id
}).incompleteRecoveryFrom, null, 'A workspace cannot identify itself as its complete recovery source.');
const incompleteFork = createForkedWorkspaceRecord(incompleteRecovery, 'workspace-partial-fork', { now: 900 });
assert.equal(
    incompleteFork.incompleteRecoveryFrom,
    source.id,
    'Ownership-loss and duplicate forks must preserve incomplete-recovery provenance.'
);
assert.equal(incompleteFork.forkedFrom, incompleteRecovery.id);

const recoveryCandidate = (id, {
    updatedAt,
    revision = 1,
    forkedFrom = null,
    incompleteRecoveryFrom = null
}) => normalizeWorkspaceRecord({
    id,
    schemaVersion: 1,
    revision,
    createdAt: 1,
    updatedAt,
    forkedFrom,
    incompleteRecoveryFrom,
    state: { hasWork: true }
});
const intact = recoveryCandidate('intact', { updatedAt: 100 });
const partial = recoveryCandidate('partial', {
    updatedAt: 900,
    incompleteRecoveryFrom: intact.id
});
const independentNew = recoveryCandidate('independent-new', { updatedAt: 700 });
const forkA = recoveryCandidate('fork-a', { updatedAt: 500, revision: 2, forkedFrom: intact.id });
const forkB = recoveryCandidate('fork-b', { updatedAt: 500, revision: 2, forkedFrom: intact.id });
const forkHigherRevision = recoveryCandidate('fork-higher-revision', {
    updatedAt: 500,
    revision: 3,
    forkedFrom: intact.id
});
const missingOld = recoveryCandidate('missing-old', {
    updatedAt: 1900,
    revision: 99,
    incompleteRecoveryFrom: 'missing-source'
});
const missingTieB = recoveryCandidate('missing-tie-b', {
    updatedAt: 2000,
    revision: 2,
    incompleteRecoveryFrom: 'missing-source'
});
const missingTieA = recoveryCandidate('missing-tie-a', {
    updatedAt: 2000,
    revision: 2,
    incompleteRecoveryFrom: 'missing-source'
});
const otherMissing = recoveryCandidate('other-missing', {
    updatedAt: 2200,
    incompleteRecoveryFrom: 'other-missing-source'
});
const collapsedCandidates = collapseWorkspaceRecoveryRecords([
    missingOld,
    forkB,
    partial,
    otherMissing,
    forkA,
    missingTieB,
    intact,
    independentNew,
    missingTieA,
    forkHigherRevision
], { sessionWorkspaceId: partial.id });
assert.deepEqual(
    collapsedCandidates.map((candidate) => candidate.record.id),
    [
        intact.id,
        independentNew.id,
        forkHigherRevision.id,
        forkA.id,
        forkB.id,
        otherMissing.id,
        missingTieA.id
    ],
    'Session lineage must rank first, intact/forked workspaces must stay independent, and partial fallbacks must rank last.'
);
assert.deepEqual(collapsedCandidates[0].memberIds, [intact.id, partial.id]);
assert.equal(collapsedCandidates[0].sessionMatch, true);
assert.equal(collapsedCandidates.filter((candidate) => candidate.record.forkedFrom === intact.id).length, 3);
assert.deepEqual(
    collapsedCandidates.at(-1).memberIds,
    [missingOld.id, missingTieA.id, missingTieB.id].sort(),
    'A missing intact source must expose only the deterministic newest member of that partial lineage.'
);
assert.ok(compareWorkspaceRecoveryRecords(forkHigherRevision, forkA) < 0);

assert.deepEqual(
    collectOrphanWorkspaceAssetIds([source, fork], [{ id: 'asset-a' }, { id: 'asset-b' }, { id: 'asset-c' }]),
    ['asset-c']
);

const liveLease = { workspaceId: 'workspace-a', ownerId: 'owner-a', expiresAt: 2000 };
assert.deepEqual(evaluateWorkspaceLease(null, 'owner-a', 1000), { acquired: true, reason: 'free' });
assert.equal(evaluateWorkspaceLease(liveLease, 'owner-b', 1000).acquired, false);
assert.equal(evaluateWorkspaceLease(liveLease, 'owner-b', 2001).reason, 'expired');
assert.equal(evaluateWorkspaceLease(liveLease, 'owner-b', 1000, { force: true }).reason, 'forced');
assert.equal(assertWorkspaceLeaseOwnership(liveLease, 'owner-a', 1000).ownerId, 'owner-a');
assert.throws(
    () => assertWorkspaceLeaseOwnership(liveLease, 'owner-b', 1000),
    (error) => error.code === 'WORKSPACE_LEASE_LOST'
);

assert.deepEqual(decideWorkspaceStartup({ startClean: true, newWorkspaceId: 'new-a' }), {
    action: 'fresh', sourceWorkspaceId: null, targetWorkspaceId: 'new-a'
});
assert.deepEqual(decideWorkspaceStartup({
    sessionWorkspaceId: 'workspace-a',
    sessionRecord: source,
    sessionHasLiveOwner: false,
    newWorkspaceId: 'new-b'
}), {
    action: 'offer-restore', sourceWorkspaceId: 'workspace-a', targetWorkspaceId: 'workspace-a'
});
assert.deepEqual(decideWorkspaceStartup({
    sessionWorkspaceId: 'workspace-a',
    sessionRecord: source,
    sessionHasLiveOwner: true,
    newWorkspaceId: 'new-c'
}), {
    action: 'offer-fork', sourceWorkspaceId: 'workspace-a', targetWorkspaceId: 'new-c'
});
assert.deepEqual(decideWorkspaceStartup({ latestRecord: source, newWorkspaceId: 'new-d' }), {
    action: 'offer-restore', sourceWorkspaceId: 'workspace-a', targetWorkspaceId: 'new-d'
});

const blob = new Blob(['solid cube'], { type: 'model/stl' });
const asset = normalizeWorkspaceAsset({
    id: 'asset-a',
    name: 'cube.stl',
    blob,
    size: blob.size,
    lastModified: 123
}, { now: 456 });
assert.equal(asset.extension, 'stl');
assert.equal(asset.size, blob.size);
assert.throws(
    () => normalizeWorkspaceAsset({ id: 'asset-b', name: 'bad.stl', blob, size: blob.size + 1 }),
    (error) => error.code === 'INVALID_ASSET'
);
assert.throws(
    () => normalizeWorkspaceRecord({ id: 'bad', schemaVersion: 2, state: {} }),
    (error) => error.code === 'UNSUPPORTED_WORKSPACE_SCHEMA'
);
assert.equal(isWorkspaceQuotaError({ name: 'QuotaExceededError' }), true);
assert.equal(isWorkspaceQuotaError(new Error('storage quota is full')), true);
assert.equal(isWorkspaceQuotaError(new Error('network')), false);

console.log('Workspace recovery core OK: schema, candidate ordering, incomplete-recovery provenance, immutable assets, forks, leases, startup decisions and orphan detection');
