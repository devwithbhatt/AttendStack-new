"""
Fuzzy company-name matching used during signup to warn a new registrant when
their company appears to already be registered under a slightly different
spelling (case, punctuation, or legal-entity suffix like "Private Limited" /
"Pvt Ltd") — see OrganizationNameCheckView in accounts/views.py.
"""

import difflib
import re

SIMILARITY_THRESHOLD = 0.87

# Longest phrases first so multi-word suffixes are stripped before their
# shorter substrings (e.g. "private limited" before "limited").
_LEGAL_SUFFIXES = sorted(
    [
        "private limited",
        "public limited",
        "limited liability partnership",
        "pvt ltd",
        "pvt. ltd.",
        "pvt. ltd",
        "pvt ltd.",
        "limited",
        "incorporated",
        "corporation",
        "llp",
        "llc",
        "ltd",
        "inc",
        "corp",
        "plc",
        "pvt",
        "co",
    ],
    key=len,
    reverse=True,
)


def normalize_company_name(name: str) -> str:
    """Lowercases, strips punctuation, and removes trailing legal-entity
    suffixes so "Bhatt Square Pvt. Ltd." and "BHATT SQUARE PRIVATE LIMITED"
    both normalize to "bhatt square"."""
    value = (name or "").lower()
    value = re.sub(r"[.,&/()]", " ", value)
    value = re.sub(r"\s+", " ", value).strip()

    changed = True
    while changed:
        changed = False
        for suffix in _LEGAL_SUFFIXES:
            pattern = r"\b" + re.escape(suffix) + r"\b$"
            stripped = re.sub(pattern, "", value).strip()
            if stripped != value:
                value = stripped
                changed = True

    return re.sub(r"\s+", " ", value).strip()


def find_similar_organization(candidate_name: str, queryset=None):
    """Returns the closest active Organization whose normalized name matches
    candidate_name above SIMILARITY_THRESHOLD, or None. An exact normalized
    match short-circuits immediately."""
    if queryset is None:
        from .models import Organization

        queryset = Organization.objects.filter(is_active=True)

    target = normalize_company_name(candidate_name)
    if not target:
        return None

    best_match = None
    best_ratio = 0.0
    for organization in queryset.only("id", "name"):
        org_key = normalize_company_name(organization.name)
        if not org_key:
            continue
        if org_key == target:
            return organization
        ratio = difflib.SequenceMatcher(None, org_key, target).ratio()
        if ratio > best_ratio:
            best_ratio = ratio
            best_match = organization

    return best_match if best_ratio >= SIMILARITY_THRESHOLD else None
