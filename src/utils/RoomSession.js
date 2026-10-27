import WebRTCConnection from './WebRTCConnection.js';
import TransferManager from './TransferManager.js';
export default class RoomSession {
    constructor(signal, db, options) { this.signal=signal; this.db=db; this.options=options; this.peers=new Map(); this.jobs=new Map(); this.chatPending=new Map(); this.closed=false; }
    get dataChannel() { return {readyState:this.connected.length ? 'open':'closed'}; }
    get connected() { return [...this.peers.values()].filter(peer=>!peer.failed && peer.rtc.helloReceived && peer.rtc.dataChannel?.readyState==='open'); }
    get incoming() { return Promise.all([...this.peers.values()].map(peer=>peer.rtc.incoming)); }
    publish() { if(!this.closed) this.options.onPeers?.([...this.peers.values()].map(peer=>({ id:peer.id, name:peer.rtc.remoteName || 'Connecting device', deviceId:peer.rtc.remoteDeviceId, connected:this.connected.includes(peer), failed:Boolean(peer.failed) }))); }
    async add(id, initiator) {
        if(this.closed || this.peers.has(id)) return this.peers.get(id);
        const rtc=new WebRTCConnection({send:message=>this.signal.send({...message,to:id})},initiator,this.options.iceServers);
        const peer={id,rtc}; this.peers.set(id,peer);
        peer.ready=Promise.resolve().then(async()=>{ const iceServers=await this.options.refreshIce?.();if(!this.closed && iceServers)rtc.peerConnection.setConfiguration({iceServers}); }).catch(error=>this.options.onError?.(error));
        peer.manager=new TransferManager(rtc,this.db,{
            ...this.options,
            onAdd:(item,file)=> { this.jobs.set(item.id,id); this.options.onAdd?.({...item,peerId:id,peerName:rtc.remoteName || 'Device',remoteDeviceId:rtc.remoteDeviceId},file); },
            onProgress:(job,patch)=>this.options.onProgress?.(job,patch)
        });
        rtc.onDataChannelOpen=()=>{clearTimeout(peer.timer);this.publish();};
        rtc.onDataChannelClose=()=>{clearTimeout(peer.timer);peer.failed=true;peer.manager.close();this.failMessages(id);this.publish();};
        rtc.onConnectionStateChange=state=>{if(state==='failed'){peer.failed=true;peer.manager.close();this.failMessages(id);this.publish();this.options.onError?.(new Error('A device lost its connection. Rejoin the room to resume.'));}};
        rtc.onProfile=()=>this.publish();
        rtc.onError=error=>this.options.onError?.(error);
        rtc.onChatMessage=message=>this.options.onChat?.({...message,author:String(rtc.remoteName || 'Device').slice(0,40)});
        rtc.onChatAck=messageId=>{const pending=this.chatPending.get(messageId);if(pending?.recipients.has(id)){pending.delivered.add(id);pending.failed.delete(id);this.publishDelivery(messageId,pending);}};
        peer.timer=setTimeout(()=>{if(!rtc.helloReceived)this.options.onError?.(new Error('A device could not connect. Try another network or configure a relay.'));},35000);
        this.publish(); await peer.ready; if(initiator && !this.closed)await rtc.createOffer(); return peer;
    }
    async join(message) { await Promise.all((message.members || []).map(member=>this.add(member.id,false))); this.publish(); }
    async handle(message) {
        if(message.type==='PEER_JOINED')return this.add(message.peerId,true);
        if(message.type==='PEER_LEFT'){this.remove(message.peerId);return;}
        const peer=this.peers.get(message.from); if(!peer)return; await peer.ready;
        if(message.type==='OFFER')await peer.rtc.handleOffer(message.sdp);
        if(message.type==='ANSWER')await peer.rtc.handleAnswer(message.sdp);
        if(message.type==='ICE_CANDIDATE')await peer.rtc.handleIceCandidate(message.candidate);
    }
    sendFiles(files,ids) {
        const recipients=this.connected.filter(peer=>ids.includes(peer.id));
        if(!recipients.length)return Promise.reject(new Error('Choose a connected device first.'));
        return Promise.all(recipients.map(peer=>peer.manager.sendFiles(files)));
    }
    retry(file,deviceId) { const peer=this.connected.find(peer=>peer.rtc.remoteDeviceId===deviceId); if(!peer)throw new Error('Reconnect the original receiving device to resume this file.');return peer.manager.sendFiles([file]); }
    cancel(id) { const peer=this.peers.get(this.jobs.get(id));peer?.manager.cancel(id); }
    updateProfile(name) { for(const peer of this.connected)peer.rtc.sendControl({type:'PROFILE',name}); }
    delivery(pending) {
        const deliveredCount=pending.delivered.size, recipientCount=pending.recipients.size, failedCount=pending.failed.size;
        return {deliveredCount,recipientCount,failedCount,delivery:deliveredCount===recipientCount?'delivered':failedCount?'incomplete':'sent'};
    }
    publishDelivery(id,pending) { this.options.onChatDelivery?.(id,this.delivery(pending)); }
    failMessages(peerId) {
        for(const [id,pending] of this.chatPending)if(pending.recipients.has(peerId) && !pending.delivered.has(peerId)){pending.failed.add(peerId);this.publishDelivery(id,pending);}
    }
    sendChat(message) {
        const recipients=this.connected;
        if(!recipients.length)throw new Error('Connect another device first.');
        if(typeof message.text!=='string' || !message.text.trim() || message.text.length>4000)throw new Error('Use 1 to 4,000 characters.');
        const pending={recipients:new Set(recipients.map(peer=>peer.id)),delivered:new Set(),failed:new Set()};
        this.chatPending.set(message.id,pending);
        if(this.chatPending.size>200)this.chatPending.delete(this.chatPending.keys().next().value);
        for(const peer of recipients){try{peer.rtc.sendChat(message);}catch{pending.failed.add(peer.id);}}
        if(pending.failed.size===recipients.length){this.chatPending.delete(message.id);throw new Error('Your message could not be sent. Try again.');}
        return this.delivery(pending);
    }
    remove(id) { const peer=this.peers.get(id);if(!peer)return;clearTimeout(peer.timer);this.peers.delete(id);this.failMessages(id);peer.manager.close();peer.rtc.close();this.publish(); }
    close() { this.closed=true;for(const id of [...this.peers.keys()])this.remove(id); }
}
