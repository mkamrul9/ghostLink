const active = new Set(['queued', 'sending', 'receiving']);
export function trimTransferHistory(items, limit = 200) {
    let remaining = limit;
    const result = [];
    for (let index = items.length - 1; index >= 0; index--) {
        if (active.has(items[index].status) || remaining-- > 0) result.push(items[index]);
    }
    return result.reverse();
}
