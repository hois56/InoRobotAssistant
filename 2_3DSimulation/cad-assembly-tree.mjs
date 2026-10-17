// Keep assembly folders separate from editable user groups and part indexes.
export function buildCadAssemblyTree(parts) {
    const root = { children: [], folders: new Map() };
    for (const part of parts) {
        let parent = root;
        for (const entry of part.userData?.cadAssemblyPath || []) {
            if (!entry || typeof entry.id !== 'string' || !entry.id) continue;
            let folder = parent.folders.get(entry.id);
            if (!folder) {
                folder = { id: entry.id, name: String(entry.name || entry.id), children: [], members: [], folders: new Map() };
                parent.folders.set(entry.id, folder);
                parent.children.push(folder);
            }
            folder.members.push(part);
            parent = folder;
        }
        parent.children.push({ part });
    }
    return root.children;
}
