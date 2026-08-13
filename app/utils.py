import random
import string
import time
import qrcode
from io import BytesIO
import base64


# In-memory room storage (use Redis in production)
rooms = {}


def generate_pin(length=6):
    """Generate a random numeric PIN."""
    return ''.join(random.choices(string.digits, k=length))


def create_room(host_sid, config):
    """Create a new room with a unique PIN."""
    pin_length = config.get('ROOM_PIN_LENGTH', 6)
    pin = generate_pin(pin_length)
    
    # Ensure unique PIN
    while pin in rooms:
        pin = generate_pin(pin_length)
    
    room = {
        'pin': pin,
        'host_sid': host_sid,
        'peer_sid': None,
        'created_at': time.time(),
        'state': 'waiting'  # waiting, connected, closed
    }
    
    rooms[pin] = room
    return room


def get_room(pin):
    """Get room by PIN."""
    return rooms.get(pin)


def delete_room(pin):
    """Delete a room."""
    if pin in rooms:
        del rooms[pin]


def cleanup_expired_rooms(config):
    """Remove expired rooms."""
    current_time = time.time()
    ttl = config.get('ROOM_TTL_SECONDS', 3600)
    expired = [
        pin for pin, room in rooms.items()
        if current_time - room['created_at'] > ttl
    ]
    for pin in expired:
        delete_room(pin)


def generate_qr_code(data):
    """Generate QR code as base64 encoded PNG."""
    qr = qrcode.QRCode(
        version=1,
        error_correction=qrcode.constants.ERROR_CORRECT_L,
        box_size=10,
        border=4,
    )
    qr.add_data(data)
    qr.make(fit=True)
    
    img = qr.make_image(fill_color="black", back_color="white")
    buffered = BytesIO()
    img.save(buffered, format="PNG")
    img_str = base64.b64encode(buffered.getvalue()).decode()
    return f"data:image/png;base64,{img_str}"


def get_share_url(pin, domain=None):
    """Generate share URL for a room."""
    if domain:
        # Use HTTP for local IPs (192.168.x.x, 10.x.x.x, 172.16-31.x.x, localhost)
        # Use HTTPS for production domains
        is_local = (
            domain.startswith('localhost') or
            domain.startswith('127.0.0.1') or
            domain.startswith('192.168.') or
            domain.startswith('10.') or
            domain.startswith('172.16.') or
            domain.startswith('172.17.') or
            domain.startswith('172.18.') or
            domain.startswith('172.19.') or
            domain.startswith('172.2') or
            domain.startswith('172.30.') or
            domain.startswith('172.31.')
        )
        protocol = 'http' if is_local else 'https'
        return f"{protocol}://{domain}/?room={pin}"
    return f"/?room={pin}"