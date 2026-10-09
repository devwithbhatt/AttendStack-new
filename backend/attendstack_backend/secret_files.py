"""Read a secret (e.g. the SMTP password) from a one-line file kept out of
.env and git. Fails at startup with a clear message — never one that
includes the file's contents — instead of silently running without it."""
from pathlib import Path

from django.core.exceptions import ImproperlyConfigured


def read_secret_file(path: str, setting_name: str) -> str:
    try:
        value = Path(path).read_text(encoding="utf-8").strip()
    except OSError as exc:
        raise ImproperlyConfigured(
            f"{setting_name} points to {path!r}, which can't be read ({exc.__class__.__name__})."
        ) from None
    if not value:
        raise ImproperlyConfigured(f"{setting_name} points to {path!r}, which is empty.")
    return value
