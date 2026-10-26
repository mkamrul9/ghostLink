// Encryption plus binary headers stay below the 64 KiB SCTP message limit.
export const CHUNK_SIZE = 60 * 1024;
export async function* createChunkGenerator(file, { startChunk = 0, chunkSize = CHUNK_SIZE } = {}) {
    for (let offset = startChunk * chunkSize; offset < file.size; offset += chunkSize) yield { buffer: await file.slice(offset, offset + chunkSize).arrayBuffer(), offset, totalSize: file.size, isDone: offset + chunkSize >= file.size };
}
