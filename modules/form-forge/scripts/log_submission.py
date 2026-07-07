"""CLI for logging portal submissions and responses."""
from __future__ import annotations

import argparse
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from review_portal.portal_registry import find_city, load_registry
from review_portal.submission_tracker import SubmissionTrackerError, log_response, log_submission


def _print_success(action: str, event: dict) -> None:
    print(f"Logged {action} for {event['city']}, {event['state']} ({event['request_type']})")
    print(f"Event: {event['event_id']}")


def cmd_submit(args: argparse.Namespace) -> int:
    try:
        event = log_submission(args.city_id, args.type, "online_portal", notes=args.notes or "")
    except SubmissionTrackerError as exc:
        print(f"Error: {exc}", file=sys.stderr)
        return 1
    _print_success("online_portal submission", event)
    return 0


def cmd_email(args: argparse.Namespace) -> int:
    registry = load_registry()
    city = find_city(registry, args.city_id)
    if not city:
        print(f"Error: Unknown city id: {args.city_id}", file=sys.stderr)
        return 1
    email = args.email or city.get("contact_email", "")
    if not email:
        print("Error: --email is required when city has no contact_email", file=sys.stderr)
        return 1
    try:
        event = log_submission(
            args.city_id,
            args.type,
            "email_pdf",
            email=email,
            pdf_path=args.pdf_path or "",
            notes=args.notes or "",
        )
    except SubmissionTrackerError as exc:
        print(f"Error: {exc}", file=sys.stderr)
        return 1
    _print_success("email_pdf submission", event)
    return 0


def cmd_response(args: argparse.Namespace) -> int:
    if not args.status:
        print("Error: --status is required", file=sys.stderr)
        return 1
    try:
        event = log_response(
            args.city_id,
            args.type,
            args.status,
            response_raw=args.raw or "",
            notes=args.notes or "",
        )
    except SubmissionTrackerError as exc:
        print(f"Error: {exc}", file=sys.stderr)
        return 1
    _print_success("response_received", event)
    return 0


def main() -> None:
    parser = argparse.ArgumentParser(description="Log portal submissions and responses")
    sub = parser.add_subparsers(dest="command", required=True)

    submit = sub.add_parser("submit", help="Log an online portal submission")
    submit.add_argument("city_id", help="Registry city id, e.g. arizona-marana")
    submit.add_argument("--type", dest="type", default="code_violation", choices=["water_shutoff", "code_violation"])
    submit.add_argument("--notes", default="")
    submit.set_defaults(func=cmd_submit)

    email = sub.add_parser("email", help="Log an emailed PDF submission")
    email.add_argument("city_id")
    email.add_argument("--type", dest="type", default="code_violation", choices=["water_shutoff", "code_violation"])
    email.add_argument("--email", default="")
    email.add_argument("--pdf-path", dest="pdf_path", default="")
    email.add_argument("--notes", default="")
    email.set_defaults(func=cmd_email)

    response = sub.add_parser("response", help="Record a city response")
    response.add_argument("city_id")
    response.add_argument("--type", dest="type", default="code_violation", choices=["water_shutoff", "code_violation"])
    response.add_argument("--status", required=True)
    response.add_argument("--raw", default="")
    response.add_argument("--notes", default="")
    response.set_defaults(func=cmd_response)

    args = parser.parse_args()
    raise SystemExit(args.func(args))


if __name__ == "__main__":
    main()