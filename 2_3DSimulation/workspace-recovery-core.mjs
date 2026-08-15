export const WORKSPACE_SCHEMA_VERSION = 1;
export const WORKSPACE_DB_NAME = 'inorobot-3d-simulation-workspaces';
export const WORKSPACE_DB_VERSION = 1;
export const WORKSPACE_STORE_NAME = 'workspaces';
export const WORKSPACE_ASSET_STORE_NAME = 'assets';
export const WORKSPACE_LEASE_STORE_NAME = 'leases';
export const WORKSPACE_SESSION_KEY = 'inorobot.3d-simulation.workspace-id.v1';
export const WORKSPACE_START_CLEAN_SESSION_KEY = 'inorobot.3d-simulation.start-clean.v1';
export const WORKSPACE_CHANNEL_NAME = 'inorobot.3d-simulation.workspace.v1';
export const WORKSPACE_LEASE_DURATION_MS = 15000;

const isObject = (value) => Boolean(value) && typeof value === 'object' && !Array.isArray(value);
const finiteTimestamp = (value, fallback) => Number.isFinite(Number(value)) && Number(value) >= 0
    ? Number(value)
    : fallback;

function workspaceError(message, code) {
    const error = new Error(message);
    error.code = code;
    return error;
}

export function createWorkspaceId(prefix = 'workspace') {
    const uuid = globalThis.crypto?.randomUUID?.()
        || `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}-${Math.random().toString(36).slice(2)}`;
    return `${String(prefix || 'workspace')}-${uuid}`;
}

export function normalizeWorkspaceRecord(input, { now = Date.now() } = {}) {
    if (!isObject(input)) throw workspaceError('Workspace record must be an object.', 'INVALID_WORKSPACE');
    const id = String(input.id || '').trim();
    if (!id) throw workspaceError('Workspace id is required.', 'INVALID_WORKSPACE');
    const schemaVersion = Number(input.schemaVersion ?? WORKSPACE_SCHEMA_VERSION);
    if (schemaVersion !== WORKSPACE_SCHEMA_VERSION) {
        throw workspaceError(`Unsupported workspace schema: ${schemaVersion}`, 'UNSUPPORTED_WORKSPACE_SCHEMA');
    }
    if (!isObject(input.state)) throw workspaceError('Workspace state must be an object.', 'INVALID_WORKSPACE');
    const createdAt = finiteTimestamp(input.createdAt, now);
    const updatedAt = Math.max(createdAt, finiteTimestamp(input.updatedAt, createdAt));
    const revision = Number.isInteger(Number(input.revision)) && Number(input.revision) >= 0
        ? Number(input.revision)
        : 0;
    const forkedFrom = String(input.forkedFrom || '').trim() || null;
    const incompleteRecoveryFrom = String(input.incompleteRecoveryFrom || '').trim() || null;
    return {
        id,
        schemaVersion: WORKSPACE_SCHEMA_VERSION,
        revision,
        createdAt,
        updatedAt,
        archived: Boolean(input.archived),
        forkedFrom: forkedFrom === id ? null : forkedFrom,
        incompleteRecoveryFrom: incompleteRecoveryFrom === id ? null : incompleteRecoveryFrom,
        state: structuredClone(input.state)
    };
}

export function compareWorkspaceRecoveryRecords(left, right) {
    const timestampOrder = Number(right?.updatedAt) - Number(left?.updatedAt);
    if (timestampOrder) return timestampOrder;
    const revisionOrder = Number(right?.revision) - Number(left?.revision);
    if (revisionOrder) return revisionOrder;
    const leftId = String(left?.id || '');
    const rightId = String(right?.id || '');
    return leftId < rightId ? -1 : leftId > rightId ? 1 : 0;
}

function resolveWorkspaceRecoveryLineage(record, recordById) {
    const path = [];
    const visitedAt = new Map();
    let current = record;
    while (current?.incompleteRecoveryFrom) {
        if (visitedAt.has(current.id)) {
            const cycleIds = path.slice(visitedAt.get(current.id))
                .map((entry) => String(entry.id))
                .sort();
            return {
                representative: null,
                fallbackKey: `cycle:${cycleIds.join('|')}`
            };
        }
        visitedAt.set(current.id, path.length);
        path.push(current);
        const sourceId = String(current.incompleteRecoveryFrom);
        const source = recordById.get(sourceId);
        if (!source) {
            return { representative: null, fallbackKey: `partial:${sourceId}` };
        }
        current = source;
    }
    return { representative: current, fallbackKey: null };
}

export function collapseWorkspaceRecoveryRecords(records, { sessionWorkspaceId = null } = {}) {
    const candidates = (Array.isArray(records) ? records : [])
        .filter((record) => record?.id);
    const recordById = new Map(candidates.map((record) => [String(record.id), record]));
    const groups = new Map();
    candidates.forEach((record) => {
        const lineage = resolveWorkspaceRecoveryLineage(record, recordById);
        const representative = lineage.representative || record;
        const key = lineage.representative
            ? `workspace:${representative.id}`
            : lineage.fallbackKey || `workspace:${record.id}`;
        const existing = groups.get(key);
        const memberIds = new Set(existing?.memberIds || []);
        memberIds.add(String(record.id));
        memberIds.add(String(representative.id));
        if (!existing || compareWorkspaceRecoveryRecords(representative, existing.record) < 0) {
            groups.set(key, {
                record: representative,
                incompleteFallback: !lineage.representative,
                memberIds: [...memberIds]
            });
        } else {
            existing.memberIds = [...memberIds];
        }
    });
    const sessionId = String(sessionWorkspaceId || '');
    return [...groups.values()]
        .map((candidate) => ({
            ...candidate,
            memberIds: [...candidate.memberIds].sort(),
            sessionMatch: Boolean(sessionId && candidate.memberIds.includes(sessionId))
        }))
        .sort((left, right) => (
            Number(right.sessionMatch) - Number(left.sessionMatch)
            || Number(left.incompleteFallback) - Number(right.incompleteFallback)
            || compareWorkspaceRecoveryRecords(left.record, right.record)
        ));
}

export function normalizeWorkspaceAsset(input, { now = Date.now() } = {}) {
    if (!isObject(input)) throw workspaceError('Workspace asset must be an object.', 'INVALID_ASSET');
    const id = String(input.id || input.assetId || '').trim();
    const name = String(input.name || '').trim();
    const blob = input.blob;
    if (!id || !name || !blob || !Number.isFinite(Number(blob.size))) {
        throw workspaceError('Workspace asset id, name and Blob are required.', 'INVALID_ASSET');
    }
    const size = Number(input.size ?? blob.size);
    if (!Number.isSafeInteger(size) || size < 0 || size !== Number(blob.size)) {
        throw workspaceError('Workspace asset size does not match its Blob.', 'INVALID_ASSET');
    }
    const extension = String(input.extension || name.split('.').pop() || '').trim().toLowerCase();
    return {
        id,
        schemaVersion: WORKSPACE_SCHEMA_VERSION,
        blob,
        name,
        type: String(input.type || blob.type || ''),
        size,
        extension,
        lastModified: finiteTimestamp(input.lastModified, now),
        createdAt: finiteTimestamp(input.createdAt, now),
        lastUsedAt: finiteTimestamp(input.lastUsedAt, now)
    };
}

export function collectWorkspaceAssetIds(input) {
    const state = isObject(input?.state) ? input.state : input;
    const ids = new Set(Array.isArray(state?.assetIds) ? state.assetIds.filter(Boolean).map(String) : []);
    const importedModels = Array.isArray(state?.importedModels) ? state.importedModels : [];
    importedModels.forEach((model) => {
        const id = String(model?.assetId || '').trim();
        if (id) ids.add(id);
    });
    return [...ids].sort();
}

export function collectOrphanWorkspaceAssetIds(workspaces, assets) {
    const referenced = new Set();
    (Array.isArray(workspaces) ? workspaces : []).forEach((record) => {
        collectWorkspaceAssetIds(record).forEach((id) => referenced.add(id));
    });
    return (Array.isArray(assets) ? assets : [])
        .map((asset) => String(asset?.id || asset?.assetId || '').trim())
        .filter((id) => id && !referenced.has(id))
        .sort();
}

export function evaluateWorkspaceLease(existingLease, ownerId, now = Date.now(), { force = false } = {}) {
    const owner = String(ownerId || '').trim();
    if (!owner) throw workspaceError('Workspace owner id is required.', 'INVALID_OWNER');
    if (!existingLease || force || existingLease.ownerId === owner || Number(existingLease.expiresAt) <= now) {
        return { acquired: true, reason: !existingLease ? 'free' : force ? 'forced' : existingLease.ownerId === owner ? 'owned' : 'expired' };
    }
    return { acquired: false, reason: 'live-owner', lease: structuredClone(existingLease) };
}

export function assertWorkspaceLeaseOwnership(lease, ownerId, now = Date.now()) {
    const owner = String(ownerId || '').trim();
    if (!lease || lease.ownerId !== owner) {
        throw workspaceError('Workspace ownership was lost to another window.', 'WORKSPACE_LEASE_LOST');
    }
    // An expired lease is still safe for its recorded owner until another
    // owner atomically replaces it. This avoids background-tab timer
    // throttling creating a false ownership loss.
    return {
        ...lease,
        heartbeatAt: now,
        expiresAt: now + WORKSPACE_LEASE_DURATION_MS
    };
}

export function decideWorkspaceStartup({
    sessionWorkspaceId = null,
    sessionRecord = null,
    latestRecord = null,
    sessionHasLiveOwner = false,
    startClean = false,
    newWorkspaceId = createWorkspaceId()
} = {}) {
    if (startClean) return { action: 'fresh', sourceWorkspaceId: null, targetWorkspaceId: newWorkspaceId };
    if (sessionWorkspaceId && sessionRecord) {
        return {
            action: sessionHasLiveOwner ? 'offer-fork' : 'offer-restore',
            sourceWorkspaceId: sessionRecord.id,
            targetWorkspaceId: sessionHasLiveOwner ? newWorkspaceId : sessionRecord.id
        };
    }
    if (latestRecord) {
        return {
            action: 'offer-restore',
            sourceWorkspaceId: latestRecord.id,
            targetWorkspaceId: newWorkspaceId
        };
    }
    return { action: 'fresh', sourceWorkspaceId: null, targetWorkspaceId: newWorkspaceId };
}

export function createForkedWorkspaceRecord(source, targetId, { now = Date.now() } = {}) {
    const normalized = normalizeWorkspaceRecord(source, { now });
    const id = String(targetId || '').trim();
    if (!id || id === normalized.id) throw workspaceError('A fork requires a different target workspace id.', 'INVALID_FORK');
    return {
        ...normalized,
        id,
        revision: 0,
        createdAt: now,
        updatedAt: now,
        archived: false,
        forkedFrom: normalized.id,
        state: structuredClone(normalized.state)
    };
}

export function getWorkspaceSummary(record) {
    const state = record?.state || {};
    const robots = Array.isArray(state.motionProject?.robots) ? state.motionProject.robots.length : 0;
    const imported = Array.isArray(state.importedModels) ? state.importedModels.length : 0;
    const catalog = Array.isArray(state.catalogModels) ? state.catalogModels.length : 0;
    const olpProjects = Array.isArray(state.olpProject?.files) && state.olpProject.files.length ? 1 : 0;
    return { robots, models: imported + catalog, olpProjects };
}

export function isWorkspaceQuotaError(error) {
    return error?.name === 'QuotaExceededError'
        || error?.code === 22
        || /quota|storage.*full/i.test(String(error?.message || ''));
}

function requestResult(request) {
    return new Promise((resolve, reject) => {
        request.addEventListener('success', () => resolve(request.result), { once: true });
        request.addEventListener('error', () => reject(request.error || workspaceError('IndexedDB request failed.', 'IDB_ERROR')), { once: true });
    });
}

function transactionDone(transaction) {
    return new Promise((resolve, reject) => {
        transaction.addEventListener('complete', () => resolve(), { once: true });
        transaction.addEventListener('abort', () => reject(transaction.error || workspaceError('IndexedDB transaction aborted.', 'IDB_ABORT')), { once: true });
        transaction.addEventListener('error', () => reject(transaction.error || workspaceError('IndexedDB transaction failed.', 'IDB_ERROR')), { once: true });
    });
}

export class WorkspaceRecoveryStore {
    constructor(indexedDb = globalThis.indexedDB, { dbName = WORKSPACE_DB_NAME } = {}) {
        this.indexedDb = indexedDb;
        this.dbName = dbName;
        this.dbPromise = null;
    }

    async open() {
        if (this.dbPromise) return this.dbPromise;
        if (!this.indexedDb) throw workspaceError('IndexedDB is unavailable.', 'IDB_UNAVAILABLE');
        this.dbPromise = new Promise((resolve, reject) => {
            const request = this.indexedDb.open(this.dbName, WORKSPACE_DB_VERSION);
            request.addEventListener('upgradeneeded', () => {
                const db = request.result;
                if (!db.objectStoreNames.contains(WORKSPACE_STORE_NAME)) {
                    const store = db.createObjectStore(WORKSPACE_STORE_NAME, { keyPath: 'id' });
                    store.createIndex('updatedAt', 'updatedAt');
                }
                if (!db.objectStoreNames.contains(WORKSPACE_ASSET_STORE_NAME)) {
                    const store = db.createObjectStore(WORKSPACE_ASSET_STORE_NAME, { keyPath: 'id' });
                    store.createIndex('lastUsedAt', 'lastUsedAt');
                }
                if (!db.objectStoreNames.contains(WORKSPACE_LEASE_STORE_NAME)) {
                    const store = db.createObjectStore(WORKSPACE_LEASE_STORE_NAME, { keyPath: 'workspaceId' });
                    store.createIndex('expiresAt', 'expiresAt');
                }
            });
            request.addEventListener('success', () => {
                const db = request.result;
                db.addEventListener('versionchange', () => db.close(), { once: true });
                resolve(db);
            }, { once: true });
            request.addEventListener('error', () => {
                this.dbPromise = null;
                reject(request.error || workspaceError('Unable to open workspace storage.', 'IDB_OPEN_FAILED'));
            }, { once: true });
            request.addEventListener('blocked', () => {
                this.dbPromise = null;
                reject(workspaceError('Workspace storage upgrade is blocked by another window.', 'IDB_BLOCKED'));
            }, { once: true });
        });
        return this.dbPromise;
    }

    async close() {
        if (!this.dbPromise) return;
        try { (await this.dbPromise)?.close(); } finally { this.dbPromise = null; }
    }

    async getWorkspace(id) {
        if (!id) return null;
        const db = await this.open();
        const tx = db.transaction(WORKSPACE_STORE_NAME, 'readonly');
        const value = await requestResult(tx.objectStore(WORKSPACE_STORE_NAME).get(String(id)));
        await transactionDone(tx);
        return value ? normalizeWorkspaceRecord(value) : null;
    }

    async listWorkspaces({ includeArchived = false } = {}) {
        const db = await this.open();
        const tx = db.transaction(WORKSPACE_STORE_NAME, 'readonly');
        const values = await requestResult(tx.objectStore(WORKSPACE_STORE_NAME).getAll());
        await transactionDone(tx);
        const records = [];
        values.forEach((value) => {
            try {
                records.push(normalizeWorkspaceRecord(value));
            } catch {
                // Keep malformed records untouched for possible manual
                // recovery, but never let one record hide every valid choice.
            }
        });
        return records
            .filter((value) => includeArchived || !value.archived)
            .sort((a, b) => b.updatedAt - a.updatedAt || b.revision - a.revision);
    }

    async getLatestWorkspace(options = {}) {
        return (await this.listWorkspaces(options))[0] || null;
    }

    async putWorkspace(input) {
        const record = normalizeWorkspaceRecord(input);
        const db = await this.open();
        const tx = db.transaction(WORKSPACE_STORE_NAME, 'readwrite');
        tx.objectStore(WORKSPACE_STORE_NAME).put(record);
        await transactionDone(tx);
        return record;
    }

    async saveWorkspaceWithLease(input, {
        ownerId,
        expectedRevision = null,
        now = Date.now(),
        leaseDurationMs = WORKSPACE_LEASE_DURATION_MS
    } = {}) {
        const record = normalizeWorkspaceRecord(input, { now });
        const db = await this.open();
        const tx = db.transaction([WORKSPACE_STORE_NAME, WORKSPACE_LEASE_STORE_NAME], 'readwrite');
        const workspaces = tx.objectStore(WORKSPACE_STORE_NAME);
        const leases = tx.objectStore(WORKSPACE_LEASE_STORE_NAME);
        try {
            const [current, lease] = await Promise.all([
                requestResult(workspaces.get(record.id)),
                requestResult(leases.get(record.id))
            ]);
            assertWorkspaceLeaseOwnership(lease, ownerId, now);
            const currentRevision = Number(current?.revision) || 0;
            if (expectedRevision !== null && Number(expectedRevision) !== currentRevision) {
                throw workspaceError('Workspace revision changed in another window.', 'WORKSPACE_REVISION_CONFLICT');
            }
            const saved = {
                ...record,
                revision: currentRevision + 1,
                createdAt: current?.createdAt || record.createdAt || now,
                updatedAt: now
            };
            workspaces.put(saved);
            leases.put({
                workspaceId: record.id,
                ownerId: String(ownerId),
                heartbeatAt: now,
                expiresAt: now + leaseDurationMs
            });
            await transactionDone(tx);
            return saved;
        } catch (error) {
            try { tx.abort(); } catch { }
            throw error;
        }
    }

    async getLease(workspaceId) {
        const db = await this.open();
        const tx = db.transaction(WORKSPACE_LEASE_STORE_NAME, 'readonly');
        const lease = await requestResult(tx.objectStore(WORKSPACE_LEASE_STORE_NAME).get(String(workspaceId)));
        await transactionDone(tx);
        return lease || null;
    }

    async acquireLease(workspaceId, ownerId, {
        now = Date.now(),
        leaseDurationMs = WORKSPACE_LEASE_DURATION_MS,
        force = false
    } = {}) {
        const id = String(workspaceId || '').trim();
        const owner = String(ownerId || '').trim();
        if (!id || !owner) throw workspaceError('Workspace and owner ids are required.', 'INVALID_OWNER');
        const db = await this.open();
        const tx = db.transaction(WORKSPACE_LEASE_STORE_NAME, 'readwrite');
        const store = tx.objectStore(WORKSPACE_LEASE_STORE_NAME);
        try {
            const existing = await requestResult(store.get(id));
            const decision = evaluateWorkspaceLease(existing, owner, now, { force });
            if (!decision.acquired) {
                await transactionDone(tx);
                return decision;
            }
            const lease = { workspaceId: id, ownerId: owner, heartbeatAt: now, expiresAt: now + leaseDurationMs };
            store.put(lease);
            await transactionDone(tx);
            return { acquired: true, reason: decision.reason, lease };
        } catch (error) {
            try { tx.abort(); } catch { }
            throw error;
        }
    }

    async renewLease(workspaceId, ownerId, options = {}) {
        const result = await this.acquireLease(workspaceId, ownerId, options);
        if (!result.acquired) throw workspaceError('Workspace ownership was lost to another window.', 'WORKSPACE_LEASE_LOST');
        return result.lease;
    }

    async releaseLease(workspaceId, ownerId) {
        if (!workspaceId || !ownerId) return false;
        const db = await this.open();
        const tx = db.transaction(WORKSPACE_LEASE_STORE_NAME, 'readwrite');
        const store = tx.objectStore(WORKSPACE_LEASE_STORE_NAME);
        const lease = await requestResult(store.get(String(workspaceId)));
        if (lease?.ownerId === String(ownerId)) store.delete(String(workspaceId));
        await transactionDone(tx);
        return lease?.ownerId === String(ownerId);
    }

    async forkWorkspace(sourceWorkspaceId, targetWorkspaceId, { ownerId = null, now = Date.now() } = {}) {
        const source = await this.getWorkspace(sourceWorkspaceId);
        if (!source) throw workspaceError('The source workspace no longer exists.', 'WORKSPACE_NOT_FOUND');
        const fork = createForkedWorkspaceRecord(source, targetWorkspaceId, { now });
        const db = await this.open();
        const stores = ownerId
            ? [WORKSPACE_STORE_NAME, WORKSPACE_LEASE_STORE_NAME]
            : [WORKSPACE_STORE_NAME];
        const tx = db.transaction(stores, 'readwrite');
        const workspaceStore = tx.objectStore(WORKSPACE_STORE_NAME);
        const existing = await requestResult(workspaceStore.get(fork.id));
        if (existing) {
            try { tx.abort(); } catch { }
            throw workspaceError('The target workspace already exists.', 'WORKSPACE_ALREADY_EXISTS');
        }
        workspaceStore.put(fork);
        if (ownerId) {
            tx.objectStore(WORKSPACE_LEASE_STORE_NAME).put({
                workspaceId: fork.id,
                ownerId: String(ownerId),
                heartbeatAt: now,
                expiresAt: now + WORKSPACE_LEASE_DURATION_MS
            });
        }
        await transactionDone(tx);
        return fork;
    }

    async archiveWorkspace(workspaceId, archived = true, {
        expectedRevision = null,
        requireUnleased = false,
        now = Date.now()
    } = {}) {
        const id = String(workspaceId || '').trim();
        if (!id) return null;
        const db = await this.open();
        const tx = db.transaction([WORKSPACE_STORE_NAME, WORKSPACE_LEASE_STORE_NAME], 'readwrite');
        const workspaces = tx.objectStore(WORKSPACE_STORE_NAME);
        const leases = tx.objectStore(WORKSPACE_LEASE_STORE_NAME);
        try {
            const [current, lease] = await Promise.all([
                requestResult(workspaces.get(id)),
                requestResult(leases.get(id))
            ]);
            if (!current) {
                await transactionDone(tx);
                return null;
            }
            if (expectedRevision !== null && Number(expectedRevision) !== Number(current.revision)) {
                throw workspaceError('Workspace revision changed before it could be archived.', 'WORKSPACE_REVISION_CONFLICT');
            }
            if (requireUnleased && lease && Number(lease.expiresAt) > now) {
                throw workspaceError('A live window owns the workspace being archived.', 'WORKSPACE_LEASE_ACTIVE');
            }
            const record = normalizeWorkspaceRecord({
                ...current,
                archived: Boolean(archived),
                updatedAt: now
            }, { now });
            workspaces.put(record);
            await transactionDone(tx);
            return record;
        } catch (error) {
            try { tx.abort(); } catch { }
            throw error;
        }
    }

    async pruneArchivedWorkspaces({ keep = 1 } = {}) {
        const retainedCount = Math.max(0, Math.trunc(Number(keep) || 0));
        const db = await this.open();
        const tx = db.transaction([WORKSPACE_STORE_NAME, WORKSPACE_LEASE_STORE_NAME], 'readwrite');
        const workspaces = tx.objectStore(WORKSPACE_STORE_NAME);
        const leases = tx.objectStore(WORKSPACE_LEASE_STORE_NAME);
        const values = await requestResult(workspaces.getAll());
        const archived = values.filter((record) => record?.archived && record?.id)
            .sort((left, right) => Number(right.updatedAt) - Number(left.updatedAt));
        const removedIds = archived.slice(retainedCount).map((record) => String(record.id));
        removedIds.forEach((id) => {
            workspaces.delete(id);
            leases.delete(id);
        });
        await transactionDone(tx);
        return removedIds;
    }

    async deleteWorkspace(workspaceId, { ownerId = null } = {}) {
        const id = String(workspaceId || '').trim();
        if (!id) return false;
        const db = await this.open();
        const tx = db.transaction([WORKSPACE_STORE_NAME, WORKSPACE_LEASE_STORE_NAME], 'readwrite');
        const leases = tx.objectStore(WORKSPACE_LEASE_STORE_NAME);
        if (ownerId) {
            const lease = await requestResult(leases.get(id));
            if (lease && lease.ownerId !== String(ownerId)) {
                try { tx.abort(); } catch { }
                throw workspaceError('Workspace ownership was lost to another window.', 'WORKSPACE_LEASE_LOST');
            }
        }
        tx.objectStore(WORKSPACE_STORE_NAME).delete(id);
        leases.delete(id);
        await transactionDone(tx);
        return true;
    }

    async putAsset(input) {
        const asset = normalizeWorkspaceAsset(input);
        const db = await this.open();
        const tx = db.transaction(WORKSPACE_ASSET_STORE_NAME, 'readwrite');
        const store = tx.objectStore(WORKSPACE_ASSET_STORE_NAME);
        const existing = await requestResult(store.get(asset.id));
        if (existing && (existing.size !== asset.size || existing.name !== asset.name)) {
            try { tx.abort(); } catch { }
            throw workspaceError('An immutable workspace asset id is already in use.', 'ASSET_ID_CONFLICT');
        }
        store.put(existing ? { ...existing, lastUsedAt: asset.lastUsedAt } : asset);
        await transactionDone(tx);
        return existing ? { ...existing, lastUsedAt: asset.lastUsedAt } : asset;
    }

    async getAsset(assetId, { touch = false } = {}) {
        const db = await this.open();
        const tx = db.transaction(WORKSPACE_ASSET_STORE_NAME, touch ? 'readwrite' : 'readonly');
        const store = tx.objectStore(WORKSPACE_ASSET_STORE_NAME);
        const asset = await requestResult(store.get(String(assetId)));
        if (asset && touch) {
            asset.lastUsedAt = Date.now();
            store.put(asset);
        }
        await transactionDone(tx);
        return asset || null;
    }

    async listAssets() {
        const db = await this.open();
        const tx = db.transaction(WORKSPACE_ASSET_STORE_NAME, 'readonly');
        const assets = await requestResult(tx.objectStore(WORKSPACE_ASSET_STORE_NAME).getAll());
        await transactionDone(tx);
        return assets;
    }

    async collectOrphanAssetIds() {
        const [workspaces, assets] = await Promise.all([
            this.listWorkspaces({ includeArchived: true }),
            this.listAssets()
        ]);
        return collectOrphanWorkspaceAssetIds(workspaces, assets);
    }

    async deleteOrphanAssets({ now = Date.now(), gracePeriodMs = 600000 } = {}) {
        const db = await this.open();
        const tx = db.transaction([WORKSPACE_STORE_NAME, WORKSPACE_ASSET_STORE_NAME], 'readwrite');
        const workspaceStore = tx.objectStore(WORKSPACE_STORE_NAME);
        const assetStore = tx.objectStore(WORKSPACE_ASSET_STORE_NAME);
        const [workspaces, assets] = await Promise.all([
            requestResult(workspaceStore.getAll()),
            requestResult(assetStore.getAll())
        ]);
        const referenced = new Set();
        workspaces.forEach((record) => {
            try {
                collectWorkspaceAssetIds(record).forEach((id) => referenced.add(id));
            } catch { }
        });
        const cutoff = now - Math.max(0, Number(gracePeriodMs) || 0);
        const ids = assets.filter((asset) => {
            const id = String(asset?.id || '').trim();
            const touchedAt = Math.max(Number(asset?.lastUsedAt) || 0, Number(asset?.createdAt) || 0);
            return id && !referenced.has(id) && touchedAt <= cutoff;
        }).map((asset) => String(asset.id));
        if (!ids.length) {
            await transactionDone(tx);
            return [];
        }
        ids.forEach((id) => assetStore.delete(id));
        await transactionDone(tx);
        return ids;
    }
}
