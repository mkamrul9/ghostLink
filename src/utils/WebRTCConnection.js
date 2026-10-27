import { deviceIdentity } from './DeviceIdentity.js';
export default class WebRTCConnection {
    constructor(signal, isInitiator, iceServers) {
        this.signal = signal;
        this.pendingCandidates = [];
        this.peerConnection = new RTCPeerConnection({ iceServers });
        this.incoming = Promise.resolve();
        this.chatIncoming = Promise.resolve();
        this.receivedChat = new Set();
        this.peerConnection.onicecandidate = ({ candidate }) => {
            if (candidate) { try { signal.send({ type: 'ICE_CANDIDATE', candidate }); } catch { /* connected peers can outlive signaling */ } }
        };
        this.peerConnection.onconnectionstatechange = () => { if(!this.closed)this.onConnectionStateChange?.(this.peerConnection.connectionState); };
        this.peerConnection.ondatachannel = ({ channel }) => channel.label === 'mystic-messages' ? this.setupChatChannel(channel) : this.setupDataChannel(channel);
        if (isInitiator) {
            this.setupDataChannel(this.peerConnection.createDataChannel('mystic-transfer', { ordered: true }));
            this.setupChatChannel(this.peerConnection.createDataChannel('mystic-messages', { ordered: true }));
        }
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
        channel.onclose = () => { clearTimeout(helloTimer); if(!this.closed)this.onDataChannelClose?.(); };
        this.clearHello = () => clearTimeout(helloTimer);
        channel.onerror = () => { if(!this.closed && this.peerConnection.connectionState === 'failed')this.onError?.(new Error('The peer connection encountered a network error.')); };
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
                        await this.receiveChat(message);
                    } else if (message.type === 'CHAT_ACK') {
                        this.receiveChatAck(message);
                    } else await this.onControl?.(message);
                } else await this.onPacket?.(data);
            }).catch(error => this.onError?.(error));
        };
    }
    sendControl(message) {
        if (this.dataChannel?.readyState !== 'open') throw new Error('Connect to a peer first.');
        this.dataChannel.send(JSON.stringify(message));
    }
    setupChatChannel(channel) {
        this.chatChannel = channel;
        // Messages have their own ordered queue, independent of file writes.
        channel.onmessage = ({data}) => {
            this.chatIncoming = this.chatIncoming.then(async () => {
                if (typeof data !== 'string' || data.length > 24000) return;
                const message = JSON.parse(data);
                if (message.type === 'CHAT') await this.receiveChat(message);
                else if (message.type === 'CHAT_ACK') this.receiveChatAck(message);
            }).catch(error => this.onError?.(error));
        };
    }
    async receiveChat(message) {
        if (!this.helloReceived || typeof message.text !== 'string' || !message.text.trim() || message.text.length > 4000 || !/^[0-9a-f-]{36}$/i.test(message.id || '')) return;
        if (!this.receivedChat.has(message.id)) {
            await this.onChatMessage?.({id:message.id, text:message.text, author:this.remoteName});
            this.receivedChat.add(message.id);
            if (this.receivedChat.size > 500) this.receivedChat.delete(this.receivedChat.values().next().value);
        }
        this.sendChatControl({type:'CHAT_ACK', id:message.id});
    }
    receiveChatAck(message) {
        if (this.helloReceived && /^[0-9a-f-]{36}$/i.test(message.id || '')) this.onChatAck?.(message.id);
    }
    sendChatControl(message) {
        const channel = this.chatChannel?.readyState === 'open' ? this.chatChannel : this.dataChannel;
        if (channel?.readyState !== 'open') throw new Error('Connect another device first.');
        if (channel.bufferedAmount > 262144) throw new Error('Messages are busy. Try again in a moment.');
        channel.send(JSON.stringify(message));
    }
    sendChat(message) { this.sendChatControl({ id:message.id, text:message.text, type:'CHAT' }); }
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
    close() { this.closed = true; this.clearHello?.(); this.dataChannel?.close(); this.chatChannel?.close(); this.peerConnection.close(); }
}
