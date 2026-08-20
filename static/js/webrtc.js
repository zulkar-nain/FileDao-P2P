/**
 * WebRTC Module
 * Handles RTCPeerConnection, RTCDataChannel, file chunking, and backpressure management
 */

const WebRTC = (() => {
    // Configuration
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
    
    const DATA_CHANNEL_OPTIONS = {
        ordered: true // omit maxRetransmits/maxPacketLifeTime for full SCTP reliability
    };
    
    const CHUNK_SIZE = 64 * 1024; // 64KB
    const MAX_BUFFERED_AMOUNT = 16 * 1024 * 1024; // 16MB
    const BACKPRESSURE_THRESHOLD = 8 * 1024 * 1024; // 8MB
    
    // State
    let peerConnection = null;
    let dataChannel = null;
    let currentRoom = null;
    let isHost = false;
    let connectionState = 'disconnected';
    
    // File transfer state
    let pendingFiles = [];
    let currentFileTransfer = null;
    let transferCallbacks = {};
    let preMetadataChunks = []; // raw chunks that arrived before file metadata
    
    // Event handlers
    const eventHandlers = new Map();
    
    // Stats
    let statsInterval = null;
    let lastStatsTime = 0;
    let lastBytesSent = 0;
    
    /**
     * Emit event to local handlers
     */
    function emit(event, data) {
        const handlers = eventHandlers.get(event);
        if (handlers) {
            handlers.forEach(handler => {
                try {
                    handler(data);
                } catch (error) {
                    console.error(`[WebRTC] Handler error for ${event}:`, error);
                }
            });
        }
    }
    
    /**
     * Register event handler
     */
    function on(event, handler) {
        if (!eventHandlers.has(event)) {
            eventHandlers.set(event, []);
        }
        eventHandlers.get(event).push(handler);
        return () => {
            const handlers = eventHandlers.get(event);
            if (handlers) {
                const index = handlers.indexOf(handler);
                if (index > -1) handlers.splice(index, 1);
            }
        };
    }
    
    /**
     * Create peer connection
     */
    function createPeerConnection(role, roomPin) {
        if (peerConnection) {
            closePeerConnection();
        }
        
        isHost = (role === 'host');
        currentRoom = roomPin;
        
        peerConnection = new RTCPeerConnection(CONFIG);
        
        // Connection state monitoring
        peerConnection.onconnectionstatechange = () => {
            const state = peerConnection.connectionState;
            console.log('[WebRTC] Connection state:', state);
            setConnectionState(state);
        };
        
        peerConnection.oniceconnectionstatechange = () => {
            console.log('[WebRTC] ICE connection state:', peerConnection.iceConnectionState);
        };
        
        peerConnection.onicegatheringstatechange = () => {
            console.log('[WebRTC] ICE gathering state:', peerConnection.iceGatheringState);
        };
        
        // ICE candidate handling
        peerConnection.onicecandidate = (event) => {
            if (event.candidate && currentRoom) {
                console.log('[WebRTC] Local ICE candidate:', event.candidate.candidate);
                SocketClient.sendIceCandidate(currentRoom, event.candidate.toJSON());
            }
        };
        
        // Data channel handling
        if (isHost) {
            createDataChannel();
        } else {
            peerConnection.ondatachannel = (event) => {
                console.log('[WebRTC] Received data channel:', event.channel.label);
                setupDataChannel(event.channel);
            };
        }
        
        return peerConnection;
    }
    
    /**
     * Create and setup data channel (host)
     */
    function createDataChannel() {
        dataChannel = peerConnection.createDataChannel('file-transfer', DATA_CHANNEL_OPTIONS);
        setupDataChannel(dataChannel);
    }
    
    /**
     * Setup data channel event handlers
     */
    function setupDataChannel(channel) {
        dataChannel = channel;
        
        channel.onopen = () => {
            console.log('[WebRTC] Data channel opened');
            setConnectionState('connected');
            emit('datachannel_open');
        };
        
        channel.onclose = () => {
            console.log('[WebRTC] Data channel closed');
            setConnectionState('disconnected');
            emit('datachannel_close');
        };
        
        channel.onerror = (error) => {
            console.error('[WebRTC] Data channel error:', error);
            emit('error', { message: 'Data channel error', error });
        };
        
        channel.onmessage = (event) => {
            handleDataChannelMessage(event.data);
        };
        
        // Monitor buffered amount for backpressure
        channel.onbufferedamountlow = () => {
            if (currentFileTransfer && currentFileTransfer.paused) {
                console.log('[WebRTC] Buffer low, resuming transfer');
                currentFileTransfer.paused = false;
                readNextChunk();
            }
        };
    }
    
    /**
     * Create offer (host)
     */
    async function createOffer() {
        if (!peerConnection || !isHost) return null;
        
        try {
            const offer = await peerConnection.createOffer({
                offerToReceiveAudio: false,
                offerToReceiveVideo: false
            });
            
            await peerConnection.setLocalDescription(offer);
            console.log('[WebRTC] Created offer');
            
            if (currentRoom) {
                SocketClient.sendOffer(currentRoom, peerConnection.localDescription.toJSON());
            }
            
            return offer;
        } catch (error) {
            console.error('[WebRTC] Error creating offer:', error);
            emit('error', { message: 'Failed to create offer', error });
            throw error;
        }
    }
    
    /**
     * Create answer (peer)
     */
    async function createAnswer() {
        if (!peerConnection || isHost) return null;
        
        try {
            const answer = await peerConnection.createAnswer();
            await peerConnection.setLocalDescription(answer);
            console.log('[WebRTC] Created answer');
            
            if (currentRoom) {
                SocketClient.sendAnswer(currentRoom, peerConnection.localDescription.toJSON());
            }
            
            return answer;
        } catch (error) {
            console.error('[WebRTC] Error creating answer:', error);
            emit('error', { message: 'Failed to create answer', error });
            throw error;
        }
    }
    
    /**
     * Handle incoming offer
     */
    async function handleOffer(offer) {
        if (!peerConnection) return;
        
        try {
            await peerConnection.setRemoteDescription(new RTCSessionDescription(offer));
            console.log('[WebRTC] Set remote offer');
            await createAnswer();
        } catch (error) {
            console.error('[WebRTC] Error handling offer:', error);
            emit('error', { message: 'Failed to handle offer', error });
        }
    }
    
    /**
     * Handle incoming answer
     */
    async function handleAnswer(answer) {
        if (!peerConnection) return;
        
        try {
            await peerConnection.setRemoteDescription(new RTCSessionDescription(answer));
            console.log('[WebRTC] Set remote answer');
        } catch (error) {
            console.error('[WebRTC] Error handling answer:', error);
            emit('error', { message: 'Failed to handle answer', error });
        }
    }
    
    /**
     * Handle incoming ICE candidate
     */
    async function handleIceCandidate(candidate) {
        if (!peerConnection) return;
        
        try {
            await peerConnection.addIceCandidate(new RTCIceCandidate(candidate));
            console.log('[WebRTC] Added ICE candidate');
        } catch (error) {
            console.error('[WebRTC] Error adding ICE candidate:', error);
        }
    }
    
    /**
     * Set connection state and emit event
     */
    function setConnectionState(state) {
        connectionState = state;
        emit('connection_state_change', { state });
    }
    
    /**
     * Get current connection state
     */
    function getConnectionState() {
        return connectionState;
    }
    
    /**
     * Check if connected
     */
    function isConnected() {
        return connectionState === 'connected' && dataChannel?.readyState === 'open';
    }
    
    // ========================================
    // File Transfer Logic
    // ========================================
    
    /**
     * Send file metadata to peer
     */
    function sendFileMetadata(files) {
        if (!isConnected()) {
            emit('error', { message: 'Not connected to peer' });
            return false;
        }
        
        const metadata = files.map(file => ({
            name: file.name,
            size: file.size,
            type: file.type || 'application/octet-stream',
            lastModified: file.lastModified
        }));
        
        currentFileTransfer = {
            files: [...files],
            fileIndex: 0,
            fileReader: new FileReader(),
            currentChunk: null,
            chunkOffset: 0,
            totalChunks: 0,
            chunksSent: 0,
            paused: false,
            startTime: Date.now(),
            bytesSent: 0
        };
        
        // Send metadata for all files
        SocketClient.sendFileMetadata(currentRoom, {
            files: metadata,
            totalFiles: files.length
        });
        
        // Start sending first file
        sendNextFile();
        return true;
    }
    
    /**
     * Send next file in queue
     */
    function sendNextFile() {
        if (!currentFileTransfer || currentFileTransfer.fileIndex >= currentFileTransfer.files.length) {
            // All files sent
            currentFileTransfer = null;
            emit('transfer_complete', { success: true });
            return;
        }
        
        const file = currentFileTransfer.files[currentFileTransfer.fileIndex];
        currentFileTransfer.currentFile = file;
        currentFileTransfer.chunkOffset = 0;
        currentFileTransfer.totalChunks = Math.ceil(file.size / CHUNK_SIZE);
        currentFileTransfer.chunksSent = 0;
        currentFileTransfer.fileStartTime = Date.now();
        
        emit('file_start', {
            file,
            index: currentFileTransfer.fileIndex,
            total: currentFileTransfer.files.length
        });
        
        readNextChunk();
    }
    
    /**
     * Read next chunk from file
     */
    function readNextChunk() {
        if (!currentFileTransfer || currentFileTransfer.paused) return;
        
        const file = currentFileTransfer.currentFile;
        const start = currentFileTransfer.chunkOffset;
        const end = Math.min(start + CHUNK_SIZE, file.size);
        
        if (start >= file.size) {
            // File complete
            currentFileTransfer.fileIndex++;
            sendNextFile();
            return;
        }
        
        const chunk = file.slice(start, end);
        currentFileTransfer.fileReader.readAsArrayBuffer(chunk);
        
        currentFileTransfer.fileReader.onload = (event) => {
            currentFileTransfer.currentChunk = event.target.result;
            sendChunk();
        };
        
        currentFileTransfer.fileReader.onerror = (error) => {
            console.error('[WebRTC] File read error:', error);
            emit('error', { message: 'Failed to read file', error });
        };
    }
    
    /**
     * Send current chunk via data channel
     */
    function sendChunk() {
        if (!currentFileTransfer || !dataChannel || dataChannel.readyState !== 'open') return;
        
        const chunk = currentFileTransfer.currentChunk;
        
        // Check backpressure
        if (dataChannel.bufferedAmount > BACKPRESSURE_THRESHOLD) {
            currentFileTransfer.paused = true;
            console.log('[WebRTC] Backpressure detected, pausing');
            return;
        }
        
        try {
            // Send chunk with header: [4 bytes chunk size][chunk data]
            const header = new ArrayBuffer(4);
            new DataView(header).setUint32(0, chunk.byteLength, true);
            
            const combined = new Uint8Array(header.byteLength + chunk.byteLength);
            combined.set(new Uint8Array(header), 0);
            combined.set(new Uint8Array(chunk), header.byteLength);
            
            dataChannel.send(combined.buffer);
            
            currentFileTransfer.chunkOffset += chunk.byteLength;
            currentFileTransfer.chunksSent++;
            currentFileTransfer.bytesSent += chunk.byteLength;
            
            // Emit progress
            const progress = (currentFileTransfer.chunkOffset / currentFileTransfer.currentFile.size) * 100;
            const elapsed = (Date.now() - currentFileTransfer.fileStartTime) / 1000;
            const speed = elapsed > 0 ? currentFileTransfer.bytesSent / elapsed : 0;
            
            emit('progress', {
                file: currentFileTransfer.currentFile,
                progress,
                bytesSent: currentFileTransfer.chunkOffset,
                totalBytes: currentFileTransfer.currentFile.size,
                speed,
                fileIndex: currentFileTransfer.fileIndex,
                totalFiles: currentFileTransfer.files.length
            });
            
            // Continue if not paused
            if (!currentFileTransfer.paused) {
                // Use setTimeout to yield to event loop
                setTimeout(readNextChunk, 0);
            }
        } catch (error) {
            console.error('[WebRTC] Send error:', error);
            emit('error', { message: 'Failed to send chunk', error });
        }
    }
    
    /**
     * Handle incoming data channel message
     */
    function handleDataChannelMessage(data) {
        const buffer = data instanceof ArrayBuffer ? data : new Uint8Array(data).buffer;

        // Chunks can arrive over the P2P data channel before the metadata
        // event (relayed via the signaling server) is processed - queue them.
        if (!window.__fileReceiver) {
            preMetadataChunks.push(buffer);
            return;
        }

        processReceivedBuffer(buffer);
    }

    /**
     * Process a raw framed buffer received from the data channel
     */
    function processReceivedBuffer(buffer) {
        const receiver = window.__fileReceiver;
        const chunk = new Uint8Array(buffer);
        const combined = new Uint8Array(receiver.buffer.length + chunk.length);
        combined.set(receiver.buffer, 0);
        combined.set(chunk, receiver.buffer.length);
        receiver.buffer = combined;
        
        // Process complete chunks
        while (receiver.buffer.length >= 4) {
            const chunkSize = new DataView(receiver.buffer.buffer, receiver.buffer.byteOffset, 4).getUint32(0, true);
            
            if (receiver.buffer.length < 4 + chunkSize) break;
            
            // Extract chunk data
            const chunkData = receiver.buffer.slice(4, 4 + chunkSize);
            receiver.buffer = receiver.buffer.slice(4 + chunkSize);
            
            if (!receiver.currentFile && receiver.files.length > 0) {
                receiver.currentFile = receiver.files[receiver.fileIndex];
                receiver.bytesReceived = 0;
                receiver.fileStartTime = Date.now();
                emit('file_start', {
                    file: receiver.currentFile,
                    index: receiver.fileIndex,
                    total: receiver.files.length
                });
            }
            
            if (receiver.currentFile) {
                // Append to file
                if (!receiver.currentFile._chunks) receiver.currentFile._chunks = [];
                receiver.currentFile._chunks.push(chunkData);
                receiver.bytesReceived += chunkData.length;
                
                const progress = (receiver.bytesReceived / receiver.currentFile.size) * 100;
                const elapsed = (Date.now() - receiver.fileStartTime) / 1000;
                const speed = elapsed > 0 ? receiver.bytesReceived / elapsed : 0;
                
                emit('progress', {
                    file: receiver.currentFile,
                    progress,
                    bytesReceived: receiver.bytesReceived,
                    totalBytes: receiver.currentFile.size,
                    speed,
                    fileIndex: receiver.fileIndex,
                    totalFiles: receiver.files.length
                });
                
                // Check if file complete
                if (receiver.bytesReceived >= receiver.currentFile.size) {
                    // Assemble and save file
                    completeFile(receiver.currentFile);
                    receiver.fileIndex++;
                    receiver.currentFile = null;
                    
                    if (receiver.fileIndex >= receiver.files.length) {
                        // All files received
                        emit('transfer_complete', { success: true });
                        window.__fileReceiver = null;
                    }
                }
            }
        }
    }
    
    /**
     * Complete file reception and trigger download
     */
    function completeFile(file) {
        if (!file._chunks || file._chunks.length === 0) return;
        
        // Combine chunks
        const totalSize = file._chunks.reduce((sum, chunk) => sum + chunk.length, 0);
        const combined = new Uint8Array(totalSize);
        let offset = 0;
        
        for (const chunk of file._chunks) {
            combined.set(chunk, offset);
            offset += chunk.length;
        }
        
        // Create blob and download
        const blob = new Blob([combined], { type: file.type });
        const url = URL.createObjectURL(blob);
        
        const a = document.createElement('a');
        a.href = url;
        a.download = file.name;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        
        // Cleanup
        setTimeout(() => URL.revokeObjectURL(url), 1000);
        
        emit('file_complete', { file });
    }
    
    /**
     * Handle incoming file metadata (receiver)
     */
    function handleFileMetadata(metadata) {
        console.log('[WebRTC] Received file metadata:', metadata);
        
        const files = metadata.files.map(f => ({
            name: f.name,
            size: f.size,
            type: f.type,
            lastModified: f.lastModified
        }));
        
        // Initialize receiver
        window.__fileReceiver = {
            buffer: new Uint8Array(),
            files,
            fileIndex: 0,
            currentFile: null,
            bytesReceived: 0
        };
        
        pendingFiles = files;
        emit('files_announced', { files, totalFiles: files.length });
        
        // Replay any chunks that arrived before this metadata
        if (preMetadataChunks.length) {
            const queued = preMetadataChunks;
            preMetadataChunks = [];
            queued.forEach(processReceivedBuffer);
        }
    }
    
    /**
     * Cancel current transfer
     */
    function cancelTransfer() {
        if (currentFileTransfer) {
            currentFileTransfer.paused = true;
            currentFileTransfer = null;
        }
        
        if (window.__fileReceiver) {
            window.__fileReceiver = null;
        }
        
        pendingFiles = [];
        preMetadataChunks = [];
        emit('transfer_cancelled');
    }
    
    /**
     * Close peer connection
     */
    function closePeerConnection() {
        if (dataChannel) {
            dataChannel.close();
            dataChannel = null;
        }
        
        if (peerConnection) {
            peerConnection.close();
            peerConnection = null;
        }
        
        currentRoom = null;
        isHost = false;
        setConnectionState('disconnected');
        
        // Clear stats interval
        if (statsInterval) {
            clearInterval(statsInterval);
            statsInterval = null;
        }
    }
    
    /**
     * Get connection stats
     */
    async function getStats() {
        if (!peerConnection) return null;
        
        const stats = await peerConnection.getStats();
        const result = {
            timestamp: Date.now(),
            localCandidates: [],
            remoteCandidates: [],
            selectedCandidatePair: null,
            bytesSent: 0,
            bytesReceived: 0
        };
        
        stats.forEach(report => {
            if (report.type === 'local-candidate') {
                result.localCandidates.push({
                    address: report.address,
                    port: report.port,
                    protocol: report.protocol,
                    candidateType: report.candidateType
                });
            } else if (report.type === 'remote-candidate') {
                result.remoteCandidates.push({
                    address: report.address,
                    port: report.port,
                    protocol: report.protocol,
                    candidateType: report.candidateType
                });
            } else if (report.type === 'candidate-pair' && report.selected) {
                result.selectedCandidatePair = {
                    local: report.localCandidateId,
                    remote: report.remoteCandidateId,
                    state: report.state,
                    bytesSent: report.bytesSent,
                    bytesReceived: report.bytesReceived,
                    currentRoundTripTime: report.currentRoundTripTime
                };
            } else if (report.type === 'outbound-rtp' || report.type === 'data-channel') {
                result.bytesSent += report.bytesSent || 0;
                result.bytesReceived += report.bytesReceived || 0;
            }
        });
        
        return result;
    }
    
    // Public API
    return {
        on,
        createPeerConnection,
        createOffer,
        handleOffer,
        handleAnswer,
        handleIceCandidate,
        sendFileMetadata,
        handleFileMetadata,
        cancelTransfer,
        closePeerConnection,
        getConnectionState,
        isConnected,
        getStats,
        CONFIG
    };
})();

// Expose globally for main.js
window.WebRTC = WebRTC;

// Export for module systems
if (typeof module !== 'undefined' && module.exports) {
    module.exports = WebRTC;
}