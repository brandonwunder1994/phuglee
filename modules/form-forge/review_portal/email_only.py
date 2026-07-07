"""Email-only public records requests (no PDF attachment)."""
from __future__ import annotations

from review_portal.portal_registry import city_has_completed_pdf

EMAIL_ONLY_BLOCKED_NO_CONTACT = (
    "No contact email on file — open City Tracker and add the email address"
)


def is_email_only_city(city: dict) -> bool:
    """City accepts a plain-email request — email contact only, no portal URL, no completed PDF."""
    if city_has_completed_pdf(city):
        return False
    if city.get("pathway") == "email_pdf":
        return False
    has_email = bool((city.get("contact_email") or "").strip())
    has_portal = bool((city.get("portal_url") or "").strip())
    return has_email and not has_portal


def city_lacks_portal_and_email(city: dict) -> bool:
    return not (city.get("contact_email") or "").strip() and not (city.get("portal_url") or "").strip()


def is_email_only_workflow_city(city: dict) -> bool:
    """Cities that belong on the Email Only Requests page (send-ready or needs contact research)."""
    if city_has_completed_pdf(city):
        return False
    if city.get("pathway") == "email_pdf":
        return False
    if is_email_only_city(city):
        return True
    return city_lacks_portal_and_email(city)


def build_email_only_subject(city_name: str, state: str) -> str:
    return f"Public Records Request — {city_name}, {state}"


def build_email_only_body(city_name: str, state: str) -> str:
    place = f"{city_name}, {state}" if state else city_name
    return (
        "Hello,\n\n"
        "I hope this message finds you well. My name is Brandon Joseph Wunder, and I am reaching out "
        f"to request information about any code violations related to tall grass and trash/debris in {place} "
        "over the past 30 days. I am conducting research and would greatly appreciate your assistance "
        "in providing this information.\n\n"
        "If there's a specific department or individual I should reach out to, or if there are forms I need "
        "to complete, please let me know so I can ensure the request is properly processed.\n\n"
        "Thank you for your time and help. If you need any additional information or clarification, "
        "feel free to contact me at 602-815-8040.\n\n"
        "Best regards,\n"
        "Brandon Joseph Wunder\n"
        "602-815-8040"
    )


def email_only_channel_for(city: dict) -> str:
    return "email_only" if is_email_only_city(city) else "email_pdf"