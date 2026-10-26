import test from 'node:test';
import assert from 'node:assert/strict';
import { trimTransferHistory } from '../src/utils/TransferState.js';
test('large folder selections keep every queued or active transfer visible', () => {
    const complete = Array.from({ length: 300 }, (_, id) => ({ id, status: 'complete' }));
    const queued = Array.from({ length: 500 }, (_, index) => ({ id: 1000 + index, status: index === 0 ? 'sending' : 'queued' }));
    const result = trimTransferHistory([...complete, ...queued]);
    assert.equal(result.filter(item => item.status !== 'complete').length, 500);
    assert.equal(result.filter(item => item.status === 'complete').length, 200);
    assert.ok(result.some(item => item.id === 1000 && item.status === 'sending'));
});
test('finished history is bounded while ongoing receives are always kept', () => {
    const items = [{ id: 1, status: 'receiving' }, ...Array.from({ length: 500 }, (_, index) => ({ id: index + 2, status: 'complete' }))];
    const result = trimTransferHistory(items);
    assert.equal(result.length, 201); assert.equal(result[0].id, 1); assert.equal(result.at(-1).id, 501);
    assert.equal(trimTransferHistory(result.map(item => ({ ...item, status: 'complete' }))).length, 200);
});
