/**
 * Main Application Initializer
 * Coordinates all modules and handles application lifecycle
 */

(function() {
    'use strict';
    
    // Module references
    const SocketClient = window.SocketClient;
    const WebRTC = window.WebRTC;
    const UI = window.UI;
    
    // App state
    let appState = {
        role: null, // 'host' | 'peer'
        roomPin: null,
        isInitialized: false
    };
    
    // Unsubscribe functions
    const unsubscribes = [];
    
    /**
     * Initialize the application
     */
    async function init() {
        if (appState.isInitialized) return;
        
        console.log('[App] Initializing...');
        
        // Initialize UI
        UI.init();
        
        // Initialize Socket.IO
        SocketClient.init();
        
        // Check for room PIN in URL
        const urlParams = new URLSearchParams(window.location.search);
        const roomPin = urlParams.get('room');
        
        if (roomPin && /^\d{6}$/.test(roomPin)) {
            // Auto-join as peer
            appState.role = 'peer';
            appState.roomPin = roomPin;
            UI.showPeerScreen();
            UI.clearPinInput();
            // Small delay to ensure socket is connected
            setTimeout(() => joinRoom(roomPin), 500);
        }
        
        // Setup event listeners
        setupSocketListeners();
        setupWebRTCListeners();
        setupUIListeners();
        
        // Handle before unload
        window.addEventListener('beforeunload', cleanup);
        
        appState.isInitialized = true;
        console.log('[App] Initialized');
    }
    
    /**
     * Setup Socket.IO event listeners
     */
    function setupSocketListeners() {
        // Connection events
        unsubscribes.push(SocketClient.on('connected', (data) => {
            console.log('[App] Socket connected:', data.sid);
        }));
        
        unsubscribes.push(SocketClient.on('disconnected', (data) => {
            console.log('[App] Socket disconnected:', data.reason);
            UI.showToast('error', 'Disconnected', 'Connection to server lost. Attempting to reconnect...');
            UI.updateConnectionStatus(appState.role, 'disconnected');
        }));
        
        // Room events
        unsubscribes.push(SocketClient.on('room_created', (data) => {
            console.log('[App] Room created:', data);
            appState.roomPin = data.pin;
            appState.role = 'host';
            UI.updateHostScreen(data);
            
            // Create peer connection and send offer
            WebRTC.createPeerConnection('host', data.pin);
            WebRTC.createOffer();
        }));
        
        unsubscribes.push(SocketClient.on('room_joined', (data) => {
            console.log('[App] Room joined:', data);
            appState.roomPin = data.pin;
            appState.role = 'peer';
            
            // Create peer connection
            WebRTC.createPeerConnection('peer', data.pin);
            
            // Show transfer screen for peer
            UI.showPeerTransferScreen();
        }));
        
        unsubscribes.push(SocketClient.on('peer_joined', (data) => {
            console.log('[App] Peer joined:', data);
            UI.showPeerConnected();
            
            // Host creates offer after peer joins
            WebRTC.createOffer();
        }));
        
        unsubscribes.push(SocketClient.on('peer_left', () => {
            console.log('[App] Peer left');
            UI.showToast('info', 'Peer Disconnected', 'The other device has left the room');
            
            if (appState.role === 'host') {
                UI.showPeerDisconnected();
                UI.showScreen('host');
            } else {
                // Peer was disconnected, go back to role screen
                UI.showScreen('role');
                resetAppState();
            }
            
            WebRTC.closePeerConnection();
        }));
        
        unsubscribes.push(SocketClient.on('error', (data) => {
            console.error('[App] Socket error:', data);
            UI.showToast('error', 'Error', data.message || 'An error occurred');
        }));
        
        // WebRTC Signaling
        unsubscribes.push(SocketClient.on('offer', (data) => {
            console.log('[App] Received offer');
            WebRTC.handleOffer(data.sdp);
        }));
        
        unsubscribes.push(SocketClient.on('answer', (data) => {
            console.log('[App] Received answer');
            WebRTC.handleAnswer(data.sdp);
        }));
        
        unsubscribes.push(SocketClient.on('ice_candidate', (data) => {
            WebRTC.handleIceCandidate(data.candidate);
        }));
        
        // File transfer
        unsubscribes.push(SocketClient.on('file_metadata', (data) => {
            console.log('[App] Received file metadata');
            WebRTC.handleFileMetadata(data);
        }));
        
        unsubscribes.push(SocketClient.on('transfer_complete', (data) => {
            console.log('[App] Transfer complete notification');
            // Handled by WebRTC module
        }));
    }
    
    /**
     * Setup WebRTC event listeners
     */
    function setupWebRTCListeners() {
        unsubscribes.push(WebRTC.on('connection_state_change', (data) => {
            console.log('[App] Connection state:', data.state);
            UI.updateConnectionStatus(appState.role, data.state);
        }));
        
        unsubscribes.push(WebRTC.on('datachannel_open', () => {
            console.log('[App] Data channel open');
            if (appState.role === 'host') {
                UI.showHostTransferScreen();
            }
        }));
        
        unsubscribes.push(WebRTC.on('datachannel_close', () => {
            console.log('[App] Data channel closed');
        }));
        
        unsubscribes.push(WebRTC.on('error', (data) => {
            console.error('[App] WebRTC error:', data);
            UI.showToast('error', 'Connection Error', data.message);
        }));
        
        // File transfer events
        unsubscribes.push(WebRTC.on('files_announced', (data) => {
            console.log('[App] Files announced:', data.files.length);
            UI.setReceivingStatus(data.totalFiles);
        }));
        
        unsubscribes.push(WebRTC.on('file_start', (data) => {
            console.log('[App] File transfer started:', data.file.name);
            
            if (appState.role === 'host') {
                // Already added to list when files selected
            } else {
                UI.addReceiveItem(data.file);
            }
            
            UI.showProgressModal(data.file.name);
        }));
        
        unsubscribes.push(WebRTC.on('progress', (data) => {
            UI.updateProgressModal(data.progress, data.speed);
            
            if (appState.role === 'host') {
                UI.updateTransferItem(data.fileIndex, data.progress, data.speed);
            }
        }));
        
        unsubscribes.push(WebRTC.on('file_complete', (data) => {
            console.log('[App] File complete:', data.file.name);
            UI.hideProgressModal();
            
            if (appState.role === 'host') {
                UI.removeTransferItem(data.fileIndex);
            }
        }));
        
        unsubscribes.push(WebRTC.on('transfer_complete', (data) => {
            console.log('[App] All transfers complete');
            UI.hideProgressModal();
            UI.showToast('success', 'Transfer Complete', 'All files have been transferred successfully');
        }));
        
        unsubscribes.push(WebRTC.on('transfer_cancelled', () => {
            console.log('[App] Transfer cancelled');
            UI.hideProgressModal();
            UI.showToast('info', 'Transfer Cancelled', 'File transfer was cancelled');
        }));
    }
    
    /**
     * Setup UI event listeners
     */
    function setupUIListeners() {
        // Role selection
        UI.on('host_selected', () => {
            appState.role = 'host';
            SocketClient.createRoom();
        });
        
        UI.on('peer_selected', () => {
            appState.role = 'peer';
            UI.showPeerScreen();
        });
        
        // Back buttons
        UI.on('back_to_role', () => {
            leaveRoom();
            UI.showScreen('role');
            resetAppState();
        });
        
        // Tab switching
        UI.on('tab_changed', (data) => {
            UI.switchTab(data.tab);
        });
        
        // Join room
        UI.on('join_room', (data) => {
            joinRoom(data.pin);
        });
        
        // QR scanner
        UI.on('toggle_scanner', () => {
            UI.toggleScanner();
        });
        
        // File selection
        UI.on('files_selected', (data) => {
            sendFiles(data.files);
        });
        
        // Cancel transfer
        UI.on('cancel_transfer', (data) => {
            WebRTC.cancelTransfer();
        });
        
        // Modal close
        UI.on('close_modal', () => {
            UI.hideProgressModal();
        });
        
        // Bind DOM events
        bindDOMEvents();
    }
    
    /**
     * Bind DOM events to UI callbacks
     */
    function bindDOMEvents() {
        // Role buttons
        document.getElementById('host-btn')?.addEventListener('click', () => {
            UI.selectHost();
        });
        
        document.getElementById('peer-btn')?.addEventListener('click', () => {
            UI.selectPeer();
        });
        
        // Back buttons
        document.getElementById('host-back-btn')?.addEventListener('click', () => {
            UI.goBack();
        });
        
        document.getElementById('peer-back-btn')?.addEventListener('click', () => {
            UI.goBack();
        });
        
        // Disconnect buttons on transfer screens
        document.getElementById('host-disconnect-btn')?.addEventListener('click', () => {
            UI.goBack();
        });
        
        document.getElementById('peer-disconnect-btn')?.addEventListener('click', () => {
            UI.goBack();
        });
        
        // Tab buttons
        document.querySelectorAll('.tab-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                UI.emit('tab_changed', { tab: btn.dataset.tab });
            });
        });
        
        // PIN form
        const pinForm = document.getElementById('pin-form');
        pinForm?.addEventListener('submit', (e) => {
            e.preventDefault();
            const pin = UI.getPinInput();
            if (pin.length === 6 && /^\d{6}$/.test(pin)) {
                UI.emit('join_room', { pin });
            } else {
                UI.setPinError('Please enter a valid 6-digit PIN');
            }
        });
        
        // PIN input formatting
        const pinInput = document.getElementById('pin-input');
        pinInput?.addEventListener('input', (e) => {
            // Only allow digits
            e.target.value = e.target.value.replace(/\D/g, '').slice(0, 6);
            UI.hideError(document.getElementById('pin-error'));
            e.target.classList.remove('error');
        });
        
        // QR scanner toggle
        document.getElementById('scan-btn')?.addEventListener('click', () => {
            UI.emit('toggle_scanner');
        });
        
        // Drop zone
        UI.setupDropZone((files) => {
            UI.emit('files_selected', { files });
        });
        
        // Copy PIN
        document.getElementById('copy-pin-btn')?.addEventListener('click', () => {
            const pin = document.getElementById('pin-code').textContent.replace(/\s/g, '');
            navigator.clipboard.writeText(pin).then(() => {
                UI.showToast('success', 'Copied', 'Room PIN copied to clipboard');
            }).catch(() => {
                UI.showToast('error', 'Failed', 'Could not copy to clipboard');
            });
        });
        
        // Modal close
        document.getElementById('modal-close')?.addEventListener('click', () => {
            UI.emit('close_modal');
        });
        
        document.getElementById('cancel-transfer')?.addEventListener('click', () => {
            UI.emit('cancel_transfer');
        });
        
        // Close modal on backdrop click
        document.getElementById('progress-modal')?.addEventListener('click', (e) => {
            if (e.target === e.currentTarget) {
                UI.emit('close_modal');
            }
        });
        
        // Keyboard shortcuts
        document.addEventListener('keydown', (e) => {
            // Escape to close modal or go back
            if (e.key === 'Escape') {
                const modal = document.getElementById('progress-modal');
                if (!modal.classList.contains('hidden')) {
                    UI.emit('close_modal');
                } else if (UI.getCurrentScreen() !== 'role-screen') {
                    UI.emit('back_to_role');
                }
            }
        });
    }
    
    /**
     * Join room as peer
     */
    function joinRoom(pin) {
        if (!SocketClient.getState().connected) {
            UI.showToast('error', 'Not Connected', 'Waiting for server connection...');
            // Retry after a moment
            setTimeout(() => joinRoom(pin), 1000);
            return;
        }
        
        SocketClient.joinRoom(pin);
    }
    
    /**
     * Leave current room
     */
    function leaveRoom() {
        SocketClient.leaveRoom();
        WebRTC.closePeerConnection();
    }
    
    /**
     * Send files
     */
    function sendFiles(files) {
        if (!WebRTC.isConnected()) {
            UI.showToast('error', 'Not Connected', 'Waiting for peer connection...');
            return;
        }
        
        // Add files to transfer list
        files.forEach((file, index) => {
            UI.addTransferItem(file, index);
        });
        
        // Start transfer
        WebRTC.sendFileMetadata(files);
    }
    
    /**
     * Reset app state
     */
    function resetAppState() {
        appState.role = null;
        appState.roomPin = null;
        UI.clearPinInput();
    }
    
    /**
     * Cleanup on page unload
     */
    function cleanup() {
        leaveRoom();
        
        // Unsubscribe all listeners
        unsubscribes.forEach(unsub => unsub());
        unsubscribes.length = 0;
        
        SocketClient.disconnect();
    }
    
    // Initialize when DOM is ready
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
    
    // Expose for debugging
    window.FileDaoApp = {
        init,
        getState: () => ({ ...appState }),
        SocketClient,
        WebRTC,
        UI
    };
})();