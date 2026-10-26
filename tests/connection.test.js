import test from 'node:test';
import assert from 'node:assert/strict';
import WebRTCConnection from '../src/utils/WebRTCConnection.js';
test('identity handshake recovers when one initial greeting is missed', async t=>{
 const original=globalThis.RTCPeerConnection;
 class Connection { constructor(){this.connectionState='connected';} createDataChannel(){return this.channel={readyState:'connecting',send(){},close(){this.readyState='closed';this.onclose?.();}};} close(){} }
 globalThis.RTCPeerConnection=Connection;t.after(()=>{globalThis.RTCPeerConnection=original;});
 const left=new WebRTCConnection({send(){}},true,[]),right=new WebRTCConnection({send(){}},true,[]);t.after(()=>{left.close();right.close();});
 let skipped=false,opens=0;
 left.onDataChannelOpen=()=>{opens++;};right.onDataChannelOpen=()=>{opens++;};
 left.dataChannel.send=data=>{if(!skipped && JSON.parse(data).type==='HELLO'){skipped=true;return;}queueMicrotask(()=>right.dataChannel.onmessage({data}));};
 right.dataChannel.send=data=>queueMicrotask(()=>left.dataChannel.onmessage({data}));
 left.dataChannel.readyState=right.dataChannel.readyState='open';left.dataChannel.onopen();right.dataChannel.onopen();
 for(let i=0;i<10 && opens<2;i++)await new Promise(resolve=>setImmediate(resolve));
 assert.equal(opens,2);assert.ok(left.remoteDeviceId);assert.ok(right.remoteDeviceId);
 right.dataChannel.onmessage({data:JSON.stringify({type:'HELLO',protocol:2,id:left.remoteDeviceId,name:'Same device'})});await right.incoming;assert.equal(opens,2);
});
