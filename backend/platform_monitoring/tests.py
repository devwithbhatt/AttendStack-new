"""Super Admin Live Monitoring: only the Super Admin manages accounts and
watches; the app signs in only with an exact User ID + password + passkey."""

from datetime import timedelta

from asgiref.sync import async_to_sync
from channels.testing import WebsocketCommunicator
from django.contrib.auth import get_user_model
from django.test import override_settings
from django.utils import timezone
from rest_framework import status
from rest_framework.test import APITestCase
from rest_framework_simplejwt.tokens import AccessToken

from accounts.models import UserRole

from .models import (
    MAX_FAILED_SIGNINS,
    PlatformMonitorAccount,
    PlatformMonitoredDevice,
    PlatformMonitoringSession,
)

User = get_user_model()
BASE = "/api/v1/platform-monitoring"
IN_MEMORY = {"default": {"BACKEND": "channels.layers.InMemoryChannelLayer"}}


@override_settings(CHANNEL_LAYERS=IN_MEMORY)
class PlatformMonitoringTests(APITestCase):
    def setUp(self):
        self.super_admin = User.objects.create_user(
            email="root@platform.test", password="StrongPass123!", role=UserRole.SUPER_ADMIN
        )
        self.company_admin = User.objects.create_user(
            email="hr@company.test", password="StrongPass123!", role=UserRole.HR
        )

    # ------------------------------------------------------------ helpers
    def _create(self, name="Ravi Kumar"):
        self.client.force_authenticate(self.super_admin)
        res = self.client.post(f"{BASE}/accounts/", {"name": name}, format="json")
        self.assertEqual(res.status_code, status.HTTP_201_CREATED, res.data)
        self.client.force_authenticate(None)
        return res.data["account"], res.data["credentials"]

    def _sign_in(self, creds, fingerprint="win-test-1", **overrides):
        body = {
            "user_id": creds["user_id"],
            "password": creds["password"],
            "passkey": creds["passkey"],
            "device_fingerprint": fingerprint,
            "device_name": "OFFICE-PC",
            "consent_acknowledged": True,
            **overrides,
        }
        return self.client.post(f"{BASE}/agent/sign-in/", body, format="json")

    # ------------------------------------------------------- credentials
    def test_create_issues_5_digit_id_password_and_passkey_shown_once(self):
        account, creds = self._create()
        self.assertRegex(creds["user_id"], r"^[1-9]\d{4}$")
        self.assertEqual(len(creds["password"]), 10)
        self.assertRegex(creds["passkey"], r"^[A-Z2-9]{4}-[A-Z2-9]{4}$")

        stored = PlatformMonitorAccount.objects.get(id=account["id"])
        self.assertNotIn(creds["password"], stored.password_hash)
        self.assertNotIn(creds["passkey"], stored.passkey_hash)

        # The list never contains the password or passkey again.
        self.client.force_authenticate(self.super_admin)
        listing = self.client.get(f"{BASE}/accounts/").content.decode()
        self.assertNotIn(creds["password"], listing)
        self.assertNotIn(creds["passkey"], listing)

    def test_only_super_admin_can_manage(self):
        account, _ = self._create()
        self.client.force_authenticate(self.company_admin)
        for method, url in [
            ("get", f"{BASE}/accounts/"),
            ("post", f"{BASE}/accounts/"),
            ("post", f"{BASE}/accounts/{account['id']}/reset-credentials/"),
            ("delete", f"{BASE}/accounts/{account['id']}/"),
            ("get", f"{BASE}/devices/"),
            ("get", f"{BASE}/sessions/"),
            ("get", f"{BASE}/agent/download/"),
        ]:
            res = getattr(self.client, method)(url, {"name": "x"} if method == "post" else None, format="json")
            self.assertEqual(res.status_code, status.HTTP_403_FORBIDDEN, url)
        self.client.force_authenticate(None)
        self.assertEqual(self.client.get(f"{BASE}/accounts/").status_code, status.HTTP_401_UNAUTHORIZED)

    # ------------------------------------------------------------ sign-in
    def test_exact_credentials_sign_in_and_return_device_token(self):
        _, creds = self._create()
        res = self._sign_in(creds)
        self.assertEqual(res.status_code, status.HTTP_201_CREATED, res.data)
        self.assertTrue(res.data["device_token"].startswith("astk_pmon_"))
        device = PlatformMonitoredDevice.objects.get(id=res.data["device_id"])
        self.assertTrue(device.is_active)
        self.assertNotEqual(device.token_hash, res.data["device_token"])

        hb = self.client.post(
            f"{BASE}/agent/heartbeat/", {"active": True}, format="json",
            HTTP_AUTHORIZATION=f"Device {res.data['device_token']}",
        )
        self.assertEqual(hb.status_code, status.HTTP_200_OK)

    def test_any_mismatch_is_refused_with_one_generic_message(self):
        _, creds = self._create()
        other_id = "99999" if creds["user_id"] != "99999" else "10000"
        cases = [
            {"user_id": other_id},
            {"password": creds["password"] + "x"},
            {"password": creds["password"].swapcase()},
            {"passkey": creds["passkey"].lower()},
            {"passkey": creds["passkey"].replace("-", "")},
            {"passkey": ""},
        ]
        messages = set()
        for case in cases:
            res = self._sign_in(creds, **case)
            self.assertEqual(res.status_code, status.HTTP_400_BAD_REQUEST, case)
            messages.add(str(res.data.get("detail", res.data)))
        # Blank passkey fails field validation; all real mismatches share one message.
        self.assertIn("User ID, password or passkey is incorrect.", messages)
        self.assertFalse(PlatformMonitoredDevice.objects.exists())

    def test_consent_is_required(self):
        _, creds = self._create()
        res = self._sign_in(creds, consent_acknowledged=False)
        self.assertEqual(res.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertFalse(PlatformMonitoredDevice.objects.exists())

    def test_account_locks_after_repeated_wrong_attempts(self):
        _, creds = self._create()
        for _ in range(MAX_FAILED_SIGNINS):
            self._sign_in(creds, password="wrong-password")
        res = self._sign_in(creds)  # even the right credentials wait now
        self.assertEqual(res.status_code, status.HTTP_429_TOO_MANY_REQUESTS)

        PlatformMonitorAccount.objects.update(locked_until=timezone.now() - timedelta(seconds=1))
        self.assertEqual(self._sign_in(creds).status_code, status.HTTP_201_CREATED)

    # ------------------------------------------------- account management
    def test_reset_replaces_credentials_immediately(self):
        account, old = self._create()
        self.client.force_authenticate(self.super_admin)
        res = self.client.post(f"{BASE}/accounts/{account['id']}/reset-credentials/")
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        new = res.data["credentials"]
        self.assertEqual(new["user_id"], old["user_id"])
        self.assertNotEqual(new["password"], old["password"])
        self.client.force_authenticate(None)

        self.assertEqual(self._sign_in(old).status_code, status.HTTP_400_BAD_REQUEST)
        self.assertEqual(self._sign_in(new).status_code, status.HTTP_201_CREATED)

    def test_disable_blocks_sign_in_and_existing_device(self):
        account, creds = self._create()
        token = self._sign_in(creds).data["device_token"]

        self.client.force_authenticate(self.super_admin)
        res = self.client.patch(f"{BASE}/accounts/{account['id']}/", {"is_active": False}, format="json")
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        self.client.force_authenticate(None)

        self.assertEqual(self._sign_in(creds, fingerprint="win-2").status_code, status.HTTP_403_FORBIDDEN)
        hb = self.client.post(f"{BASE}/agent/heartbeat/", {}, format="json", HTTP_AUTHORIZATION=f"Device {token}")
        self.assertEqual(hb.status_code, status.HTTP_401_UNAUTHORIZED)

        # Re-enabling lets the same computer back in.
        self.client.force_authenticate(self.super_admin)
        self.client.patch(f"{BASE}/accounts/{account['id']}/", {"is_active": True}, format="json")
        self.client.force_authenticate(None)
        hb = self.client.post(f"{BASE}/agent/heartbeat/", {}, format="json", HTTP_AUTHORIZATION=f"Device {token}")
        self.assertEqual(hb.status_code, status.HTTP_200_OK)

    def test_delete_removes_account_and_devices_but_keeps_log(self):
        account, creds = self._create()
        device_id = self._sign_in(creds).data["device_id"]
        PlatformMonitoringSession.objects.create(
            device_id=device_id, viewer=self.super_admin, viewer_email=self.super_admin.email,
            account_user_id=creds["user_id"], account_name="Ravi Kumar",
        )
        self.client.force_authenticate(self.super_admin)
        self.assertEqual(self.client.delete(f"{BASE}/accounts/{account['id']}/").status_code, status.HTTP_204_NO_CONTENT)
        self.assertFalse(PlatformMonitorAccount.objects.exists())
        self.assertFalse(PlatformMonitoredDevice.objects.exists())
        log = PlatformMonitoringSession.objects.get()
        self.assertIsNone(log.device_id)
        self.assertEqual(log.account_user_id, creds["user_id"])

    def test_revoke_signs_out_one_computer(self):
        _, creds = self._create()
        token = self._sign_in(creds).data["device_token"]
        device = PlatformMonitoredDevice.objects.get()
        self.client.force_authenticate(self.super_admin)
        self.assertEqual(self.client.post(f"{BASE}/devices/{device.id}/revoke/").status_code, status.HTTP_200_OK)
        self.client.force_authenticate(None)
        hb = self.client.post(f"{BASE}/agent/heartbeat/", {}, format="json", HTTP_AUTHORIZATION=f"Device {token}")
        self.assertEqual(hb.status_code, status.HTTP_401_UNAUTHORIZED)

    # ------------------------------------------------------- websockets
    def test_only_super_admin_can_open_the_viewer_socket(self):
        from zuperhr_backend.asgi import application

        _, creds = self._create()
        device_id = self._sign_in(creds).data["device_id"]

        async def connect(user):
            token = str(AccessToken.for_user(user))
            comm = WebsocketCommunicator(application, f"/ws/platform-monitor/view/{device_id}/?token={token}")
            connected, code = await comm.connect()
            if connected:
                ready = await comm.receive_json_from()
                await comm.disconnect()
                return True, ready
            return False, code

        ok, ready = async_to_sync(connect)(self.super_admin)
        self.assertTrue(ok)
        self.assertEqual(ready["type"], "ready")
        self.assertEqual(PlatformMonitoringSession.objects.count(), 1)

        ok, code = async_to_sync(connect)(self.company_admin)
        self.assertFalse(ok)

    def test_agent_socket_needs_a_valid_platform_token(self):
        from zuperhr_backend.asgi import application

        _, creds = self._create()
        token = self._sign_in(creds).data["device_token"]

        async def connect(raw):
            comm = WebsocketCommunicator(application, f"/ws/platform-monitor/agent/?device_token={raw}")
            connected, _ = await comm.connect()
            if connected:
                await comm.disconnect()
            return connected

        self.assertTrue(async_to_sync(connect)(token))
        self.assertFalse(async_to_sync(connect)("astk_pmon_not-a-real-token"))
        # A company-monitoring token format never works here.
        self.assertFalse(async_to_sync(connect)("astk_dev_whatever"))
