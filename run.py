#!/usr/bin/env python
"""Server startup script for FileDao P2P File Sharing."""

import os
import sys

# Add project root to path
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from app import create_app, socketio
from config import config


def get_config_name():
    """Determine configuration from environment."""
    return os.environ.get('FLASK_ENV', 'default')


# Create app at module level for gunicorn
config_name = get_config_name()
app = create_app(config_name)

# Expose socketio for gunicorn
# gunicorn will use: gunicorn --worker-class eventlet run:app


def main():
    """Main entry point for direct python run.py execution."""
    app_config = config[config_name]
    
    host = getattr(app_config, 'HOST', '0.0.0.0')
    port = getattr(app_config, 'PORT', 5000)
    debug = getattr(app_config, 'DEBUG', False)
    
    print(f"Starting FileDao P2P File Share on http://{host}:{port}")
    print(f"Environment: {config_name}")
    print(f"Debug mode: {debug}")
    print("Note: For WebRTC on LAN, use Chrome with --allow-insecure-localhost flag")
    
    # Run with SocketIO (for direct python run.py)
    socketio.run(
        app,
        host=host,
        port=port,
        debug=debug,
        use_reloader=debug,
        log_output=True
    )


if __name__ == '__main__':
    main()