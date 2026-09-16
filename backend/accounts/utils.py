import secrets
import string


def generate_temp_password(length: int = 12) -> str:
    """
    Generate a secure, random temporary password.
    Guarantees at least one lowercase, one uppercase, one digit, and one special symbol.
    """
    alphabet = string.ascii_letters + string.digits + "!@#$%&*?"
    required = [
        secrets.choice(string.ascii_lowercase),
        secrets.choice(string.ascii_uppercase),
        secrets.choice(string.digits),
        secrets.choice("!@#$%&*?"),
    ]
    remaining = [secrets.choice(alphabet) for _ in range(max(0, length - len(required)))]
    password_chars = required + remaining
    secrets.SystemRandom().shuffle(password_chars)
    return "".join(password_chars)
