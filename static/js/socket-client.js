/**
 * Socket.IO Client Module
 * Handles connection, events, and communication with signaling server
 */

const SocketClient = (() => {
    let socket = null;
    let eventHandlers = new Map();
    let currentRoom = null;
    let currentRole = null;
    let mySid = null;
    
    // Event names
    const EVENTS = {
        // Connection
        CONNECT: 'connect',
        DISCONNECT: 'disconnect',
        CONNECTED: 'connected',
        
        // Room management
        CREATE_ROOM: 'create_room',
        ROOM_CREATED: 'room_created',
        JOIN_ROOM: 'join_room',
        ROOM_JOINED: 'room_joined',
        PEER_JOINED: 'peer_joined',
        PEER_LEFT: 'peer_left',
        LEAVE_ROOM: 'leave_room',
        ERROR: 'error',
        
        // WebRTC Signaling
        OFFER: 'offer',
        ANSWER: 'answer',
        ICE_CANDIDATE: 'ice_candidate',
        
        // File transfer
        FILE_METADATA: 'file_metadata',
        TRANSFER_COMPLETE: 'transfer_complete'
    };
    
    /**
     * Initialize socket connection
     */
    function init() {
        if (socket) return socket;
        
        // Connect to same origin
        socket = io({
            transports: ['websocket', 'polling'],
            reconnection: true,
            reconnectionAttempts: 5,
            reconnectionDelay: 1000,
            reconnectionDelayMax: 5000,
            timeout: 10000
        });
        
        // Core connection events
        socket.on(EVENTS.CONNECT, () => {
            console.log('[Socket] Connected:', socket.id);
            mySid = socket.id;
            emit('connected', { sid: socket.id });
        });
        
        socket.on(EVENTS.DISCONNECT, (reason) => {
            console.log('[Socket] Disconnected:', reason);
            emit('disconnected', { reason });
            
            // Clean up room state on disconnect
            if (currentRoom) {
                currentRoom = null;
                currentRole = null;
            }
        });
        
        socket.on(EVENTS.CONNECTED, (data) => {
            mySid = data.sid;
            emit('connected', data);
        });
        
        // Room events
        socket.on(EVENTS.ROOM_CREATED, (data) => {
            console.log('[Socket] Room created:', data);
            currentRoom = data.pin;
            currentRole = 'host';
            emit(EVENTS.ROOM_CREATED, data);
        });
        
        socket.on(EVENTS.ROOM_JOINED, (data) => {
            console.log('[Socket] Room joined:', data);
            currentRoom = data.pin;
            currentRole = 'peer';
            emit(EVENTS.ROOM_JOINED, data);
        });
        
        socket.on(EVENTS.PEER_JOINED, (data) => {
            console.log('[Socket] Peer joined:', data);
            emit(EVENTS.PEER_JOINED, data);
        });
        
        socket.on(EVENTS.PEER_LEFT, (data) => {
            console.log('[Socket] Peer left');
            emit(EVENTS.PEER_LEFT, data);
            
            // Reset room state if we were in a room
            if (currentRoom) {
                currentRoom = null;
                currentRole = null;
            }
        });
        
        socket.on(EVENTS.ERROR, (data) => {
            console.error('[Socket] Error:', data);
            emit(EVENTS.ERROR, data);
        });
        
        // WebRTC Signaling events
        socket.on(EVENTS.OFFER, (data) => {
            console.log('[Socket] Received offer from:', data.from_sid);
            emit(EVENTS.OFFER, data);
        });
        
        socket.on(EVENTS.ANSWER, (data) => {
            console.log('[Socket] Received answer from:', data.from_sid);
            emit(EVENTS.ANSWER, data);
        });
        
        socket.on(EVENTS.ICE_CANDIDATE, (data) => {
            console.log('[Socket] Received ICE candidate from:', data.from_sid);
            emit(EVENTS.ICE_CANDIDATE, data);
        });
        
        // File transfer events
        socket.on(EVENTS.FILE_METADATA, (data) => {
            console.log('[Socket] Received file metadata:', data);
            emit(EVENTS.FILE_METADATA, data);
        });
        
        socket.on(EVENTS.TRANSFER_COMPLETE, (data) => {
            console.log('[Socket] Transfer complete:', data);
            emit(EVENTS.TRANSFER_COMPLETE, data);
        });
        
        return socket;
    }
    
    /**
     * Register event handler
     */
    function on(event, handler) {
        if (!eventHandlers.has(event)) {
            eventHandlers.set(event, []);
        }
        eventHandlers.get(event).push(handler);
        
        // Return unsubscribe function
        return () => {
            const handlers = eventHandlers.get(event);
            if (handlers) {
                const index = handlers.indexOf(handler);
                if (index > -1) handlers.splice(index, 1);
            }
        };
    }
    
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
                    console.error(`[Socket] Handler error for ${event}:`, error);
                }
            });
        }
    }
    
    /**
     * Create a new room (host)
     */
    function createRoom() {
        if (!socket || !socket.connected) {
            console.error('[Socket] Not connected');
            return;
        }
        socket.emit(EVENTS.CREATE_ROOM);
    }
    
    /**
     * Join existing room (peer)
     */
    function joinRoom(pin) {
        if (!socket || !socket.connected) {
            console.error('[Socket] Not connected');
            return;
        }
        socket.emit(EVENTS.JOIN_ROOM, { pin });
    }
    
    /**
     * Leave current room
     */
    function leaveRoom() {
        if (!socket || !socket.connected || !currentRoom) {
            return;
        }
        socket.emit(EVENTS.LEAVE_ROOM);
        currentRoom = null;
        currentRole = null;
    }
    
    /**
     * Send SDP offer
     */
    function sendOffer(pin, sdp) {
        if (!socket || !socket.connected) return;
        socket.emit(EVENTS.OFFER, { pin, sdp });
    }
    
    /**
     * Send SDP answer
     */
    function sendAnswer(pin, sdp) {
        if (!socket || !socket.connected) return;
        socket.emit(EVENTS.ANSWER, { pin, sdp });
    }
    
    /**
     * Send ICE candidate
     */
    function sendIceCandidate(pin, candidate) {
        if (!socket || !socket.connected) return;
        socket.emit(EVENTS.ICE_CANDIDATE, { pin, candidate });
    }
    
    /**
     * Send file metadata
     */
    function sendFileMetadata(pin, metadata) {
        if (!socket || !socket.connected) return;
        socket.emit(EVENTS.FILE_METADATA, { pin, ...metadata });
    }
    
    /**
     * Send transfer complete notification
     */
    function sendTransferComplete(pin, data) {
        if (!socket || !socket.connected) return;
        socket.emit(EVENTS.TRANSFER_COMPLETE, { pin, ...data });
    }
    
    /**
     * Get current connection state
     */
    function getState() {
        return {
            connected: socket?.connected ?? false,
            sid: mySid,
            room: currentRoom,
            role: currentRole
        };
    }
    
    /**
     * Check if in a room
     */
    function isInRoom() {
        return !!currentRoom;
    }
    
    /**
     * Get current room PIN
     */
    function getRoom() {
        return currentRoom;
    }
    
    /**
     * Get current role
     */
    function getRole() {
        return currentRole;
    }
    
    /**
     * Get socket ID
     */
    function getSid() {
        return mySid;
    }
    
    /**
     * Disconnect socket
     */
    function disconnect() {
        if (socket) {
            socket.disconnect();
            socket = null;
            eventHandlers.clear();
            currentRoom = null;
            currentRole = null;
            mySid = null;
        }
    }
    
    // Public API
    return {
        init,
        on,
        createRoom,
        joinRoom,
        leaveRoom,
        sendOffer,
        sendAnswer,
        sendIceCandidate,
        sendFileMetadata,
        sendTransferComplete,
        getState,
        isInRoom,
        getRoom,
        getRole,
        getSid,
        disconnect,
        EVENTS
    };
})();

// Expose globally for main.js
window.SocketClient = SocketClient;

// Export for module systems
if (typeof module !== 'undefined' && module.exports) {
    module.exports = SocketClient;
}