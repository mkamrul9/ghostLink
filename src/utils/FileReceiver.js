import { unpackEncryptedChunk } from './BinaryPacker.js';
import { decryptChunk } from './CryptoVault.js';

// Simple per-second counter for incoming bytes
let bytesTransferredInLastSecond = 0;

// Report to the SpeedGraph if present once per second
setInterval(() => {
    try {
        if (window && window.speedGraph && typeof window.speedGraph.addSpeedData === 'function') {
            window.speedGraph.addSpeedData(bytesTransferredInLastSecond);
        }
    } catch (e) {
        // ignore when not in browser context
    }
    // Debug: log receive speed to console so we can verify counting works
    if (bytesTransferredInLastSecond > 0) {
        try { console.log('FileReceiver: bytes last second ->', bytesTransferredInLastSecond); } catch (e) { }
    }
    bytesTransferredInLastSecond = 0;
}, 1000);

export default class FileReceiver {
    constructor(cryptoKey, expectedTotalChunks, fileName, mimeType, options = {}) {
        this.cryptoKey = cryptoKey;
        this.expectedTotalChunks = expectedTotalChunks;
        this.fileName = fileName;
        this.mimeType = mimeType;

        this.onProgress = options.onProgress || null;
        this.onComplete = options.onComplete || null;
        this.onError = options.onError || null;
        this.onSpeed = options.onSpeed || null;
        this.bytesSinceLastTick = 0;
        this.lastSpeedTs = typeof performance !== 'undefined' ? performance.now() : Date.now();
        this.currentSpeed = 0;

        // Using a Map prevents memory leaks from out-of-order array indexing
        this.receivedChunks = new Map();
        this.chunksReceivedCount = 0;
    }

    /**
     * Called every time the WebRTC DataChannel receives a message.
     * @param {ArrayBuffer} packetBuffer - The raw encrypted packet from the network.
     */
    async receivePacket(packetBuffer) {
        try {
            // 1. Unpack the binary header
            const { chunkIndex, iv, encryptedPayload } = unpackEncryptedChunk(packetBuffer);

            // 2. Decrypt the payload immediately to distribute CPU load
            const decryptedBuffer = await decryptChunk(this.cryptoKey, iv, encryptedPayload);

            // 3. Store in the Map
            if (!this.receivedChunks.has(chunkIndex)) {
                this.receivedChunks.set(chunkIndex, decryptedBuffer);
                this.chunksReceivedCount++;

                // Update UI Progress
                const progress = Math.round((this.chunksReceivedCount / this.expectedTotalChunks) * 100);
                console.log(`Download Progress: ${progress}%`);

                const now = typeof performance !== 'undefined' ? performance.now() : Date.now();
                this.bytesSinceLastTick += decryptedBuffer.byteLength;
                if (now - this.lastSpeedTs >= 1000) {
                    this.currentSpeed = Math.round((this.bytesSinceLastTick * 1000) / (now - this.lastSpeedTs));
                    this.bytesSinceLastTick = 0;
                    this.lastSpeedTs = now;
                    if (typeof this.onSpeed === 'function') {
                        this.onSpeed(this.currentSpeed);
                    }
                }

                if (typeof this.onProgress === 'function') {
                    this.onProgress(progress, {
                        receivedChunks: this.chunksReceivedCount,
                        totalChunks: this.expectedTotalChunks,
                        speed: this.currentSpeed
                    });
                }

                // 4. Check if we have everything
                if (this.chunksReceivedCount === this.expectedTotalChunks) {
                    this.assembleFile();
                }
            }
            // Track bytes received for speed graph
            try {
                let len = 0;
                if (decryptedBuffer instanceof ArrayBuffer) len = decryptedBuffer.byteLength;
                else if (ArrayBuffer.isView(decryptedBuffer)) len = decryptedBuffer.byteLength;
                bytesTransferredInLastSecond += len;
            } catch (e) {
                // ignore
            }
        } catch (error) {
            console.error('Failed to process incoming packet. Key mismatch or corrupted data.', error);
            if (typeof this.onError === 'function') {
                this.onError(error);
            }
        }
    }

    /**
     * Fuses all the chunks back together and triggers a download.
     */
    assembleFile() {
        console.log('All chunks received. Assembling file...');

        // 1. We must order the chunks before fusing them
        const orderedChunks = [];
        for (let i = 0; i < this.expectedTotalChunks; i++) {
            orderedChunks.push(this.receivedChunks.get(i));
        }

        // 2. Create a Blob (Binary Large Object) from the array of ArrayBuffers
        const fileBlob = new Blob(orderedChunks, { type: this.mimeType });

        // 3. Clear the Map from memory immediately now that the Blob exists
        this.receivedChunks.clear();

        this.triggerDownload(fileBlob);
        if (typeof this.onComplete === 'function') {
            this.onComplete();
        }
    }

    /**
     * Hacks the browser DOM to force a file download to the user's hard drive.
     */
    triggerDownload(blob) {
        // Create a temporary, internal browser URL that points to our memory Blob
        const downloadUrl = URL.createObjectURL(blob);

        // Create a hidden anchor <a> tag
        const link = document.createElement('a');
        link.href = downloadUrl;
        link.download = this.fileName; // The name it will save as

        // Append, click, and remove the link
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);

        // Free up the memory associated with the URL
        setTimeout(() => URL.revokeObjectURL(downloadUrl), 1000);

        console.log(`🎉 Success! File downloaded: ${this.fileName}`);
    }
}
