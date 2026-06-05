export default class SignalingChannel {
    constructor(serverUrl) {
        this.serverUrl = serverUrl;
        this.socket = null;
        this.roomId = null;
        this.messageHandlers = []; // Callbacks for when we receive a message
    }

    connect(roomId) {
        this.roomId = roomId;

        return new Promise((resolve, reject) => {
            // Use the browser's native WebSocket API
            this.socket = new WebSocket(this.serverUrl);

            this.socket.onopen = () => {
                console.log(`Connected to Signaling Server. Joining room: ${roomId}`);
                // Tell the server which room we want to be in
                this.send({ type: 'JOIN', roomId: this.roomId });
                resolve();
            };

            this.socket.onerror = (err) => {
                console.error('WebSocket Error:', err);
                reject(err);
            };

            this.socket.onmessage = (event) => {
                const data = JSON.parse(event.data);
                // Log incoming raw signaling for easier debugging
                console.log('Signaling incoming:', data);
                // Trigger all registered handlers when a message arrives
                this.messageHandlers.forEach(handler => handler(data));
            };
        });
    }

    // Registers a function to run when a message is received
    onMessage(handler) {
        this.messageHandlers.push(handler);
    }

    // Sends a JSON object to the relay server
    send(data) {
        if (this.socket && this.socket.readyState === WebSocket.OPEN) {
            this.socket.send(JSON.stringify(data));
        } else {
            console.warn('Cannot send message, WebSocket is not open.');
        }
    }

    // Closes the WebSocket connection cleanly
    close() {
        if (this.socket) {
            try {
                this.socket.close();
            } catch (e) {
                // ignore close errors
            }
        }
    }
}
