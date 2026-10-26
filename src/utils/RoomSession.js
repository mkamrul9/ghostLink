import WebRTCConnection from './WebRTCConnection.js';
import TransferManager from './TransferManager.js';
export default class RoomSession {
    constructor(signal, db, options) { this.signal=signal; this.db=db; this.options=options; this.peers=new Map(); this.jobs=new Map(); this.closed=false; }
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
        rtc.onDataChannelClose=()=>{clearTimeout(peer.timer);peer.failed=true;peer.manager.close();this.publish();};
        rtc.onConnectionStateChange=state=>{if(state==='failed'){peer.failed=true;peer.manager.close();this.publish();this.options.onError?.(new Error('A device lost its connection. Rejoin the room to resume.'));}};
        rtc.onProfile=()=>this.publish();
        rtc.onError=error=>this.options.onError?.(error);
        rtc.onChatMessage=message=>this.options.onChat?.({...message,author:String(message.author || rtc.remoteName || 'Device').slice(0,40)});
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
    sendChat(message) { if(!this.connected.length)throw new Error('Connect another device first.');for(const peer of this.connected)peer.rtc.sendChat(message); }
    remove(id) { const peer=this.peers.get(id);if(!peer)return;clearTimeout(peer.timer);this.peers.delete(id);peer.manager.close();peer.rtc.close();this.publish(); }
    close() { this.closed=true;for(const id of [...this.peers.keys()])this.remove(id); }
}
