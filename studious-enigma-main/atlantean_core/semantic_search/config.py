"""Semantic search configuration from environment variables."""
import os

SEMANTIC_SEARCH_ENABLED = os.getenv('ATLANTEAN_SEMANTIC_SEARCH_ENABLED', '1') == '1'
VECTOR_BACKEND = os.getenv('ATLANTEAN_VECTOR_BACKEND', 'lancedb').lower()
VECTOR_DB_PATH = os.path.abspath(os.getenv('ATLANTEAN_VECTOR_DB_PATH', './vault_data/vector_index'))
EMBEDDING_MODEL = os.getenv('ATLANTEAN_EMBEDDING_MODEL', 'all-MiniLM-L6-v2')
EMBEDDING_DEVICE = os.getenv('ATLANTEAN_EMBEDDING_DEVICE', 'cpu')
INDEX_CHUNK_SIZE = int(os.getenv('ATLANTEAN_INDEX_CHUNK_SIZE', '800'))
INDEX_CHUNK_OVERLAP = int(os.getenv('ATLANTEAN_INDEX_CHUNK_OVERLAP', '120'))
INDEX_MAX_FILE_MB = float(os.getenv('ATLANTEAN_INDEX_MAX_FILE_MB', '50'))
INDEX_TABLE_NAME = 'documents'
STATE_FILE_NAME = 'index_state.json'

SUPPORTED_EXTENSIONS = frozenset({
    '.txt', '.md', '.py', '.js', '.jsx', '.ts', '.tsx',
    '.json', '.yaml', '.yml', '.toml', '.csv', '.html', '.css',
    '.pdf', '.docx',
})

DENIED_FILENAMES = frozenset({
    '.env', '.env.local', '.env.production', '.env.development',
    '.npmrc', '.pypirc', 'id_rsa', 'id_ed25519', 'id_ecdsa', 'id_dsa',
    'credentials', 'secrets.json', 'service-account.json',
})

DENIED_DIR_SEGMENTS = frozenset({
    'node_modules', '.git', '__pycache__', '.venv', 'venv', 'env',
    '.tox', 'dist', 'build', 'site-packages', '.mypy_cache',
    '.pytest_cache', '.ruff_cache', '.eggs',
    'models', 'weights', 'checkpoints',  # ML model weight dirs
})
