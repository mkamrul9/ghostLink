import test from 'node:test';
import assert from 'node:assert/strict';
import {indexedDB} from 'fake-indexeddb';
import WebRTCConnection from '../src/utils/WebRTCConnection.js';
import RoomSession from '../src/utils/RoomSession.js';
import HistoryDB from '../src/DB/HistoryDB.js';
import {messageHtml,deliveryLabel} from '../src/utils/Messages.js';
test('message links escape HTML and only link HTTP URLs',()=>{
 const html=messageHtml('<img src=x onerror=alert(1)> https://example.com/\"onclick=\"bad javascript:alert(1)');
 assert.ok(html.includes('&lt;img'));assert.ok(!html.includes('<img'));assert.ok(html.includes('rel="noopener noreferrer"'));assert.ok(html.includes('&quot;'));assert.equal((html.match(/<a /g)||[]).length,1);
 assert.equal(deliveryLabel({delivery:'delivered',recipientCount:2,deliveredCount:2}),'Delivered to 2 devices');
 assert.match(deliveryLabel({delivery:'incomplete',recipientCount:2,deliveredCount:1}),/Delivered 1 of 2/);
});
test('message queue works while the file queue is blocked, deduplicates, and acknowledges receipt',async t=>{
 const original=globalThis.RTCPeerConnection;
 class Connection{createDataChannel(label){return {label,readyState:'open',bufferedAmount:0,send(){},close(){}};}close(){}}
 globalThis.RTCPeerConnection=Connection;t.after(()=>globalThis.RTCPeerConnection=original);
 const rtc=new WebRTCConnection({send(){}},true,[]);t.after(()=>rtc.close());rtc.helloReceived=true;rtc.remoteName='Actual name';
 let release;rtc.incoming=new Promise(resolve=>release=resolve);t.after(()=>release());
 const replies=[],received=[];rtc.chatChannel.send=value=>replies.push(JSON.parse(value));rtc.onChatMessage=message=>received.push(message);
 const message={type:'CHAT',id:crypto.randomUUID(),text:'note\n'.repeat(300),author:'Forged name'};
 rtc.chatChannel.onmessage({data:JSON.stringify(message)});await rtc.chatIncoming;
 assert.equal(received.length,1);assert.equal(received[0].author,'Actual name');assert.equal(replies[0].type,'CHAT_ACK');
 rtc.chatChannel.onmessage({data:JSON.stringify(message)});await rtc.chatIncoming;assert.equal(received.length,1);assert.equal(replies.length,2);
 rtc.chatChannel.onmessage({data:JSON.stringify({...message,id:crypto.randomUUID(),text:'x'.repeat(4001)})});await rtc.chatIncoming;assert.equal(received.length,1);
 rtc.sendChat(message);assert.equal(replies.at(-1).text,message.text);
});
test('room delivery tracks original recipients and disconnects without claiming success',()=>{
 const changes=[],room=new RoomSession({},null,{onChatDelivery:(id,status)=>changes.push({id,...status})});
 for(const id of ['a','b'])room.peers.set(id,{id,rtc:{helloReceived:true,dataChannel:{readyState:'open'},sendChat(){}}});
 const message={id:crypto.randomUUID(),text:'Hello'};assert.equal(room.sendChat(message).recipientCount,2);
 const pending=room.chatPending.get(message.id);pending.delivered.add('a');room.failMessages('b');
 assert.equal(changes[0].delivery,'incomplete');assert.equal(changes[0].deliveredCount,1);assert.equal(changes[0].failedCount,1);
 pending.delivered.add('b');pending.failed.delete('b');assert.equal(room.delivery(pending).delivery,'delivered');
});
test('clearing room messages keeps other rooms and transfer history',async()=>{
 globalThis.indexedDB=indexedDB;const db=new HistoryDB();db.dbName='messages-'+crypto.randomUUID();await db.init();
 try{await db.saveChat({id:'a',roomId:'one',ts:1,text:'one'});await db.saveChat({id:'b',roomId:'two',ts:2,text:'two'});await db.saveTransfer({id:'t',startedAt:1});await db.clearRoomChat('one');assert.deepEqual((await db.loadChat()).map(item=>item.id),['b']);assert.equal((await db.loadTransfers()).length,1);}finally{db.db.close();}
});
