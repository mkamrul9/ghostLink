// 64KB is the optimal chunk size for WebRTC data channels
export const CHUNK_SIZE = 16 * 1024;

export async function* createChunkGenerator(file) {
    let offset = 0;

    // Keep looping until we've read the entire file
    while (offset < file.size) {
        // 1. Slice a tiny piece off the main file. 
        // This does NOT read it into memory yet; it just creates a reference.
        const chunk = file.slice(offset, offset + CHUNK_SIZE);

        // 2. Actually read this specific chunk into memory as raw binary data
        const buffer = await chunk.arrayBuffer();

        // 3. YIELD pauses the function here and returns the chunk to the caller
        yield {
            buffer: buffer,
            offset: offset,
            totalSize: file.size,
            isDone: offset + CHUNK_SIZE >= file.size
        };

        // 4. Move the pointer forward for the next time the generator is called
        offset += CHUNK_SIZE;
    }
}
