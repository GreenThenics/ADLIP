import os
import json
import logging

logger = logging.getLogger(__name__)

# Absolute path to datasets - use env var for flexibility
DATASET_DIR = os.getenv("OSINT_DATASET_DIR", "/usr/src/app/osint_datasets_files")

def load_file_as_set(filename):
    path = os.path.join(DATASET_DIR, filename)
    if not os.path.exists(path):
        logger.error(f"Missing OSINT dataset: {path}")
        raise FileNotFoundError(f"Missing OSINT dataset: {path}")
    
    with open(path, 'r', encoding='utf-8') as f:
        # Strip whitespace and lowercase, ignore empty lines
        data = {line.strip().lower() for line in f if line.strip()}
    return data

def load_json(filename):
    path = os.path.join(DATASET_DIR, filename)
    if not os.path.exists(path):
        logger.error(f"Missing OSINT dataset: {path}")
        raise FileNotFoundError(f"Missing OSINT dataset: {path}")
    
    with open(path, 'r', encoding='utf-8') as f:
        return json.load(f)

# Load datasets at startup
try:
    SENSITIVE_FILES = load_file_as_set("sensitive_files_config_backup_creds_keys.txt")
    DISPOSABLE_DOMAINS = load_file_as_set("disposable_email_blocklist_deduped.txt")
    FREE_DOMAINS = load_file_as_set("free-email-domain.txt")
    BREACHED_DOMAINS = load_file_as_set("breached_org_domains.txt")
    ADMIN_PATHS = load_file_as_set("high_signal_admin_panels.txt")
    # cloud_indicators.json -> "cloud_fingerprints"
    CLOUD_FINGERPRINTS = load_json("cloud_indicators.json")

    logger.info("OSINT datasets loaded successfully.")

except FileNotFoundError as e:
    # Rethrow to fail startup as per requirements
    raise e

OSINT_DATA = {
    "sensitive_files": SENSITIVE_FILES,
    "disposable_domains": DISPOSABLE_DOMAINS,
    "free_domains": FREE_DOMAINS,
    "breached_org_domains": BREACHED_DOMAINS,
    "admin_paths": ADMIN_PATHS,
    "cloud_fingerprints": CLOUD_FINGERPRINTS
}
