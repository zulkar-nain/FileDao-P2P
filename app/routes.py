from flask import Blueprint, render_template, request, jsonify, current_app

bp = Blueprint('main', __name__)


@bp.route('/')
def index():
    """Serve the main page."""
    room_pin = request.args.get('room')
    return render_template('index.html', room_pin=room_pin)


@bp.route('/health')
def health():
    """Health check endpoint."""
    return jsonify({'status': 'ok'}), 200


@bp.route('/api/room/create', methods=['POST'])
def create_room():
    """Create a new room and return PIN and QR code."""
    from app.utils import create_room, generate_qr_code, get_share_url
    
    host_sid = request.sid if hasattr(request, 'sid') else 'http-host'
    room = create_room(host_sid, current_app.config)
    
    # Generate share URL and QR code
    share_url = get_share_url(room['pin'], request.host)
    qr_code = generate_qr_code(share_url)
    
    return jsonify({
        'pin': room['pin'],
        'share_url': share_url,
        'qr_code': qr_code
    }), 201


@bp.route('/api/room/<pin>', methods=['GET'])
def get_room(pin):
    """Get room info."""
    from app.utils import get_room
    
    room = get_room(pin)
    if not room:
        return jsonify({'error': 'Room not found'}), 404
    
    return jsonify({
        'pin': room['pin'],
        'state': room['state'],
        'has_peer': room['peer_sid'] is not None
    }), 200