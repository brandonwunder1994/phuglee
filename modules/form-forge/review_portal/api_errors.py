"""Safe API error responses — only expose intentional user-facing messages."""
from __future__ import annotations

import traceback

from flask import jsonify

from review_portal.apology_email import ApologyEmailError
from review_portal.email_only_workflow import EmailOnlyWorkflowError
from review_portal.email_workflow import EmailWorkflowError
from review_portal.gmail_client import GmailClientError
from review_portal.product_ideas import ProductIdeasError
from review_portal.submission_tracker import SubmissionTrackerError

USER_SAFE_ERRORS: tuple[type[BaseException], ...] = (
    ValueError,
    ApologyEmailError,
    EmailWorkflowError,
    EmailOnlyWorkflowError,
    GmailClientError,
    ProductIdeasError,
    SubmissionTrackerError,
    FileNotFoundError,
)

GENERIC_SERVER_ERROR = "An unexpected error occurred. Check the server log for details."
GENERIC_CLIENT_ERROR = "Request could not be completed."


def is_user_safe_error(exc: BaseException) -> bool:
    return isinstance(exc, USER_SAFE_ERRORS)


def error_message(exc: BaseException, *, status: int = 500) -> str:
    if is_user_safe_error(exc):
        text = str(exc).strip()
        if text:
            return text
    return GENERIC_CLIENT_ERROR if status < 500 else GENERIC_SERVER_ERROR


def json_error(exc: BaseException, *, status: int = 500, log: bool = True):
    if log:
        traceback.print_exc()
    return jsonify({"error": error_message(exc, status=status)}), status