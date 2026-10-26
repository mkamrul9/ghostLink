export default class SignalingChannel {
    constructor(serverUrl) {
        this.serverUrl = serverUrl;
        this.messageHandlers = [];
        this.closed = false;
    }
    connect(roomId) {
        return new Promise((resolve, reject) => {
            this.socket = new WebSocket(this.serverUrl);
            let joined = false;
            const timer = setTimeout(() => { reject(new Error('Connection timed out. The server may be waking up; try again.')); this.close(); }, 20000);
            this.socket.onopen = () => this.send({ type: 'JOIN', roomId });
            this.socket.onmessage = event => {
                let data;
                try { data = JSON.parse(event.data); } catch { return; }
                if (data.type === 'ERROR') {
                    clearTimeout(timer);
                    const error = new Error(data.message);
                    if (!joined) { reject(error); this.close(); } else this.onError?.(error);
                    return;
                }
                if (data.type === 'JOINED') { joined = true; clearTimeout(timer); resolve(data); }
                for (const handler of this.messageHandlers) Promise.resolve(handler(data)).catch(error => this.onError?.(error));
            };
            this.socket.onerror = () => { if (!joined) { clearTimeout(timer); reject(new Error('Cannot reach the connection server. Check your network and retry.')); } };
            this.socket.onclose = () => {
                clearTimeout(timer);
                if (!joined) reject(new Error('The connection server closed before joining. Please retry.'));
                if (!this.closed) this.onClose?.();
            };
        });
    }
    onMessage(handler) { this.messageHandlers.push(handler); }
    send(data) {
        if (this.socket?.readyState !== WebSocket.OPEN) throw new Error('Connection server is unavailable.');
        this.socket.send(JSON.stringify(data));
    }
    close() { this.closed = true; this.socket?.close(); }
}
