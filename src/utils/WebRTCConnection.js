import { deviceIdentity } from './DeviceIdentity.js';
export default class WebRTCConnection {
    constructor(signal, isInitiator, iceServers) {
        this.signal = signal;
        this.pendingCandidates = [];
        this.peerConnection = new RTCPeerConnection({ iceServers });
        this.incoming = Promise.resolve();
        this.peerConnection.onicecandidate = ({ candidate }) => {
            if (candidate) { try { signal.send({ type: 'ICE_CANDIDATE', candidate }); } catch { /* connected peers can outlive signaling */ } }
        };
        this.peerConnection.onconnectionstatechange = () => this.onConnectionStateChange?.(this.peerConnection.connectionState);
        this.peerConnection.ondatachannel = ({ channel }) => this.setupDataChannel(channel);
        if (isInitiator) this.setupDataChannel(this.peerConnection.createDataChannel('mystic-transfer', { ordered: true }));
    }
    setupDataChannel(channel) {
        this.dataChannel = channel;
        channel.binaryType = 'arraybuffer';
        let helloTimer;
        const announce = () => {
            if (channel.readyState !== 'open') return;
            this.sendControl({ type: 'HELLO', protocol: 2, ...deviceIdentity() });
            if (!this.helloReceived) helloTimer = setTimeout(announce, 1000);
        };
        channel.onopen = announce;
        if (channel.readyState === 'open') queueMicrotask(announce);
        channel.onclose = () => { clearTimeout(helloTimer); this.onDataChannelClose?.(); };
        this.clearHello = () => clearTimeout(helloTimer);
        channel.onerror = () => this.onError?.(new Error('The peer connection encountered a network error.'));
        // Preserve wire order through asynchronous key imports and IndexedDB writes.
        channel.onmessage = ({ data }) => {
            this.incoming = this.incoming.then(async () => {
                if (typeof data === 'string') {
                    const message = JSON.parse(data);
                    if (message.type === 'HELLO' || message.type === 'HELLO_ACK') {
                        if (message.protocol !== 2 || !/^[0-9a-f-]{36}$/i.test(message.id || '')) throw new Error('Refresh both devices to use the latest transfer version.');
                        if (this.remoteDeviceId && this.remoteDeviceId !== message.id) throw new Error('The connected device identity changed. Rejoin the room.');
                        if (message.type === 'HELLO') this.sendControl({type:'HELLO_ACK',protocol:2,...deviceIdentity()});
                        clearTimeout(helloTimer);
                        this.remoteDeviceId = message.id; this.remoteName = String(message.name || 'Device').slice(0, 40);
                        if (!this.helloReceived) { this.helloReceived = true; this.onDataChannelOpen?.(); }
                    } else if (message.type === 'PROFILE') { this.remoteName = String(message.name || 'Device').slice(0,40); this.onProfile?.();
                    } else if (message.type === 'CHAT') {
                        if (typeof message.text === 'string' && message.text.length <= 500) this.onChatMessage?.(message);
                    } else await this.onControl?.(message);
                } else await this.onPacket?.(data);
            }).catch(error => this.onError?.(error));
        };
    }
    sendControl(message) {
        if (this.dataChannel?.readyState !== 'open') throw new Error('Connect to a peer first.');
        this.dataChannel.send(JSON.stringify(message));
    }
    sendChat(message) { this.sendControl({ ...message, type: 'CHAT' }); }
    async createOffer() {
        if (this.peerConnection.signalingState !== 'stable') return;
        await this.peerConnection.setLocalDescription(await this.peerConnection.createOffer());
        this.signal.send({ type: 'OFFER', sdp: this.peerConnection.localDescription });
    }
    async setRemote(sdp) {
        await this.peerConnection.setRemoteDescription(sdp);
        for (const candidate of this.pendingCandidates.splice(0)) await this.peerConnection.addIceCandidate(candidate);
    }
    async handleOffer(sdp) {
        await this.setRemote(sdp);
        await this.peerConnection.setLocalDescription(await this.peerConnection.createAnswer());
        this.signal.send({ type: 'ANSWER', sdp: this.peerConnection.localDescription });
    }
    async handleAnswer(sdp) { await this.setRemote(sdp); }
    async handleIceCandidate(candidate) {
        if (!candidate) return;
        if (this.peerConnection.remoteDescription) await this.peerConnection.addIceCandidate(candidate);
        else this.pendingCandidates.push(candidate);
    }
    close() { this.clearHello?.(); this.dataChannel?.close(); this.peerConnection.close(); }
}
