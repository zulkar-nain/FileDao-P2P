/**
 * UI Module
 * Handles UI state management, screen transitions, QR code rendering, and camera scanning
 */

const UI = (() => {
    // DOM Elements
    const elements = {};
    
    // State
    let currentScreen = 'role-screen';
    let qrScanner = null;
    let isScanning = false;
    
    // Screen definitions
    const SCREENS = {
        ROLE: 'role-screen',
        HOST: 'host-screen',
        PEER: 'peer-screen',
        TRANSFER_HOST: 'transfer-host-screen',
        TRANSFER_PEER: 'transfer-peer-screen'
    };
    
    /**
     * Initialize DOM references
     */
    function cacheElements() {
        // Screens
        elements.screens = {
            role: document.getElementById('role-screen'),
            host: document.getElementById('host-screen'),
            peer: document.getElementById('peer-screen'),
            transferHost: document.getElementById('transfer-host-screen'),
            transferPeer: document.getElementById('transfer-peer-screen')
        };
        
        // Role buttons
        elements.hostBtn = document.getElementById('host-btn');
        elements.peerBtn = document.getElementById('peer-btn');
        
        // Host screen
        elements.hostBackBtn = document.getElementById('host-back-btn');
        elements.pinCode = document.getElementById('pin-code');
        elements.qrImage = document.getElementById('qr-image');
        elements.qrUrl = document.getElementById('qr-url');
        elements.copyPinBtn = document.getElementById('copy-pin-btn');
        elements.hostStatus = document.getElementById('host-status');
        elements.peerInfo = document.getElementById('peer-info');
        
        // Peer screen
        elements.peerBackBtn = document.getElementById('peer-back-btn');
        elements.tabBtns = document.querySelectorAll('.tab-btn');
        elements.tabPanels = document.querySelectorAll('.tab-panel');
        elements.pinForm = document.getElementById('pin-form');
        elements.pinInput = document.getElementById('pin-input');
        elements.joinBtn = document.getElementById('join-btn');
        elements.pinError = document.getElementById('pin-error');
        elements.scanBtn = document.getElementById('scan-btn');
        elements.scannerViewport = document.getElementById('scanner-viewport');
        elements.scannerVideo = document.getElementById('scanner-video');
        elements.qrError = document.getElementById('qr-error');
        
        // Transfer screens
        elements.dropZone = document.getElementById('drop-zone');
        elements.fileInput = document.getElementById('file-input');
        elements.transferList = document.getElementById('transfer-list');
        elements.transferItems = document.getElementById('transfer-items');
        elements.receiveStatus = document.getElementById('receive-status');
        elements.receiveTitle = document.getElementById('receive-title');
        elements.receiveDesc = document.getElementById('receive-desc');
        elements.receiveList = document.getElementById('receive-list');
        elements.receiveItems = document.getElementById('receive-items');
        elements.hostConnStatus = document.getElementById('host-conn-status');
        elements.hostConnText = document.getElementById('host-conn-text');
        elements.peerConnStatus = document.getElementById('peer-conn-status');
        elements.peerConnText = document.getElementById('peer-conn-text');
        
        // Progress modal
        elements.progressModal = document.getElementById('progress-modal');
        elements.progressFilename = document.getElementById('progress-filename');
        elements.progressBar = document.getElementById('progress-bar');
        elements.progressPercent = document.getElementById('progress-percent');
        elements.progressSpeed = document.getElementById('progress-speed');
        elements.modalClose = document.getElementById('modal-close');
        elements.cancelTransfer = document.getElementById('cancel-transfer');
        
        // Toast container
        elements.toastContainer = document.getElementById('toast-container');
    }
    
    /**
     * Show a specific screen
     */
    function showScreen(screenId) {
        // Hide all screens
        Object.values(elements.screens).forEach(screen => {
            if (screen) screen.classList.remove('active');
        });
        
        // Show target screen
        const screen = elements.screens[screenId];
        if (screen) {
            screen.classList.add('active');
            currentScreen = screenId;
        }
        
        // Stop scanner if leaving peer screen
        if (screenId !== 'peer' && isScanning) {
            stopScanner();
        }
    }
    
    /**
     * Get current screen
     */
    function getCurrentScreen() {
        return currentScreen;
    }
    
    // ========================================
    // Host Screen UI
    // ========================================
    
    /**
     * Update host screen with room info
     */
    function updateHostScreen(data) {
        if (data.pin) {
            elements.pinCode.textContent = data.pin.match(/.{1,3}/g).join(' ');
        }
        
        if (data.qr_code) {
            elements.qrImage.src = data.qr_code;
        }
        
        if (data.share_url) {
            elements.qrUrl.textContent = data.share_url;
        }
        
        showScreen('host');
    }
    
    /**
     * Show peer connected state on host screen
     */
    function showPeerConnected() {
        elements.hostStatus.className = 'room-status connected';
        elements.hostStatus.innerHTML = '<span class="status-dot"></span><span>Peer connected</span>';
        elements.peerInfo.classList.remove('hidden');
        
        // Switch to transfer screen
        showScreen('transferHost');
    }
    
    /**
     * Show peer disconnected state on host screen
     */
    function showPeerDisconnected() {
        elements.hostStatus.className = 'room-status';
        elements.hostStatus.innerHTML = '<span class="status-dot"></span><span>Waiting for peer...</span>';
        elements.peerInfo.classList.add('hidden');
    }
    
    // ========================================
    // Peer Screen UI
    // ========================================
    
    /**
     * Show peer screen
     */
    function showPeerScreen() {
        showScreen('peer');
        // Auto-focus PIN input
        setTimeout(() => elements.pinInput?.focus(), 100);
    }
    
    /**
     * Handle tab switching
     */
    function switchTab(tabName) {
        elements.tabBtns.forEach(btn => {
            const isActive = btn.dataset.tab === tabName;
            btn.classList.toggle('active', isActive);
            btn.setAttribute('aria-selected', isActive);
        });
        
        elements.tabPanels.forEach(panel => {
            panel.classList.toggle('active', panel.id === `${tabName}-panel`);
        });
        
        // Clear errors
        hideError(elements.pinError);
        hideError(elements.qrError);
        
        // Stop scanner if switching away from QR tab
        if (tabName !== 'qr' && isScanning) {
            stopScanner();
        }
    }
    
    /**
     * Set PIN input error
     */
    function setPinError(message) {
        elements.pinError.textContent = message;
        elements.pinError.classList.remove('hidden');
        elements.pinInput.classList.add('error');
    }
    
    /**
     * Set QR error
     */
    function setQrError(message) {
        elements.qrError.textContent = message;
        elements.qrError.classList.remove('hidden');
    }
    
    /**
     * Hide error
     */
    function hideError(element) {
        if (element) {
            element.classList.add('hidden');
        }
    }
    
    /**
     * Get PIN input value
     */
    function getPinInput() {
        return elements.pinInput.value.trim().replace(/\s/g, '');
    }
    
    /**
     * Clear PIN input
     */
    function clearPinInput() {
        elements.pinInput.value = '';
        elements.pinInput.classList.remove('error');
        hideError(elements.pinError);
    }
    
    // ========================================
    // QR Scanner
    // ========================================
    
    /**
     * Start QR code scanner
     */
    async function startScanner() {
        if (isScanning) return;
        
        try {
            elements.scannerViewport.classList.add('active');
            elements.scanBtn.textContent = 'Stop Scanner';
            
            qrScanner = new Html5Qrcode('scanner-viewport');
            
            await qrScanner.start(
                { facingMode: 'environment' },
                {
                    fps: 10,
                    qrbox: { width: 200, height: 200 }
                },
                (decodedText) => {
                    onQrScanned(decodedText);
                },
                (error) => {
                    // Ignore scan errors (no QR found)
                }
            );
            
            isScanning = true;
        } catch (error) {
            console.error('[UI] Scanner error:', error);
            setQrError('Camera access denied or not available');
            stopScanner();
        }
    }
    
    /**
     * Stop QR code scanner
     */
    async function stopScanner() {
        if (!isScanning || !qrScanner) return;
        
        try {
            await qrScanner.stop();
            qrScanner.clear();
            qrScanner = null;
        } catch (error) {
            console.error('[UI] Scanner stop error:', error);
        }
        
        elements.scannerViewport.classList.remove('active');
        elements.scanBtn.textContent = 'Start Scanner';
        isScanning = false;
    }
    
    /**
     * Toggle scanner
     */
    function toggleScanner() {
        if (isScanning) {
            stopScanner();
        } else {
            startScanner();
        }
    }
    
    /**
     * Handle scanned QR code
     */
    function onQrScanned(text) {
        // Extract PIN from URL: https://domain/?room=123456
        const match = text.match(/[?&]room=(\d{6})/);
        if (match) {
            const pin = match[1];
            elements.pinInput.value = pin;
            stopScanner();
            switchTab('pin');
            // Trigger join
            elements.pinForm.dispatchEvent(new Event('submit'));
        } else {
            setQrError('Invalid QR code format');
        }
    }
    
    // ========================================
    // Transfer Screen UI
    // ========================================
    
    /**
     * Show host transfer screen
     */
    function showHostTransferScreen() {
        showScreen('transferHost');
        updateConnectionStatus('host', 'connected');
    }
    
    /**
     * Show peer transfer screen
     */
    function showPeerTransferScreen() {
        showScreen('transferPeer');
        updateConnectionStatus('peer', 'connected');
        resetReceiveStatus();
    }
    
    /**
     * Update connection status indicator
     */
    function updateConnectionStatus(role, state) {
        const statusEl = role === 'host' ? elements.hostConnStatus : elements.peerConnStatus;
        const textEl = role === 'host' ? elements.hostConnText : elements.peerConnText;
        
        if (!statusEl || !textEl) return;
        
        statusEl.className = 'status-dot';
        switch (state) {
            case 'connected':
                statusEl.classList.add('connected');
                textEl.textContent = 'Connected';
                break;
            case 'connecting':
                statusEl.classList.add('connecting');
                textEl.textContent = 'Connecting...';
                break;
            case 'disconnected':
                statusEl.classList.add('disconnected');
                textEl.textContent = 'Disconnected';
                break;
        }
    }
    
    /**
     * Reset receive status to waiting state
     */
    function resetReceiveStatus() {
        elements.receiveStatus.className = 'receive-status';
        const icon = elements.receiveStatus.querySelector('.status-icon');
        if (icon) icon.className = 'status-icon waiting';
        elements.receiveTitle.textContent = 'Waiting for files...';
        elements.receiveDesc.textContent = 'Files sent by host will appear here';
        elements.receiveList.classList.add('hidden');
        elements.receiveItems.innerHTML = '';
    }
    
    /**
     * Update receive status to receiving
     */
    function setReceivingStatus(fileCount) {
        const icon = elements.receiveStatus.querySelector('.status-icon');
        if (icon) icon.className = 'status-icon receiving';
        elements.receiveTitle.textContent = 'Receiving files...';
        elements.receiveDesc.textContent = `${fileCount} file${fileCount > 1 ? 's' : ''} incoming`;
    }
    
    /**
     * Add file to transfer list (host)
     */
    function addTransferItem(file, index) {
        elements.transferList.classList.remove('hidden');
        
        const item = document.createElement('li');
        item.className = 'transfer-item';
        item.dataset.index = index;
        
        const icon = getFileIcon(file.type);
        
        item.innerHTML = `
            <div class="transfer-icon">${icon}</div>
            <div class="transfer-info">
                <span class="transfer-filename">${escapeHtml(file.name)}</span>
                <div class="transfer-meta">
                    <div class="transfer-progress">
                        <div class="transfer-progress-bar" style="width: 0%"></div>
                    </div>
                    <span class="transfer-speed">0 B/s</span>
                </div>
            </div>
            <button type="button" class="btn-transfer-cancel" aria-label="Cancel transfer">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                    <line x1="18" y1="6" x2="6" y2="18"/>
                    <line x1="6" y1="6" x2="18" y2="18"/>
                </svg>
            </button>
        `;
        
        elements.transferItems.appendChild(item);
        
        // Add cancel handler
        const cancelBtn = item.querySelector('.btn-transfer-cancel');
        cancelBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            emit('cancel_transfer', { index });
        });
        
        return item;
    }
    
    /**
     * Update transfer item progress
     */
    function updateTransferItem(index, progress, speed) {
        const item = elements.transferItems.querySelector(`[data-index="${index}"]`);
        if (!item) return;
        
        const progressBar = item.querySelector('.transfer-progress-bar');
        const speedEl = item.querySelector('.transfer-speed');
        
        if (progressBar) progressBar.style.width = `${progress}%`;
        if (speedEl) speedEl.textContent = formatSpeed(speed);
        
        if (progress >= 100) {
            item.classList.add('completed');
        }
    }
    
    /**
     * Remove transfer item
     */
    function removeTransferItem(index) {
        const item = elements.transferItems.querySelector(`[data-index="${index}"]`);
        if (item) {
            item.remove();
        }
        
        if (elements.transferItems.children.length === 0) {
            elements.transferList.classList.add('hidden');
        }
    }
    
    /**
     * Add file to receive list (peer)
     */
    function addReceiveItem(file) {
        elements.receiveList.classList.remove('hidden');
        
        const item = document.createElement('li');
        item.className = 'transfer-item completed';
        
        const icon = getFileIcon(file.type);
        
        item.innerHTML = `
            <div class="transfer-icon">${icon}</div>
            <div class="transfer-info">
                <span class="transfer-filename">${escapeHtml(file.name)}</span>
                <div class="transfer-meta">
                    <span class="transfer-speed">${formatFileSize(file.size)}</span>
                </div>
            </div>
        `;
        
        elements.receiveItems.appendChild(item);
    }
    
    // ========================================
    // Progress Modal
    // ========================================
    
    /**
     * Show progress modal
     */
    function showProgressModal(filename) {
        elements.progressFilename.textContent = filename;
        elements.progressBar.style.width = '0%';
        elements.progressPercent.textContent = '0%';
        elements.progressSpeed.textContent = '0 B/s';
        elements.progressModal.classList.remove('hidden');
        
        // Focus close button for accessibility
        setTimeout(() => elements.modalClose.focus(), 100);
    }
    
    /**
     * Hide progress modal
     */
    function hideProgressModal() {
        elements.progressModal.classList.add('hidden');
    }
    
    /**
     * Update progress modal
     */
    function updateProgressModal(progress, speed) {
        elements.progressBar.style.width = `${progress}%`;
        elements.progressPercent.textContent = `${Math.round(progress)}%`;
        elements.progressSpeed.textContent = formatSpeed(speed);
    }
    
    // ========================================
    // Toast Notifications
    // ========================================
    
    /**
     * Show toast notification
     */
    function showToast(type, title, message) {
        const toast = document.createElement('div');
        toast.className = `toast toast-${type}`;
        
        const icon = getToastIcon(type);
        
        toast.innerHTML = `
            <div class="toast-icon">${icon}</div>
            <div class="toast-content">
                <div class="toast-title">${escapeHtml(title)}</div>
                <div class="toast-message">${escapeHtml(message)}</div>
            </div>
            <button type="button" class="toast-close" aria-label="Dismiss">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                    <line x1="18" y1="6" x2="6" y2="18"/>
                    <line x1="6" y1="6" x2="18" y2="18"/>
                </svg>
            </button>
        `;
        
        // Add close handler
        toast.querySelector('.toast-close').addEventListener('click', () => {
            removeToast(toast);
        });
        
        // Auto-remove after 5 seconds
        setTimeout(() => removeToast(toast), 5000);
        
        elements.toastContainer.appendChild(toast);
    }
    
    /**
     * Remove toast with animation
     */
    function removeToast(toast) {
        toast.classList.add('removing');
        setTimeout(() => toast.remove(), 300);
    }
    
    // ========================================
    // Drop Zone
    // ========================================
    
    /**
     * Setup drop zone handlers
     */
    function setupDropZone(onFilesSelect) {
        const dropZone = elements.dropZone;
        const fileInput = elements.fileInput;
        
        ['dragenter', 'dragover', 'dragleave', 'drop'].forEach(eventName => {
            dropZone.addEventListener(eventName, preventDefaults, false);
            document.body.addEventListener(eventName, preventDefaults, false);
        });
        
        ['dragenter', 'dragover'].forEach(eventName => {
            dropZone.addEventListener(eventName, highlight, false);
        });
        
        ['dragleave', 'drop'].forEach(eventName => {
            dropZone.addEventListener(eventName, unhighlight, false);
        });
        
        dropZone.addEventListener('drop', handleDrop, false);
        dropZone.addEventListener('click', () => fileInput.click());
        dropZone.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                fileInput.click();
            }
        });
        
        fileInput.addEventListener('change', (e) => {
            if (e.target.files.length > 0) {
                onFilesSelect(Array.from(e.target.files));
                e.target.value = ''; // Reset to allow same file selection
            }
        });
        
        function preventDefaults(e) {
            e.preventDefault();
            e.stopPropagation();
        }
        
        function highlight() {
            dropZone.classList.add('drag-over');
        }
        
        function unhighlight() {
            dropZone.classList.remove('drag-over');
        }
        
        function handleDrop(e) {
            const files = Array.from(e.dataTransfer.files);
            if (files.length > 0) {
                onFilesSelect(files);
            }
        }
    }
    
    // ========================================
    // Utility Functions
    // ========================================
    
    function getFileIcon(mimeType) {
        if (!mimeType) return getGenericIcon();
        
        if (mimeType.startsWith('image/')) return getImageIcon();
        if (mimeType.startsWith('video/')) return getVideoIcon();
        if (mimeType.startsWith('audio/')) return getAudioIcon();
        if (mimeType === 'application/pdf') return getPdfIcon();
        if (mimeType.includes('zip') || mimeType.includes('compressed') || mimeType.includes('archive')) return getArchiveIcon();
        if (mimeType.includes('text') || mimeType === 'application/json') return getTextIcon();
        if (mimeType.includes('javascript') || mimeType.includes('typescript')) return getCodeIcon();
        
        return getGenericIcon();
    }
    
    function getGenericIcon() {
        return `<svg class="file-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>`;
    }
    
    function getImageIcon() {
        return `<svg class="file-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/></svg>`;
    }
    
    function getVideoIcon() {
        return `<svg class="file-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="23 7 16 12 23 17 23 7"/><rect x="1" y="5" width="15" height="14" rx="2" ry="2"/></svg>`;
    }
    
    function getAudioIcon() {
        return `<svg class="file-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 18V5l12-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="16" r="3"/></svg>`;
    }
    
    function getPdfIcon() {
        return `<svg class="file-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><text x="12" y="16" font-size="8" text-anchor="middle" fill="currentColor">PDF</text></svg>`;
    }
    
    function getArchiveIcon() {
        return `<svg class="file-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 8V5a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v3"/><path d="M21 16V11a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v5"/><line x1="4" y1="21" x2="20" y2="21"/></svg>`;
    }
    
    function getTextIcon() {
        return `<svg class="file-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/><polyline points="10 9 9 9 8 9"/></svg>`;
    }
    
    function getCodeIcon() {
        return `<svg class="file-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="16 18 22 12 16 6"/><polyline points="8 6 2 12 8 18"/></svg>`;
    }
    
    function getToastIcon(type) {
        switch (type) {
            case 'success':
                return `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>`;
            case 'error':
                return `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg>`;
            default:
                return `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/></svg>`;
        }
    }
    
    function formatFileSize(bytes) {
        if (bytes === 0) return '0 B';
        const k = 1024;
        const sizes = ['B', 'KB', 'MB', 'GB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
    }
    
    function formatSpeed(bytesPerSecond) {
        return formatFileSize(bytesPerSecond) + '/s';
    }
    
    function escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }
    
    // Event emitter for UI callbacks
    const uiEventHandlers = new Map();
    
    function on(event, handler) {
        if (!uiEventHandlers.has(event)) {
            uiEventHandlers.set(event, []);
        }
        uiEventHandlers.get(event).push(handler);
        return () => {
            const handlers = uiEventHandlers.get(event);
            if (handlers) {
                const index = handlers.indexOf(handler);
                if (index > -1) handlers.splice(index, 1);
            }
        };
    }
    
    function emit(event, data) {
        const handlers = uiEventHandlers.get(event);
        if (handlers) {
            handlers.forEach(handler => {
                try {
                    handler(data);
                } catch (error) {
                    console.error(`[UI] Handler error for ${event}:`, error);
                }
            });
        }
    }
    
    // Public API
    return {
        init: cacheElements,
        showScreen,
        getCurrentScreen,
        updateHostScreen,
        showPeerConnected,
        showPeerDisconnected,
        showPeerScreen,
        switchTab,
        setPinError,
        setQrError,
        hideError,
        getPinInput,
        clearPinInput,
        toggleScanner,
        startScanner,
        stopScanner,
        showHostTransferScreen,
        showPeerTransferScreen,
        updateConnectionStatus,
        resetReceiveStatus,
        setReceivingStatus,
        addTransferItem,
        updateTransferItem,
        removeTransferItem,
        addReceiveItem,
        showProgressModal,
        hideProgressModal,
        updateProgressModal,
        showToast,
        setupDropZone,
        on,
        emit,
        SCREENS,
        formatFileSize,
        formatSpeed,
        // Role selection emitters
        selectHost: () => emit('host_selected'),
        selectPeer: () => emit('peer_selected'),
        goBack: () => emit('back_to_role')
    };
})();

// Expose globally for main.js
window.UI = UI;

// Export for module systems
if (typeof module !== 'undefined' && module.exports) {
    module.exports = UI;
}