export default class FileStreamer {
    constructor(channel) {
        this.channel = channel;
        this.MAX_BUFFER_SIZE = 1024 * 1024;
        channel.bufferedAmountLowThreshold = 262144;
    }
    async drain(signal) {
        if (signal?.aborted) throw new Error('Transfer cancelled.');
        if (this.channel.readyState !== 'open') throw new Error('Peer disconnected.');
        if (this.channel.bufferedAmount <= this.MAX_BUFFER_SIZE) return;
        await new Promise((resolve, reject) => {
            const cleanup = () => {
                clearTimeout(timer);
                this.channel.removeEventListener('bufferedamountlow', ready);
                this.channel.removeEventListener('close', closed);
                this.channel.removeEventListener('error', closed);
                signal?.removeEventListener('abort', cancelled);
            };
            const ready = () => { cleanup(); resolve(); };
            const closed = () => { cleanup(); reject(new Error('Peer disconnected.')); };
            const cancelled = () => { cleanup(); reject(new Error('Transfer cancelled.')); };
            const timer = setTimeout(() => { cleanup(); reject(new Error('Transfer stalled. Please reconnect and retry.')); }, 30000);
            this.channel.addEventListener('bufferedamountlow', ready);
            this.channel.addEventListener('close', closed);
            this.channel.addEventListener('error', closed);
            signal?.addEventListener('abort', cancelled, { once: true });
        });
    }
    async stream(packets, signal) {
        for await (const packet of packets) { await this.drain(signal); this.channel.send(packet); }
    }
}
