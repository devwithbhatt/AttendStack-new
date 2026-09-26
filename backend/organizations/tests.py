from django.contrib.auth import get_user_model
from django.test import TestCase, override_settings
from django.urls import reverse
from rest_framework import status
from rest_framework.test import APITestCase

from .models import Organization
from .name_matching import find_similar_organization, normalize_company_name

User = get_user_model()


class NormalizeCompanyNameTests(TestCase):
    def test_strips_case_punctuation_and_legal_suffixes(self):
        cases = [
            ("Bhatt Square Private Limited", "bhatt square"),
            ("BHATT SQUARE PVT LTD", "bhatt square"),
            ("bhatt square", "bhatt square"),
            ("Bhatt Square Pvt. Ltd.", "bhatt square"),
            ("Acme Corp.", "acme"),
            ("", ""),
        ]
        for raw, expected in cases:
            with self.subTest(raw=raw):
                self.assertEqual(normalize_company_name(raw), expected)


class FindSimilarOrganizationTests(TestCase):
    def setUp(self):
        self.owner = User.objects.create_hr(email='name-match-owner@example.com', first_name='Name', last_name='Match')
        self.org = Organization.objects.create(name='Bhatt Square Private Limited', owner=self.owner)

    def test_matches_case_and_suffix_variants(self):
        for candidate in ('bhatt square', 'BHATT SQUARE PVT LTD', 'Bhatt Square Pvt. Ltd.'):
            with self.subTest(candidate=candidate):
                match = find_similar_organization(candidate)
                self.assertEqual(match, self.org)

    def test_no_match_for_unrelated_name(self):
        self.assertIsNone(find_similar_organization('Totally Different Company'))

    def test_ignores_inactive_organizations(self):
        self.org.is_active = False
        self.org.save(update_fields=['is_active'])
        self.assertIsNone(find_similar_organization('Bhatt Square'))


@override_settings(SIMPLYJOB_ONBOARDING_SECRET='test-secret')
class OrganizationDirectorySyncTests(APITestCase):
    def setUp(self):
        owner = User.objects.create_hr(email='directory-owner@example.com', first_name='Dir', last_name='Owner')
        self.org = Organization.objects.create(name='Directory Test Co', owner=owner, plan_name='Starter Plan')
        self.url = reverse('organization-directory-sync')

    def test_rejects_missing_or_wrong_secret(self):
        response = self.client.get(self.url)
        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)

        response = self.client.get(self.url, HTTP_X_SYNC_SECRET='wrong-secret')
        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)

    def test_returns_organizations_with_correct_secret(self):
        response = self.client.get(self.url, HTTP_X_SYNC_SECRET='test-secret')

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        names = [org['name'] for org in response.data]
        self.assertIn('Directory Test Co', names)
        entry = next(org for org in response.data if org['name'] == 'Directory Test Co')
        self.assertEqual(entry['owner_email'], 'directory-owner@example.com')
        self.assertEqual(entry['plan_name'], 'Starter Plan')

    def test_excludes_inactive_organizations(self):
        self.org.is_active = False
        self.org.save(update_fields=['is_active'])

        response = self.client.get(self.url, HTTP_X_SYNC_SECRET='test-secret')

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        names = [org['name'] for org in response.data]
        self.assertNotIn('Directory Test Co', names)
