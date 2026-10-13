import os
import subprocess
import sys
import tempfile
from pathlib import Path

from django.core.exceptions import ImproperlyConfigured
from django.test import SimpleTestCase

from zuperhr_backend.secret_files import read_secret_file

BACKEND_DIR = Path(__file__).resolve().parent.parent


class SecretFileTests(SimpleTestCase):
    """EMAIL_HOST_PASSWORD_FILE must fail loudly at startup — and never
    reveal the secret — rather than run with a blank SMTP password."""

    def test_reads_and_strips_the_secret(self):
        with tempfile.TemporaryDirectory() as d:
            path = Path(d, "pw.txt")
            path.write_text("  s3cret-value\n", encoding="utf-8")
            self.assertEqual(read_secret_file(str(path), "EMAIL_HOST_PASSWORD_FILE"), "s3cret-value")

    def test_missing_file_is_a_clear_startup_error(self):
        with self.assertRaises(ImproperlyConfigured) as ctx:
            read_secret_file("/definitely/not/here.txt", "EMAIL_HOST_PASSWORD_FILE")
        self.assertIn("EMAIL_HOST_PASSWORD_FILE", str(ctx.exception))

    def test_empty_file_is_a_clear_startup_error(self):
        with tempfile.TemporaryDirectory() as d:
            path = Path(d, "pw.txt")
            path.write_text("   \n", encoding="utf-8")
            with self.assertRaises(ImproperlyConfigured) as ctx:
                read_secret_file(str(path), "EMAIL_HOST_PASSWORD_FILE")
            self.assertIn("empty", str(ctx.exception))

    def test_error_never_contains_the_secret(self):
        with tempfile.TemporaryDirectory() as d:
            # A directory instead of a file: unreadable as text.
            with self.assertRaises(ImproperlyConfigured) as ctx:
                read_secret_file(d, "EMAIL_HOST_PASSWORD_FILE")
            self.assertNotIn("s3cret", str(ctx.exception))


class ProductionEmailBackendGuardTests(SimpleTestCase):
    """With DEBUG off, a development email backend (which prints codes to the
    logs or drops mail) must stop the server from starting."""

    def _start_settings(self, **env):
        child_env = {**os.environ, **env}
        return subprocess.run(
            [sys.executable, "-c", "import django, os; os.environ.setdefault('DJANGO_SETTINGS_MODULE','zuperhr_backend.settings'); django.setup()"],
            cwd=BACKEND_DIR, env=child_env, capture_output=True, text=True, timeout=120,
        )

    def test_console_backend_refused_when_debug_off(self):
        result = self._start_settings(DEBUG="False", EMAIL_BACKEND="django.core.mail.backends.console.EmailBackend")
        self.assertNotEqual(result.returncode, 0)
        self.assertIn("development backend", result.stderr)

    def test_smtp_backend_allowed_when_debug_off(self):
        result = self._start_settings(DEBUG="False", EMAIL_BACKEND="django.core.mail.backends.smtp.EmailBackend")
        self.assertEqual(result.returncode, 0, result.stderr[-500:])
