import test from 'node:test';
import assert from 'node:assert/strict';
import { unzipSync, strFromU8 } from 'fflate';
import { addFiles, filePath, namedFile, movePaths, commonFolder, renamedPath, safePath, fileTree, nestedFiles } from '../src/utils/FileLibrary.js';
import { createZip } from '../src/utils/ZipDownload.js';
import { assistantReply } from '../src/utils/HelpAssistant.js';
import { createRoomCode, normalizeRoomCode } from '../src/utils/RoomCode.js';
import { inviteUrl, shareTargets } from '../src/utils/ShareRoom.js';

test('file organization preserves bytes, IDs and nested folder paths', async () => {
    const one = namedFile(new File(['one'], 'a.txt', { type: 'text/plain', lastModified: 15 }), 'Project/one/a.txt');
    const two = namedFile(new File(['two'], 'b.txt'), 'Project/two/b.txt');
    const entries = [one, two].map(file => ({ id: file.mysticId, path: filePath(file) }));
    const moved = movePaths(entries, entries.map(file => file.id), 'Holiday');
    assert.deepEqual(moved.map(file => file.path), ['Holiday/one/a.txt', 'Holiday/two/b.txt']);
    const renamed = namedFile(one, renamedPath(moved[0].path, 'renamed.txt'));
    assert.equal(renamed.mysticId, one.mysticId); assert.equal(await renamed.text(), 'one'); assert.equal(renamed.type, 'text/plain'); assert.equal(renamed.lastModified, 15);
    assert.equal(commonFolder(['A/X/B/a.txt', 'A/Y/B/b.txt']), 'A');
    assert.equal(nestedFiles(fileTree(entries)).length, 2);
});
test('adding and moving files prevents path collisions and traversal', () => {
    const file = new File(['x'], 'a.txt', { lastModified: 12 });
    const first = addFiles([], [file]);
    assert.equal(addFiles(first, [file]).length, 0);
    const collision = addFiles(first, [new File(['different'], 'a.txt', { lastModified: 13 })]);
    assert.equal(filePath(collision[0]), 'a (2).txt');
    const moves = movePaths([{ id: '1', path: 'one/a.txt' }, { id: '2', path: 'Target/a.txt' }], ['1'], 'Target');
    assert.equal(moves[0].path, 'Target/a (2).txt');
    for (const path of ['../secret', 'folder/../secret', '/absolute', 'C:\\file', 'folder/./file', 'folder/\0bad']) assert.throws(() => safePath(path));
    assert.throws(() => renamedPath('a.txt', '../evil'));
});
test('folder ZIP downloads are readable by an independent reader with correct paths, CRCs and contents', async () => {
    const entries = [
        { path: 'Holiday/day1/photo.txt', content: 'day one' },
        { path: 'Holiday/day2/photo.txt', content: 'day two' },
        { path: 'Holiday/empty.txt', content: '' },
        { path: 'Holiday/caf\u00e9.txt', content: 'unicode file' }
    ].map(file => ({ path: file.path, size: new Blob([file.content]).size, getBlob: async () => new Blob([file.content]) }));
    const zip = await createZip(entries);
    const restored = unzipSync(new Uint8Array(await zip.arrayBuffer()));
    assert.deepEqual(Object.keys(restored), entries.map(file => file.path));
    assert.equal(strFromU8(restored['Holiday/day2/photo.txt']), 'day two');
    assert.equal(restored['Holiday/empty.txt'].length, 0);
    assert.equal(strFromU8(restored['Holiday/caf\u00e9.txt']), 'unicode file');
    await assert.rejects(createZip([{ ...entries[0], path: '../escape.txt' }]), /not allowed/);
    await assert.rejects(createZip([entries[0], entries[0]]), /same folder path/);
    await assert.rejects(createZip([{ ...entries[0], size: 268435457 }]), /fewer files/);
});
test('helper proposes only named or selected files and never acts on a negative or ambiguous command', () => {
    const files = [
        { id: 'a', name: 'report.pdf', path: 'Work/report.pdf' },
        { id: 'b', name: 'photo.jpg', path: 'Trip/day1/photo.jpg' },
        { id: 'c', name: 'photo.jpg', path: 'Trip/day2/photo.jpg' }
    ];
    const context = { files, selected: ['a'], connected: true };
    assert.deepEqual(assistantReply('send report.pdf', context).action.ids, ['a']);
    assert.deepEqual(assistantReply('send selected files', context).action.ids, ['a']);
    assert.deepEqual(assistantReply('send all photos', context).action.ids, ['b', 'c']);
    assert.deepEqual(assistantReply('send folder Trip', context).action.ids, ['b', 'c']);
    assert.deepEqual(assistantReply('send Trip/day2/photo.jpg', context).action.ids, ['c']);
    assert.equal(assistantReply('send photo.jpg', context).action, undefined);
    assert.notEqual(assistantReply("don't send report.pdf", context).action?.type, 'send');
    assert.notEqual(assistantReply('send missing.pdf', context).action?.type, 'send');
    assert.equal(assistantReply('send report.pdf', { files: [] }).action.type, 'choose');
    assert.match(assistantReply('send report.pdf', { ...context, connected: false }).text, /Connect/);
    assert.match(assistantReply('are you AI?', context).text, /not a general AI/);
});
test('human-readable room codes retain 80 random bits and accept lowercase input', () => {
    const codes = new Set(Array.from({ length: 1000 }, createRoomCode));
    assert.equal(codes.size, 1000);
    for (const code of codes) { assert.match(code, /^[0-9A-HJKMNP-TV-Z]{4}(?:-[0-9A-HJKMNP-TV-Z]{4}){3}$/); assert.equal(normalizeRoomCode(code.toLowerCase()), code); }
    assert.equal(normalizeRoomCode('mystic-legacy-room'), 'mystic-legacy-room');
});
test('social share URLs carry the complete invite and code while preserving the room fragment', () => {
    const room = 'ABCD-EFGH-JKMN-PQRS';
    const url = inviteUrl(room, 'https://mystic.example/settings?view=help#other');
    assert.equal(url, `https://mystic.example/#room=${room}`);
    const links = shareTargets(room, url);
    assert.deepEqual(links.map(item => item.label), ['WhatsApp', 'Telegram', 'Email']);
    assert.ok(new URL(links[0].url).searchParams.get('text').includes(url));
    assert.equal(new URL(links[1].url).searchParams.get('url'), url);
    assert.ok(new URL(links[2].url).searchParams.get('body').includes(room));
});
