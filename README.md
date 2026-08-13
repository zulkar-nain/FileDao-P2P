# FileDao - Local P2P File Sharing

A minimal, lightweight, local P2P file-sharing web application using Python (Flask) and Vanilla JavaScript. Files transfer directly between devices on the same local network using WebRTC DataChannels - never through the server.

## Architecture

- **Flask Server**: Acts only as a static site provider and SocketIO WebRTC signaling broker (SDP offer/answer and ICE candidate relay)
- **WebRTC**: Direct P2P connection between browsers using RTCDataChannel
- **STUN Servers**: Google's public STUN servers for NAT traversal
- **File Transfer**: Binary chunking (~64KB) with backpressure management

## Features

- 🔐 **6-digit Room PIN** for easy sharing
- 📱 **QR Code** generation for mobile camera scanning
- 📷 **QR Scanner** using device camera (html5-qrcode)
- 📁 **Drag & Drop** file selection with multiple file support
- 📊 **Real-time Progress** with speed meter
- ⚡ **Direct P2P Transfer** - files never touch the server
- 🎨 **Modern UI** with glassmorphism design
- 📦 **Docker Support** for easy deployment

## Project Structure

```
p2p-file-share/
├── app/
│   ├── __init__.py           # Flask App Factory & SocketIO initialization
│   ├── routes.py             # HTTP routes (index, health, room API)
│   ├── sockets.py            # WebRTC signaling (room management, SDP/ICE relay)
│   └── utils.py              # Room PIN generator, QR code generation
├── static/
│   ├── css/
│   │   ├── main.css          # Modern minimal layout, CSS variables, glassmorphism
│   │   └── components.css    # Buttons, QR container, file drop zone, progress bars
│   └── js/
│       ├── socket-client.js  # SocketIO connection & event handlers
│       ├── webrtc.js         # RTCDataChannel logic, file chunking, backpressure
│       ├── ui.js             # UI state management, PIN input, QR scanner
│       └── main.js           # App initializer coordinating modules
├── templates/
│   └── index.html            # Single page UI layout
├── Dockerfile                # Lightweight container build (Gunicorn/eventlet)
├── config.py                 # Configuration classes (dev/prod/test)
├── run.py                    # Server startup script
└── requirements.txt          # Python dependencies
```

## Quick Start

### Local Development

```bash
# Create virtual environment
python -m venv .venv

# Activate virtual environment
# Windows:
.venv\Scripts\activate
# Linux/Mac:
source .venv/bin/activate

# Install dependencies
pip install -r requirements.txt

# Run server
python run.py
```

Open `http://localhost:5000` in your browser.

### Docker

```bash
# Build image
docker build -t filedao .

# Run container
docker run -p 8000:8000 filedao
```

Open `http://localhost:8000` in your browser.

### Production Deployment

Deploy to Render, Railway, or any VPS with SSL/HTTPS:

```bash
# Set environment variables
export FLASK_ENV=production
export SECRET_KEY=your-secret-key-here

# Run with gunicorn
gunicorn --worker-class eventlet --workers 1 --bind 0.0.0.0:8000 run:app
```

## Usage

1. **Open the app** on both devices (same Wi-Fi network)
2. **Sender**: Click "Send Files" → Share the 6-digit PIN or QR code
3. **Receiver**: Click "Receive Files" → Enter PIN or scan QR code
4. **Sender**: Drag & drop files or click to select
5. **Watch** real-time progress as files transfer directly P2P

## Technical Details

### WebRTC Configuration

```javascript
const CONFIG = {
    iceServers: [
        { urls: 'stun:stun.l.google.com:19302' },
        { urls: 'stun:stun1.l.google.com:19302' }
    ],
    iceTransportPolicy: 'all',
    bundlePolicy: 'max-bundle',
    rtcpMuxPolicy: 'require',
    sdpSemantics: 'unified-plan'
};
```

### File Transfer Protocol

- **Chunk Size**: 64KB
- **Backpressure Threshold**: 8MB
- **Max Buffered Amount**: 16MB
- **Data Channel**: Reliable, ordered delivery

### Signaling Flow

1. Host creates room → Gets PIN + QR code
2. Peer joins room via PIN/QR
3. Host creates offer → Sent via SocketIO
4. Peer receives offer → Creates answer → Sent via SocketIO
5. ICE candidates exchanged via SocketIO
6. Direct P2P connection established
7. File metadata sent → Binary chunks via DataChannel

## Browser Support

- Chrome/Edge 88+
- Firefox 78+
- Safari 14+
- Mobile browsers with WebRTC support

## Security

- Files transfer **directly between browsers** (P2P)
- Server only handles **signaling metadata** (SDP, ICE)
- No file data passes through the server
- HTTPS required for WebRTC on production

## License

MIT