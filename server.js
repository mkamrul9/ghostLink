// server.js (Node.js Backend)
import { WebSocketServer } from 'ws';

const wss = new WebSocketServer({ port: 8080 });
const rooms = new Map(); // Maps room IDs to a list of connected client sockets

wss.on('connection', (ws) => {
    let currentRoom = null;

    ws.on('message', (message) => {
        const data = JSON.parse(message);

        if (data.type === 'JOIN') {
            currentRoom = data.roomId;
            if (!rooms.has(currentRoom)) {
                rooms.set(currentRoom, new Set());
            }
            rooms.get(currentRoom).add(ws);
            console.log(`Client joined room: ${currentRoom}`);
            
            // Notify others in the room that someone new joined
            rooms.get(currentRoom).forEach(client => {
                if (client !== ws && client.readyState === 1) {
                    client.send(JSON.stringify({ type: 'PEER_JOINED', roomId: currentRoom }));
                }
            });
        }
        // If it's a signaling message (Offer, Answer, ICE Candidate), relay it!
        else if (currentRoom && rooms.has(currentRoom)) {
            // Broadcast the message to EVERYONE ELSE in the room
            rooms.get(currentRoom).forEach(client => {
                if (client !== ws && client.readyState === 1) { // 1 = OPEN
                    client.send(JSON.stringify(data));
                }
            });
        }
    });

    ws.on('close', () => {
        if (currentRoom && rooms.has(currentRoom)) {
            rooms.get(currentRoom).delete(ws);
            if (rooms.get(currentRoom).size === 0) {
                rooms.delete(currentRoom); // Clean up empty rooms
            }
        }
    });
});

console.log('Signaling Server running on ws://localhost:8080');