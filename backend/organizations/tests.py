from django.contrib.auth import get_user_model
from django.test import TestCase, override_settings
from django.urls import reverse
from rest_framework import status
from rest_framework.test import APITestCase

from .models import Organization, Plan, SalesLead
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


class SeedDefaultPlansTests(APITestCase):
    def test_enterprise_plan_is_renamed_and_requires_contact_sales(self):
        admin = User.objects.create_superuser(email='plan-admin@example.com', password='StrongPass123!')
        self.client.force_authenticate(admin)

        response = self.client.post(reverse('plan-seed-defaults'))

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        enterprise = Plan.objects.get(slug='enterprise')
        self.assertEqual(enterprise.name, 'Enterprise')
        self.assertTrue(enterprise.requires_contact_sales)
        self.assertTrue(enterprise.allows_chat)
        self.assertEqual(enterprise.max_employees, -1)
        # Non-enterprise tiers stay self-serve.
        starter = Plan.objects.get(slug='starter')
        self.assertFalse(starter.requires_contact_sales)


class SalesLeadCreateTests(APITestCase):
    def setUp(self):
        self.owner = User.objects.create_hr(email='lead-owner@example.com', first_name='Lead', last_name='Owner')
        self.organization = Organization.objects.create(name='Lead Test Co', owner=self.owner)
        self.url = reverse('sales-lead-create')
        self.payload = {
            'plan_name': 'Enterprise',
            'full_name': 'Jordan Lee',
            'company_email': 'jordan@leadtestco.example',
            'company_name': 'Lead Test Co',
            'website': 'https://leadtestco.example',
            'job_title': 'CTO',
            'phone': '9876543210',
            'message': 'I want to enquire about the Enterprise plan.',
        }

    def test_requires_authentication(self):
        response = self.client.post(self.url, self.payload, format='json')
        self.assertEqual(response.status_code, status.HTTP_401_UNAUTHORIZED)

    def test_authenticated_submission_creates_lead_linked_to_organization(self):
        self.client.force_authenticate(self.owner)

        response = self.client.post(self.url, self.payload, format='json')

        self.assertEqual(response.status_code, status.HTTP_201_CREATED, response.data)
        lead = SalesLead.objects.get(company_email='jordan@leadtestco.example')
        self.assertEqual(lead.organization_id, self.organization.id)
        self.assertEqual(lead.plan_name, 'Enterprise')
        self.assertEqual(lead.full_name, 'Jordan Lee')

    @override_settings(EMAIL_BACKEND='django.core.mail.backends.locmem.EmailBackend')
    def test_submission_emails_the_sales_team_by_default(self):
        from django.core import mail

        self.client.force_authenticate(self.owner)

        response = self.client.post(self.url, self.payload, format='json')

        self.assertEqual(response.status_code, status.HTTP_201_CREATED, response.data)
        self.assertEqual(len(mail.outbox), 1)
        sent = mail.outbox[0]
        self.assertEqual(sent.to, ['onboarding@bhattsquare.com'])
        self.assertIn('Lead Test Co', sent.subject)
        self.assertIn('Jordan Lee', sent.body)
        self.assertIn('jordan@leadtestco.example', sent.body)
