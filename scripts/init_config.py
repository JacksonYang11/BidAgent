"""Create private local configuration without displaying credentials."""
from pathlib import Path
import shutil

root=Path(__file__).resolve().parents[1]
destination=root/'.env'
if not destination.exists():
    shutil.copyfile(root/'.env.example',destination)
destination.chmod(0o600)
print('Local .env is ready with owner-only permissions. Existing values were preserved.')
