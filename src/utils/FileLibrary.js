export function safePath(input) {
    if (typeof input !== 'string' || input.length > 4096) throw new Error('Use a valid file or folder path with at most 4096 characters.');
    const value = String(input).replaceAll('\\', '/');
    if (!value || value.startsWith('/') || /^[a-z]:/i.test(value)) throw new Error('Use a file or folder name, without a drive or leading slash.');
    const parts = value.split('/').filter(Boolean);
    if (parts.length > 128) throw new Error('Use no more than 128 nested folders.');
    if (parts.some(part => part === '.' || part === '..' || /[\x00-\x1f]/.test(part))) throw new Error('This folder name is not allowed.');
    return parts.join('/');
}
export function filePath(file) { return safePath(file.mysticPath || file.webkitRelativePath || file.fullPath || file.name); }
export function directoryFile(path) { const file = new File([], safePath(path).split('/').at(-1), { type: 'application/x-mystic-directory' }); file.mysticDirectory = true; return namedFile(file, path); }
export function namedFile(file, path, id = file.mysticId || crypto.randomUUID()) {
    const normalized = safePath(path);
    const copy = new File([file], normalized.split('/').at(-1), { type: file.type, lastModified: file.lastModified });
    copy.mysticPath = normalized;
    copy.mysticId = id;
    copy.mysticDirectory = Boolean(file.mysticDirectory);
    return copy;
}
function uniquePath(path, used) {
    let candidate = path;
    const dot = path.lastIndexOf('.');
    const slash = path.lastIndexOf('/');
    const ext = dot > slash + 1 ? path.slice(dot) : '';
    const base = ext ? path.slice(0, -ext.length) : path;
    let count = 2;
    while (used.has(candidate.toLowerCase())) candidate = `${base} (${count++})${ext}`;
    used.add(candidate.toLowerCase());
    return candidate;
}
export function addFiles(current, incoming) {
    const used = new Set(current.map(file => filePath(file).toLowerCase()));
    const added = [];
    for (const file of incoming) {
        const path = filePath(file);
        if (current.some(existing => filePath(existing) === path && existing.size === file.size && (file.mysticDirectory && existing.mysticDirectory || existing.lastModified === file.lastModified))) continue;
        added.push(namedFile(file, uniquePath(path, used)));
    }
    return added;
}
export function commonFolder(paths) {
    if (!paths.length) return '';
    const parts = paths.map(path => safePath(path).split('/').slice(0, -1));
    let length = 0;
    while (length < parts[0].length && parts.every(path => path[length] === parts[0][length])) length++;
    return parts[0].slice(0, length).join('/');
}
export function movePaths(entries, ids, destination) {
    const selected = entries.filter(entry => ids.includes(String(entry.id)));
    const parent = commonFolder(selected.map(entry => entry.path));
    const folder = destination.trim() ? safePath(destination.trim()) : '';
    const used = new Set(entries.filter(entry => !ids.includes(String(entry.id))).map(entry => entry.path.toLowerCase()));
    return selected.map(entry => {
        const rest = parent ? entry.path.slice(parent.length + 1) : entry.path;
        return { id: entry.id, path: uniquePath(folder ? `${folder}/${rest}` : rest, used) };
    });
}
export function renamedPath(path, name) {
    const leaf = name.trim();
    if (!leaf || leaf === '.' || leaf === '..' || /[\\/\x00-\x1f]/.test(leaf)) throw new Error('Enter a file name without slashes.');
    const parent = path.includes('/') ? path.slice(0, path.lastIndexOf('/') + 1) : '';
    return safePath(parent + leaf);
}
export function fileTree(entries) {
    const root = { folders: new Map(), files: [] };
    for (const entry of entries) {
        const parts = safePath(entry.path).split('/');
        let node = root;
        for (const name of parts.slice(0, entry.directory ? undefined : -1)) {
            if (!node.folders.has(name)) node.folders.set(name, { name, folders: new Map(), files: [] });
            node = node.folders.get(name);
        }
        if (entry.directory) (node.directories ||= []).push(entry); else node.files.push(entry);
    }
    return root;
}
export function nestedFiles(node) { return [...(node.directories || []), ...node.files, ...[...node.folders.values()].flatMap(nestedFiles)]; }
