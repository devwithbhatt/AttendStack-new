import sys
from unittest import mock

from django.test import TestCase, override_settings

from organizations.models import Organization
from organizations.services import mask_code, sync_invite_code_to_simplyjob


class InviteCodeNeverLoggedTests(TestCase):
    """An invite code lets anyone self-register as an active employee, so it
    must never appear in full in the logs."""

    def test_mask_code_hides_most_of_the_code(self):
        masked = mask_code("ORG-ABCD1234")
        self.assertNotIn("ABCD1234", masked)
        self.assertTrue(masked.startswith("ORG-") and masked.endswith("34"))
        self.assertEqual(mask_code(""), "***")
        self.assertEqual(mask_code(None), "***")

    @override_settings(SIMPLYJOB_DATABASE_URL="postgresql://unused", SIMPLYJOB_WEBHOOK_URL="")
    def test_simplyjob_sync_logs_masked_code_only(self):
        org = Organization.objects.create(name="Logging Co", external_source="SIMPLYJOB", external_company_id="42")
        code = org.invite_code

        fake_cursor = mock.MagicMock(rowcount=1)
        fake_conn = mock.MagicMock()
        fake_conn.cursor.return_value.__enter__.return_value = fake_cursor
        fake_psycopg2 = mock.MagicMock()
        fake_psycopg2.connect.return_value = fake_conn

        with mock.patch.dict(sys.modules, {"psycopg2": fake_psycopg2}):
            with self.assertLogs("organizations.services", level="DEBUG") as logs:
                result = sync_invite_code_to_simplyjob(org)

        self.assertTrue(result["db_updated"])
        output = "\n".join(logs.output)
        self.assertNotIn(code, output)
        self.assertIn(mask_code(code), output)
