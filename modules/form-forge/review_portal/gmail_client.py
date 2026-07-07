"""Send emails via Gmail using the connected ~/.gmail-mcp OAuth token."""
from __future__ import annotations

import base64
import mimetypes
from email.mime.application import MIMEApplication
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText
from pathlib import Path

from google.auth.transport.requests import Request
from google.oauth2.credentials import Credentials
from googleapiclient.discovery import build

from review_portal.portal_registry import normalize_contact_email
from review_portal.settings import load_settings

GMAIL_SCOPES = ["https://mail.google.com/"]
TOKEN_PATH = Path.home() / ".gmail-mcp" / "token.json"


class GmailClientError(RuntimeError):
    pass


def _load_credentials() -> Credentials:
    if not TOKEN_PATH.exists():
        raise GmailClientError(
            f"Gmail is not connected. Run AUTH-HERE.bat in {TOKEN_PATH.parent} first."
        )
    creds = Credentials.from_authorized_user_file(str(TOKEN_PATH), GMAIL_SCOPES)
    if creds.expired and creds.refresh_token:
        creds.refresh(Request())
    if not creds.valid:
        raise GmailClientError("Gmail credentials are invalid. Re-run AUTH-HERE.bat.")
    return creds


_gmail_service = None


def _build_service():
    global _gmail_service
    creds = _load_credentials()
    if _gmail_service is None:
        _gmail_service = build("gmail", "v1", credentials=creds, cache_discovery=False)
    return _gmail_service


def _encode_message(message: MIMEMultipart) -> dict:
    raw = base64.urlsafe_b64encode(message.as_bytes()).decode("utf-8")
    return {"raw": raw}


def send_plain_email(
    *,
    to: str,
    subject: str,
    body: str,
    cc: list[str] | None = None,
) -> dict:
    to = normalize_contact_email(to)
    if not to:
        raise GmailClientError("Recipient email is required")

    settings = load_settings()
    sender = (settings.get("email") or "").strip()

    message = MIMEMultipart()
    message["to"] = to
    message["subject"] = subject
    if sender:
        message["from"] = sender
    if cc:
        message["cc"] = ", ".join(cc)
    message.attach(MIMEText(body, "plain"))

    service = _build_service()
    sent = service.users().messages().send(userId="me", body=_encode_message(message)).execute()
    return {
        "message_id": sent.get("id", ""),
        "thread_id": sent.get("threadId", ""),
        "to": to,
        "subject": subject,
    }


def send_email_with_attachment(
    *,
    to: str,
    subject: str,
    body: str,
    attachment_path: Path,
    cc: list[str] | None = None,
) -> dict:
    to = normalize_contact_email(to)
    if not to:
        raise GmailClientError("Recipient email is required")

    attachment_path = Path(attachment_path)
    if not attachment_path.exists():
        raise GmailClientError(f"Attachment not found: {attachment_path}")

    settings = load_settings()
    sender = (settings.get("email") or "").strip()

    message = MIMEMultipart()
    message["to"] = to
    message["subject"] = subject
    if sender:
        message["from"] = sender
    if cc:
        message["cc"] = ", ".join(cc)
    message.attach(MIMEText(body, "plain"))

    mime_type, _ = mimetypes.guess_type(str(attachment_path))
    if mime_type is None:
        mime_type = "application/pdf"
    maintype, subtype = mime_type.split("/", 1)
    with attachment_path.open("rb") as handle:
        part = MIMEApplication(handle.read(), _subtype=subtype)
    part.add_header("Content-Disposition", "attachment", filename=attachment_path.name)
    message.attach(part)

    service = _build_service()
    sent = service.users().messages().send(userId="me", body=_encode_message(message)).execute()
    return {
        "message_id": sent.get("id", ""),
        "thread_id": sent.get("threadId", ""),
        "to": to,
        "subject": subject,
    }