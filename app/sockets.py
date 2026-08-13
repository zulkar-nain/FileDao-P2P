from flask import request, current_app
from flask_socketio import emit, join_room, leave_room

from app.utils import rooms, get_room, delete_room, cleanup_expired_rooms


def register_socket_events(socketio):
    """Register all SocketIO event handlers."""
    
    @socketio.on('connect')
    def handle_connect():
        """Handle client connection."""
        print(f"Client connected: {request.sid}")
        emit('connected', {'sid': request.sid})
    
    @socketio.on('disconnect')
    def handle_disconnect():
        """Handle client disconnection."""
        print(f"Client disconnected: {request.sid}")
        handle_leave_room()
    
    @socketio.on('create_room')
    def handle_create_room():
        """Create a new room for the host."""
        cleanup_expired_rooms(current_app.config)
        
        from app.utils import create_room, generate_qr_code, get_share_url
        
        room = create_room(request.sid, current_app.config)
        join_room(room['pin'])
        
        share_url = get_share_url(room['pin'], request.host)
        qr_code = generate_qr_code(share_url)
        
        emit('room_created', {
            'pin': room['pin'],
            'share_url': share_url,
            'qr_code': qr_code,
            'role': 'host'
        })
    
    @socketio.on('join_room')
    def handle_join_room(data):
        """Join an existing room as peer."""
        pin = data.get('pin', '').strip()
        
        if not pin or len(pin) != 6 or not pin.isdigit():
            emit('error', {'message': 'Invalid PIN. Must be 6 digits.'})
            return
        
        room = get_room(pin)
        
        if not room:
            emit('error', {'message': 'Room not found or expired.'})
            return
        
        if room['peer_sid'] is not None:
            emit('error', {'message': 'Room is full.'})
            return
        
        # Assign peer and join room
        room['peer_sid'] = request.sid
        room['state'] = 'connected'
        join_room(pin)
        
        # Notify host that peer joined
        emit('peer_joined', {'peer_sid': request.sid}, room=room['host_sid'])
        
        # Notify peer they joined successfully
        emit('room_joined', {
            'pin': pin,
            'host_sid': room['host_sid'],
            'role': 'peer'
        })
    
    @socketio.on('leave_room')
    def handle_leave_room():
        """Leave current room."""
        sid = request.sid
        
        for pin, room in list(rooms.items()):
            if room['host_sid'] == sid or room['peer_sid'] == sid:
                leave_room(pin)
                
                # Notify the other peer
                other_sid = room['peer_sid'] if room['host_sid'] == sid else room['host_sid']
                if other_sid:
                    emit('peer_left', {}, room=other_sid)
                
                delete_room(pin)
                break
    
    # WebRTC Signaling Events
    @socketio.on('offer')
    def handle_offer(data):
        """Relay SDP offer to peer."""
        pin = data.get('pin')
        room = get_room(pin)
        
        if not room:
            return
        
        target_sid = room['peer_sid'] if room['host_sid'] == request.sid else room['host_sid']
        if target_sid:
            emit('offer', {
                'sdp': data['sdp'],
                'from_sid': request.sid
            }, room=target_sid)
    
    @socketio.on('answer')
    def handle_answer(data):
        """Relay SDP answer to peer."""
        pin = data.get('pin')
        room = get_room(pin)
        
        if not room:
            return
        
        target_sid = room['peer_sid'] if room['host_sid'] == request.sid else room['host_sid']
        if target_sid:
            emit('answer', {
                'sdp': data['sdp'],
                'from_sid': request.sid
            }, room=target_sid)
    
    @socketio.on('ice_candidate')
    def handle_ice_candidate(data):
        """Relay ICE candidate to peer."""
        pin = data.get('pin')
        room = get_room(pin)
        
        if not room:
            return
        
        target_sid = room['peer_sid'] if room['host_sid'] == request.sid else room['host_sid']
        if target_sid:
            emit('ice_candidate', {
                'candidate': data['candidate'],
                'from_sid': request.sid
            }, room=target_sid)
    
    @socketio.on('file_metadata')
    def handle_file_metadata(data):
        """Relay file metadata to peer."""
        pin = data.get('pin')
        room = get_room(pin)
        
        if not room:
            return
        
        target_sid = room['peer_sid'] if room['host_sid'] == request.sid else room['host_sid']
        if target_sid:
            emit('file_metadata', data, room=target_sid)
    
    @socketio.on('transfer_complete')
    def handle_transfer_complete(data):
        """Notify peer that transfer is complete."""
        pin = data.get('pin')
        room = get_room(pin)
        
        if not room:
            return
        
        target_sid = room['peer_sid'] if room['host_sid'] == request.sid else room['host_sid']
        if target_sid:
            emit('transfer_complete', data, room=target_sid)