from flask import Flask
from flask_socketio import SocketIO

from config import config

socketio = SocketIO(
    async_mode='eventlet',
    cors_allowed_origins='*',
    logger=True,
    engineio_logger=True
)


def create_app(config_name=None):
    """Flask Application Factory."""
    if config_name is None:
        config_name = os.environ.get('FLASK_ENV', 'default')
    
    # Set template and static folders explicitly
    template_dir = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'templates')
    static_dir = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'static')
    
    app = Flask(__name__, template_folder=template_dir, static_folder=static_dir)
    app.config.from_object(config[config_name])
    
    # Add version for cache busting
    app.config['VERSION'] = '1.0.0'
    
    # Initialize extensions
    socketio.init_app(app)
    
    # Register blueprints/routes
    from app.routes import bp as routes_bp
    app.register_blueprint(routes_bp)
    
    # Register SocketIO events
    from app.sockets import register_socket_events
    register_socket_events(socketio)
    
    return app


import os