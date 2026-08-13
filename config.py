import os


class Config:
    """Base configuration class."""
    SECRET_KEY = os.environ.get('SECRET_KEY', 'dev-secret-key-change-in-production')
    SOCKETIO_ASYNC_MODE = 'eventlet'
    
    # Room settings
    ROOM_PIN_LENGTH = 6
    ROOM_TTL_SECONDS = 3600  # 1 hour
    
    # WebRTC settings
    STUN_SERVERS = [
        'stun:stun.l.google.com:19302',
        'stun:stun1.l.google.com:19302'
    ]
    
    # File transfer settings
    CHUNK_SIZE = 64 * 1024  # 64KB
    MAX_BUFFERED_AMOUNT = 16 * 1024 * 1024  # 16MB


class DevelopmentConfig(Config):
    """Development configuration."""
    DEBUG = True
    HOST = '0.0.0.0'
    PORT = 5000


class ProductionConfig(Config):
    """Production configuration."""
    DEBUG = False
    HOST = '0.0.0.0'
    PORT = int(os.environ.get('PORT', 8000))


class TestingConfig(Config):
    """Testing configuration."""
    TESTING = True
    DEBUG = True


config = {
    'development': DevelopmentConfig,
    'production': ProductionConfig,
    'testing': TestingConfig,
    'default': DevelopmentConfig
}