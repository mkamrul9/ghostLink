export async function parseEntry(entry, path = '') {
    if (entry.isFile) {
        const file = await new Promise((resolve, reject) => entry.file(resolve, reject));
        file.fullPath = path + file.name;
        return [file];
    }
    if (!entry.isDirectory) return [];
    const reader = entry.createReader();
    const files = [];
    // Chromium returns at most 100 entries per call; keep reading until exhausted.
    while (true) {
        const entries = await new Promise((resolve, reject) => reader.readEntries(resolve, reject));
        if (!entries.length) break;
        for (const child of entries) files.push(...await parseEntry(child, `${path}${entry.name}/`));
    }
    return files;
}
export async function handleDroppedItems(dataTransfer) {
    // Capture handles synchronously before the drag data store becomes inaccessible.
    const items = [...(dataTransfer.items || [])].filter(item => item.kind === 'file');
    const entries = items.map(item => ({ entry: item.webkitGetAsEntry?.(), file: item.getAsFile?.() }));
    if (!entries.length) return [...(dataTransfer.files || [])];
    const files = [];
    for (const { entry, file } of entries) {
        if (entry) files.push(...await parseEntry(entry));
        else if (file) files.push(file);
    }
    return files;
}
