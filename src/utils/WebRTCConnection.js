import FileStreamer from './FileStreamer.js';
import FileReceiver from './FileReceiver.js';

export default class WebRTCConnection {
    constructor(signalingChannel, isInitiator = false) {
        this.signal = signalingChannel;
        this.isInitiator = isInitiator;

        // We use Google's public STUN servers to find our public IP
        const configuration = {
            iceServers: [{ urls: 'stun:stun.l.google.com:19302' }]
        };

        // 1. Initialize the native RTCPeerConnection
        this.peerConnection = new RTCPeerConnection(configuration);

        // NEW: Data channel reference (for file transfer)
        this.dataChannel = null;

        // NEW: If we are the Initiator, create the data channel now
        if (this.isInitiator) {
            this.dataChannel = this.peerConnection.createDataChannel('ghostlink-transfer', { ordered: true });
            this.setupDataChannel();
        } else {
            // If Receiver, wait for the remote data channel
            this.peerConnection.ondatachannel = (event) => {
                this.dataChannel = event.channel;
                this.setupDataChannel();
            };
        }

        // 2. Set up local ICE Candidate gathering
        // When the STUN server finds our IP/Port, this event fires
        this.peerConnection.onicecandidate = (event) => {
            if (event.candidate) {
                console.log('Gathered ICE Candidate, sending to peer...');
                this.signal.send({
                    type: 'ICE_CANDIDATE',
                    candidate: event.candidate
                });
            }
        };

        // 3. Listen for connection state changes (for UI updates)
        this.peerConnection.onconnectionstatechange = () => {
            console.log('WebRTC Connection State:', this.peerConnection.connectionState);
            if (this.peerConnection.connectionState === 'connected') {
                console.log('🎉 P2P CONNECTION ESTABLISHED DIRECTLY!');
            }
            if (typeof this.onConnectionStateChange === 'function') {
                this.onConnectionStateChange(this.peerConnection.connectionState);
            }
        };

        // NEW: More granular ICE state changes for debugging
        this.peerConnection.oniceconnectionstatechange = () => {
            console.log('ICE connection state:', this.peerConnection.iceConnectionState);
        };
    }

    // NEW: Configure the RTCDataChannel once it exists
    setupDataChannel() {
        if (!this.dataChannel) return;

        // We will send/receive raw ArrayBuffers
        this.dataChannel.binaryType = 'arraybuffer';

        this.dataChannel.onopen = () => {
            console.log('🟢 RTCDataChannel OPEN! Ready to stream binary.');
            if (typeof this.onDataChannelOpen === 'function') {
                this.onDataChannelOpen();
            }

            // Expose simple helpers for manual testing from DevTools:
            // - startStreaming(packetGenerator): streams an async generator over the data channel
            // - attachReceiver(key, totalChunks, fileName, mime): attach a FileReceiver to handle incoming packets
            window.startStreaming = async (packetGenerator) => {
                try {
                    await this.sendStream(packetGenerator);
                } catch (e) {
                    console.error('startStreaming failed', e);
                }
            };

            window.attachReceiver = (key, totalChunks, fileName = 'download.bin', mime = 'application/octet-stream') => {
                this.fileReceiver = new FileReceiver(key, totalChunks, fileName, mime);
                console.log('FileReceiver attached:', { fileName, totalChunks });
            };

            // Send a small ping to verify the data channel is usable
            try {
                const ping = JSON.stringify({ type: 'PING', ts: Date.now() });
                this.dataChannel.send(ping);
                console.log('Sent PING over data channel');
            } catch (e) {
                console.warn('Failed to send PING on dataChannel', e);
            }
        };

        this.dataChannel.onclose = () => {
            console.log('🔴 RTCDataChannel CLOSED.');
            if (typeof this.onDataChannelClose === 'function') {
                this.onDataChannelClose();
            }
        };

        this.dataChannel.onmessage = (event) => {
            // If message is a string (control/ping), handle it here
            if (typeof event.data === 'string') {
                try {
                    const msg = JSON.parse(event.data);
                    if (msg.type === 'CHAT') {
                        if (typeof this.onChatMessage === 'function') {
                            this.onChatMessage(msg);
                        } else {
                            console.log('Chat message:', msg);
                        }
                        return;
                    }
                    console.log('DataChannel control message:', msg);
                    if (msg.type === 'PING') {
                        // reply with PONG
                        try { this.dataChannel.send(JSON.stringify({ type: 'PONG', ts: Date.now(), echo: msg.ts })); } catch (e) { }
                    }
                    if (msg.type === 'PONG') {
                        console.log('Received PONG echo:', msg.echo);
                    }
                } catch (e) {
                    console.log('Received text message on dataChannel:', event.data);
                }
                return;
            }

            // If a FileReceiver has been attached from the app, forward binary packets to it
            if (this.fileReceiver && typeof this.fileReceiver.receivePacket === 'function') {
                this.fileReceiver.receivePacket(event.data);
                return;
            }

            // No FileReceiver attached yet — log a clear warning so the cause is obvious
            try {
                const len = event.data && event.data.byteLength ? event.data.byteLength : event.data.length || 0;
                console.warn(`⚠️ Binary packet received (${len} bytes) but no FileReceiver attached. Waiting for FILE_META signal...`);
            } catch (e) {
                console.warn('Binary packet received but no FileReceiver attached.', event.data);
            }
        };
    }

    /**
     * Sends a chat message over the data channel.
     * @param {{id:number,text:string,ts:number,author?:string}} message
     */
    sendChat(message) {
        if (!this.dataChannel || this.dataChannel.readyState !== 'open') {
            throw new Error('DataChannel is not open.');
        }
        this.dataChannel.send(JSON.stringify({ type: 'CHAT', ...message }));
    }

    close() {
        try {
            if (this.dataChannel) {
                this.dataChannel.close();
            }
        } catch (e) {
            // ignore
        }

        try {
            if (this.peerConnection) {
                this.peerConnection.close();
            }
        } catch (e) {
            // ignore
        }
    }

    // --- THE HANDSHAKE METHODS ---

    /**
     * Streams an async packet generator over the RTCDataChannel using FileStreamer.
     * @param {AsyncGenerator} packetGenerator
     */
    async sendStream(packetGenerator) {
        if (!this.dataChannel || this.dataChannel.readyState !== 'open') {
            throw new Error('DataChannel is not open. Wait for onopen before sending.');
        }

        const streamer = new FileStreamer(this.dataChannel);
        return streamer.stream(packetGenerator);
    }

    /**
     * Called by Peer A (The Sender) to start the connection.
     */
    async createOffer() {
        try {
            const offer = await this.peerConnection.createOffer();
            await this.peerConnection.setLocalDescription(offer);

            console.log('Created Offer, sending via signal...');
            this.signal.send({
                type: 'OFFER',
                sdp: this.peerConnection.localDescription
            });
        } catch (error) {
            console.error('Error creating offer:', error);
        }
    }

    /**
     * Called by Peer B (The Receiver) when they get an Offer.
     */
    async handleOffer(remoteSdp) {
        try {
            console.log('Received Offer, creating Answer...');
            await this.peerConnection.setRemoteDescription(new RTCSessionDescription(remoteSdp));

            const answer = await this.peerConnection.createAnswer();
            await this.peerConnection.setLocalDescription(answer);

            this.signal.send({
                type: 'ANSWER',
                sdp: this.peerConnection.localDescription
            });
        } catch (error) {
            console.error('Error handling offer:', error);
        }
    }

    /**
     * Called by Peer A when they receive Peer B's Answer.
     */
    async handleAnswer(remoteSdp) {
        try {
            console.log('Received Answer, setting remote description...');
            await this.peerConnection.setRemoteDescription(new RTCSessionDescription(remoteSdp));
        } catch (error) {
            console.error('Error handling answer:', error);
        }
    }

    /**
     * Called by both peers whenever they receive an ICE candidate from the other side.
     */
    async handleIceCandidate(candidateData) {
        try {
            await this.peerConnection.addIceCandidate(new RTCIceCandidate(candidateData));
            console.log('Successfully added remote ICE candidate.');
        } catch (error) {
            console.error('Error adding ICE candidate:', error);
        }
    }
}
