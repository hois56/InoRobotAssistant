// Parent modelIds include all descendants, so existing selection/transform logic
// continues to operate on the complete assembly. Children partition its members.
export function normalizeModelGroupTree(groups, available, depth = 0) {
    if (depth > 8) return [];
    const used = new Set();
    return (Array.isArray(groups) ? groups : []).flatMap(group => {
        if (!group || typeof group.name !== 'string' || !group.name.trim() || !Array.isArray(group.modelIds)) return [];
        const modelIds = group.modelIds.filter(id => {
            if (!available.has(id) || used.has(id)) return false;
            used.add(id); return true;
        });
        if (!modelIds.length) return [];
        const children = normalizeModelGroupTree(group.children, new Set(modelIds), depth + 1);
        return [{ name: group.name.trim(), modelIds, collapsed: Boolean(group.collapsed),
            ...(typeof group.treeOrderId === 'string' ? { treeOrderId: group.treeOrderId } : {}),
            ...(children.length ? { children } : {}) }];
    });
}
export function walkModelGroups(groups, visit, path = []) {
    groups.forEach((group, index) => { const next = [...path, index]; visit(group, next); walkModelGroups(group.children || [], visit, next); });
}
export function modelGroupPath(groups, target) {
    let result = null; walkModelGroups(groups, (group, path) => { if (group === target) result = path; }); return result;
}
export function modelGroupAtPath(groups, path) {
    let group; for (const index of path) { group = groups?.[index]; groups = group?.children; } return group || null;
}
export function dissolveModelGroup(groups, target) {
    const path = modelGroupPath(groups, target); if (!path) return;
    const siblings = path.length === 1 ? groups : modelGroupAtPath(groups, path.slice(0,-1)).children;
    siblings.splice(path.at(-1), 1, ...(target.children || []));
}
export function moveModelsToGroup(groups, target, ids) {
    const path = modelGroupPath(groups, target); if (!path) return;
    const moved = new Set(ids); walkModelGroups(groups, group => { group.modelIds = group.modelIds.filter(id => !moved.has(id)); });
    for (let length = 1; length <= path.length; length++) modelGroupAtPath(groups, path.slice(0,length)).modelIds.push(...ids);
}
