# GhostLink

GhostLink is a browser-based P2P file transfer prototype built with vanilla JavaScript. It streams large files directly between two browsers using WebRTC data channels, Web Workers, and the Web Crypto API. A minimal WebSocket signaling server is used only to connect peers; file data never touches the server.

## Why GhostLink
- Move very large files with minimal memory usage (64 KB chunking).
- End-to-end encryption with AES-256-GCM per chunk.
- Custom binary packet format for low overhead.
- Backpressure-aware streaming to avoid browser crashes.
- Zero heavy frontend frameworks; lightweight custom component system.

## Features
- Drag-and-drop files or folders (recursive parsing).
- P2P WebRTC data channel with ordered, binary transmission.
- AES-256-GCM encryption per chunk with unique IVs.
- Backpressure control using `bufferedAmountLowThreshold`.
- Receiver reassembly, decryption, and auto-download.
- Canvas-based throughput graph.
- IndexedDB vault for metadata and encrypted chunk storage.

## Tech Stack
- Vanilla JavaScript (ES Modules)
- WebRTC + RTCDataChannel
- Web Workers
- Web Crypto API (AES-GCM)
- IndexedDB
- WebSocket signaling (Node.js + ws)

## Project Structure
```
ghostLink/
  server.js
  src/
    index.html
    index.js
    styles.css
    components/
    helpers/
    utils/
    worker/
  docs/
```

## Getting Started

### 1) Install dependencies
```bash
npm install
```

### 2) Start the signaling server
```bash
node server.js
```

### 3) Serve the client
From the repo root:
```bash
python -m http.server 8000
```

### 4) Open two tabs
- Sender: http://localhost:8000/src/index.html?init=true
- Receiver: http://localhost:8000/src/index.html

### 5) Transfer a file
Drag a file or folder into the sender tab.

## How It Works (High Level)
1) Drop a file or folder into the app.
2) The file is read as 64 KB chunks using an async generator.
3) Each chunk is encrypted with AES-256-GCM.
4) A binary packet is built: fileId + chunkIndex + IV + encrypted payload.
5) Packets are streamed over WebRTC with backpressure control.
6) The receiver decrypts, reorders, assembles, and downloads the file.

## Security Notes
- Each file uses a fresh AES-256-GCM key.
- A unique IV is generated per chunk.
- The current prototype sends raw key bytes over signaling (for demo only).
- Recommended improvement: replace raw key sharing with ECDH key exchange.

## Limitations (Current Prototype)
- No TURN relay for strict NAT/firewall environments.
- No multi-peer rooms.
- No chat UI yet.
- IndexedDB resume logic is not fully wired end-to-end.
- Folder reconstruction on the receiver is not implemented.


## Development Notes
- The frontend uses a lightweight `Component` base class for UI.
- State is managed by a Proxy-based Store with PubSub.
- The WebSocket server is a simple room relay.

## Contributing
1) Fork the repo.
2) Create a feature branch.
3) Open a PR with a clear description.

## License
ISC
