from __future__ import annotations

import base64
import json
import re
import time
import traceback
import webbrowser
from pathlib import Path

from flask import Flask, jsonify, request, send_file
from werkzeug.exceptions import HTTPException

from review_portal.api_errors import json_error

from review_portal.fillable_detect import suggest_elements
from review_portal.office_use_boundary import office_use_boundaries
from review_portal.layout_store import load_layout, save_layout
from review_portal.pdf_save import save_elements_pdf, save_uploaded_pdf
from review_portal.raw_upload import raw_path as raw_pdf_path
from review_portal.raw_upload import save_blank_pdf
from review_portal.bridge_dataset import BridgeDatasetError, city_bridge_datasets, save_bridge_dataset
from review_portal.bridge_export import rows_to_csv_bytes, rows_to_xlsx_bytes
from review_portal.city_list_upload import CityListUploadError, save_city_response_list
from review_portal.coverage_boundaries import get_city_boundary
from review_portal.coverage_data import (
    build_coverage_geojson,
    build_coverage_map_bootstrap,
    build_coverage_payload,
    ensure_map_bootstrap_file,
    get_map_city_detail,
)
from review_portal.data_guard import create_full_snapshot, ensure_daily_snapshot, verify_integrity
from review_portal.data_guard import write_json_atomic as guard_write_json
from review_portal.portal_registry import (
    find_city,
    include_in_city_tracker,
    is_portal_error,
    load_registry,
    save_registry,
    set_contact_email_wrong,
)
from review_portal.product_ideas import ProductIdeasError, add_idea, list_ideas
from review_portal.save_tracker import filled_path, record_save, save_locations, sync_queue_from_disk
from review_portal.bulk_pdf_update import apply_settings_to_all_pdfs
from review_portal.settings import SETTINGS_PATH, load_settings, save_settings
from review_portal.apology_email import ApologyEmailError, send_apology_city_pdf_email
from review_portal.gmail_client import GmailClientError
from review_portal.email_only_workflow import EmailOnlyWorkflowError, send_city_email_only
from review_portal.email_workflow import EmailWorkflowError, send_city_pdf_email
from review_portal.request_status import compute_online_status
from review_portal.submission_tracker import (
    SubmissionTrackerError,
    build_cv_monthly_tracker,
    build_events_by_city,
    audit_email_only_cities,
    backfill_email_only_submission,
    build_pending_email_only_request_queue,
    build_pending_online_request_queue,
    build_pending_pdf_request_queue,
    build_portal_error_queue,
    clear_city_portal_error,
    mark_city_portal_error,
    reclassify_city_as_pdf_form,
    update_city_portal_url_record,
    build_submission_kpi,
    build_turnaround_stats,
    log_response,
    log_submission,
    portal_city_payload,
    portal_city_tracker_items,
    portal_city_tracker_summaries,
    read_recent_submissions,
    record_other_contact_response,
)

ROOT = Path(__file__).resolve().parents[1]
QUEUE_PATH = ROOT / "data" / "review-queue.json"
SIG_PATH = ROOT / "config" / "signature-brandon.png"

app = Flask(__name__, static_folder="static", static_url_path="/static")


@app.errorhandler(HTTPException)
def handle_http_exception(exc: HTTPException):
    return jsonify({"error": exc.description or "Request failed"}), exc.code


@app.errorhandler(Exception)
def handle_unhandled(exc):
    return json_error(exc, status=500)


@app.route("/api/health")
def api_health():
    return jsonify({"ok": True, "service": "form-forge"})


@app.route("/favicon.ico")
def favicon():
    return "", 204


@app.route("/api/data/integrity")
def api_data_integrity():
    report = verify_integrity()
    return jsonify(report)


@app.route("/api/data/backup", methods=["POST"])
def api_data_backup():
    snap = create_full_snapshot(label="manual")
    return jsonify({"ok": True, "snapshot": str(snap), "integrity": verify_integrity()})


def _load_queue() -> dict:
    if not QUEUE_PATH.exists():
        return {"items": [], "stats": {}}
    return json.loads(QUEUE_PATH.read_text(encoding="utf-8"))


def _save_queue(data: dict) -> None:
    guard_write_json(QUEUE_PATH, data)


def _safe_path(rel: str) -> Path | None:
    if not rel:
        return None
    full = (ROOT / rel).resolve()
    if not str(full).startswith(str(ROOT.resolve())):
        return None
    return full


def _resolve_raw_pdf(item: dict) -> Path | None:
    rel = item.get("raw_path", "")
    if rel:
        path = _safe_path(rel)
        if path and path.exists():
            return path
    disk = raw_pdf_path(item["state"], item["id"])
    if disk.exists():
        return disk
    return None


def _queue_item(queue: dict, form_id: str) -> dict | None:
    return next((i for i in queue.get("items", []) if i["id"] == form_id), None)


def _signature_file() -> Path:
    if SIG_PATH.exists():
        return SIG_PATH
    fallback = ROOT / "config" / "signature.png"
    return fallback if fallback.exists() else SIG_PATH


@app.route("/")
def index():
    return send_file(Path(__file__).parent / "static" / "index.html")


@app.route("/map")
def coverage_map():
    return send_file(Path(__file__).parent / "static" / "map.html")


@app.route("/portal")
def portal_tracker():
    return send_file(Path(__file__).parent / "static" / "portal.html")


@app.route("/portal/request-pdfs")
def portal_request_pdfs():
    return send_file(Path(__file__).parent / "static" / "request-pdfs.html")


@app.route("/portal/email-only")
def portal_email_only():
    return send_file(Path(__file__).parent / "static" / "email-only-requests.html")


@app.route("/portal/submit-portals")
def portal_submit_portals():
    return send_file(Path(__file__).parent / "static" / "submit-portals.html")


@app.route("/portal/portal-errors")
def portal_errors_page():
    return send_file(Path(__file__).parent / "static" / "portal-errors.html")


@app.route("/api/coverage")
def api_coverage():
    return jsonify(build_coverage_payload())


@app.route("/api/coverage/geojson")
def api_coverage_geojson():
    return jsonify(build_coverage_geojson())


@app.route("/api/coverage/map")
def api_coverage_map():
    ensure_map_bootstrap_file()
    resp = jsonify(build_coverage_map_bootstrap())
    resp.headers["Cache-Control"] = "public, max-age=300"
    return resp


@app.route("/api/coverage/city/<city_id>")
def api_coverage_city(city_id: str):
    city = get_map_city_detail(city_id)
    if not city:
        return jsonify({"error": "City not found"}), 404
    return jsonify(city)


@app.route("/api/coverage/city/<city_id>/boundary")
def api_coverage_city_boundary(city_id: str):
    city = get_map_city_detail(city_id)
    if not city:
        return jsonify({"error": "City not found"}), 404
    boundary = get_city_boundary(city_id, city=city["city"], state=city["state"])
    if not boundary:
        return jsonify({"error": "Boundary not available"}), 404
    resp = jsonify(boundary)
    resp.headers["Cache-Control"] = "public, max-age=86400"
    return resp


@app.route("/api/portal/cities")
def api_portal_cities():
    registry = load_registry()
    items = portal_city_tracker_items(registry)
    return jsonify({"total": len(items), "items": items})


@app.route("/api/portal/cities/summary")
def api_portal_cities_summary():
    registry = load_registry()
    items = portal_city_tracker_summaries(registry)
    resp = jsonify({"total": len(items), "items": items})
    resp.headers["Cache-Control"] = "no-cache, no-store, must-revalidate"
    return resp


@app.route("/api/portal/city/<city_id>")
def api_portal_city(city_id: str):
    registry = load_registry()
    city = find_city(registry, city_id)
    if not city or not include_in_city_tracker(city):
        return jsonify({"error": "not found"}), 404
    from review_portal.apology_email import load_apology_queue

    apology_queue = load_apology_queue()
    events_by_city = build_events_by_city(registry)
    return jsonify(
        portal_city_payload(
            city,
            registry=registry,
            events_by_city=events_by_city,
            apology_queue=apology_queue,
        )
    )


@app.route("/api/portal/city/<city_id>/submit", methods=["POST"])
def api_portal_submit(city_id: str):
    body = request.get_json(force=True) or {}
    request_type = str(body.get("request_type", "code_violation"))
    registry = load_registry()
    city = find_city(registry, city_id)
    if not city:
        return jsonify({"error": "not found"}), 404
    if is_portal_error(city):
        return jsonify({"error": "Portal URL is flagged as errored — fix it before submitting"}), 400
    online_status = compute_online_status(city, request_type)
    if not online_status["can_submit"]:
        return jsonify({"error": online_status.get("blocked_reason") or "Online submit unavailable"}), 400
    try:
        event = log_submission(
            city_id,
            request_type,
            "online_portal",
            notes=str(body.get("notes", "Submitted from City Tracker")),
            registry=registry,
        )
    except ValueError as exc:
        return jsonify({"error": str(exc)}), 400
    city = find_city(registry, city_id)
    redirect_url = city.get("portal_url", "")
    if body.get("light"):
        return jsonify({"ok": True, "event": event, "redirect_url": redirect_url})
    events_by_city = build_events_by_city(registry)
    payload = portal_city_payload(city, registry=registry, events_by_city=events_by_city)
    return jsonify(
        {
            "ok": True,
            "event": event,
            "city": payload,
            "redirect_url": redirect_url,
        }
    )


@app.route("/api/portal/city/<city_id>/email", methods=["POST"])
def api_portal_email(city_id: str):
    """Legacy manual log endpoint — prefer /send-email for actual Gmail delivery."""
    body = request.get_json(force=True) or {}
    request_type = str(body.get("request_type", "code_violation"))
    try:
        event = log_submission(
            city_id,
            request_type,
            "email_pdf",
            email=str(body.get("email", "")),
            pdf_path=str(body.get("pdf_path", "")),
            notes=str(body.get("notes", "")),
        )
    except ValueError as exc:
        return jsonify({"error": str(exc)}), 400
    registry = load_registry()
    city = find_city(registry, city_id)
    return jsonify({"ok": True, "event": event, "city": portal_city_payload(city, registry=registry)})


@app.route("/api/portal/city/<city_id>/send-apology-email", methods=["POST"])
def api_portal_send_apology_email(city_id: str):
    body = request.get_json(force=True) or {}
    try:
        result = send_apology_city_pdf_email(
            city_id,
            request_type=str(body.get("request_type", "code_violation")),
            email=str(body.get("email", "")),
            subject=str(body.get("subject", "")),
            body=str(body.get("body", "")),
            notes=str(body.get("notes", "One-time apology resend from City Tracker")),
        )
    except ApologyEmailError as exc:
        return jsonify({"error": str(exc)}), 400
    except GmailClientError as exc:
        return jsonify({"error": str(exc)}), 400
    registry = load_registry()
    city = find_city(registry, city_id)
    return jsonify({"ok": True, **result, "city": portal_city_payload(city, registry=registry)})


@app.route("/api/portal/city/<city_id>/contact-email-wrong", methods=["POST"])
def api_portal_contact_email_wrong(city_id: str):
    body = request.get_json(force=True) or {}
    wrong = bool(body.get("wrong", True))
    registry = load_registry()
    city = find_city(registry, city_id)
    if not city or not include_in_city_tracker(city):
        return jsonify({"error": "not found"}), 404
    try:
        set_contact_email_wrong(city, wrong=wrong)
    except ValueError as exc:
        return jsonify({"error": str(exc)}), 400
    save_registry(registry)
    return jsonify(
        {
            "ok": True,
            "contact_email_wrong": bool(city.get("contact_email_wrong")),
            "city": portal_city_payload(city, registry=registry),
        }
    )


@app.route("/api/portal/city/<city_id>/send-email", methods=["POST"])
def api_portal_send_email(city_id: str):
    body = request.get_json(force=True) or {}
    try:
        result = send_city_pdf_email(
            city_id,
            request_type=str(body.get("request_type", "code_violation")),
            email=str(body.get("email", "")),
            subject=str(body.get("subject", "")),
            body=str(body.get("body", "")),
            notes=str(body.get("notes", "Sent from City Tracker")),
        )
    except EmailWorkflowError as exc:
        return jsonify({"error": str(exc)}), 400
    except GmailClientError as exc:
        return jsonify({"error": str(exc)}), 400
    registry = load_registry()
    city = find_city(registry, city_id)
    return jsonify({"ok": True, **result, "city": portal_city_payload(city, registry=registry)})


@app.route("/api/portal/city/<city_id>/response", methods=["POST"])
def api_portal_response(city_id: str):
    if "multipart/form-data" in (request.content_type or ""):
        body = request.form.to_dict()
        upload = request.files.get("list_file")
    else:
        body = request.get_json(force=True) or {}
        upload = None

    request_type = str(body.get("request_type", "code_violation"))
    response_status = str(body.get("response_status", ""))
    if not response_status:
        return jsonify({"error": "response_status is required"}), 400

    registry = load_registry()
    city = find_city(registry, city_id)
    if not city:
        return jsonify({"error": "City not found"}), 404

    list_file = None
    try:
        if upload and upload.filename:
            list_file = save_city_response_list(
                city,
                request_type,
                filename=upload.filename,
                data=upload.read(),
                response_status=response_status,
            )

        if response_status == "other_contact":
            result = record_other_contact_response(
                city_id,
                request_type,
                new_contact_email=str(body.get("new_contact_email", "")),
                response_raw=str(body.get("response_raw", "")),
                response_at=str(body.get("response_at", "")),
                notes=str(body.get("notes", "")),
                list_file=list_file,
                registry=registry,
                persist=True,
            )
            event = result["event"]
            email_sent = result.get("email_sent", False)
            email_error = result.get("email_error", "")
        else:
            event = log_response(
                city_id,
                request_type,
                response_status,
                response_raw=str(body.get("response_raw", "")),
                response_at=str(body.get("response_at", "")),
                notes=str(body.get("notes", "")),
                list_file=list_file,
                registry=registry,
                persist=True,
            )
            email_sent = False
            email_error = ""
    except (ValueError, SubmissionTrackerError, CityListUploadError) as exc:
        return jsonify({"error": str(exc)}), 400

    city = find_city(registry, city_id)
    return jsonify(
        {
            "ok": True,
            "event": event,
            "city": portal_city_payload(city, registry=registry),
            "email_sent": email_sent,
            "email_error": email_error,
            "list_file": list_file,
        }
    )


BRIDGE_UPLOAD_TYPES = frozenset({"code_violation", "water_shut_off"})
BRIDGE_TO_REQUEST_TYPE = {
    "code_violation": "code_violation",
    "water_shut_off": "water_shutoff",
}


@app.route("/api/portal/city/<city_id>/bridge/attach", methods=["POST"])
def api_portal_bridge_attach(city_id: str):
    body = request.get_json(force=True) or {}
    upload_type = str(body.get("uploadType") or body.get("upload_type") or "").strip()
    response_received_at = str(
        body.get("responseReceivedAt") or body.get("response_received_at") or ""
    ).strip()
    original_filename = str(body.get("originalFilename") or body.get("original_filename") or "").strip()
    rows = body.get("rows") or []
    stats = body.get("stats") or {}
    metadata = body.get("metadata") or {}

    if upload_type not in BRIDGE_UPLOAD_TYPES:
        return jsonify({"error": "uploadType must be code_violation or water_shut_off"}), 400
    if not response_received_at:
        return jsonify({"error": "responseReceivedAt is required"}), 400
    if not original_filename:
        return jsonify({"error": "originalFilename is required"}), 400
    if not isinstance(rows, list) or not rows:
        return jsonify({"error": "rows must be a non-empty array"}), 400

    registry = load_registry()
    city = find_city(registry, city_id)
    if not city:
        return jsonify({"error": "City not found"}), 404

    try:
        csv_bytes = rows_to_csv_bytes(rows)
        xlsx_bytes = rows_to_xlsx_bytes(rows)
        entry = save_bridge_dataset(
            city,
            upload_type=upload_type,
            original_filename=original_filename,
            stats=stats,
            csv_bytes=csv_bytes,
            xlsx_bytes=xlsx_bytes,
            metadata=metadata,
            response_received_at=response_received_at,
        )
        request_type = BRIDGE_TO_REQUEST_TYPE[upload_type]
        event = log_response(
            city_id,
            request_type,
            "yes",
            response_raw="Data Bridge attach",
            response_at=response_received_at,
            notes=f"Data Bridge v2 attach — {entry.get('kept_count', 0)} kept from {original_filename}",
            registry=registry,
            persist=True,
        )
        save_registry(registry)
    except (BridgeDatasetError, ValueError, SubmissionTrackerError) as exc:
        return jsonify({"error": str(exc)}), 400

    version = city_bridge_datasets(city)[0]
    turnaround_days = event.get("turnaround_days")
    return jsonify(
        {
            "ok": True,
            "version": {
                **version,
                "turnaround_days": turnaround_days,
            },
            "event": event,
        }
    )


@app.route("/api/portal/submissions")
def api_portal_submissions():
    limit = request.args.get("limit", default=100, type=int)
    limit = max(1, min(limit, 500))
    return jsonify({"items": read_recent_submissions(limit=limit)})


@app.route("/api/portal/cv-tracker")
def api_portal_cv_tracker():
    registry = load_registry()
    return jsonify(build_cv_monthly_tracker(registry))


@app.route("/api/portal/kpi")
def api_portal_kpi():
    registry = load_registry()
    return jsonify(build_submission_kpi(registry))


@app.route("/api/portal/pending-pdf-requests")
def api_portal_pending_pdf_requests():
    registry = load_registry()
    return jsonify(build_pending_pdf_request_queue(registry))


@app.route("/api/portal/pending-email-only-requests")
def api_portal_pending_email_only_requests():
    registry = load_registry()
    return jsonify(build_pending_email_only_request_queue(registry))


@app.route("/api/portal/pending-online-requests")
def api_portal_pending_online_requests():
    registry = load_registry()
    resp = jsonify(build_pending_online_request_queue(registry))
    resp.headers["Cache-Control"] = "no-cache, no-store, must-revalidate"
    return resp


@app.route("/api/portal/portal-errors")
def api_portal_errors():
    registry = load_registry()
    return jsonify(build_portal_error_queue(registry))


@app.route("/api/portal/city/<city_id>/portal-error", methods=["POST"])
def api_portal_mark_error(city_id: str):
    body = request.get_json(force=True) or {}
    try:
        result = mark_city_portal_error(city_id, notes=str(body.get("notes", "")))
    except ValueError as exc:
        return jsonify({"error": str(exc)}), 400
    return jsonify({"ok": True, **result})


@app.route("/api/portal/city/<city_id>/portal-error/clear", methods=["POST"])
def api_portal_clear_error(city_id: str):
    try:
        result = clear_city_portal_error(city_id)
    except ValueError as exc:
        return jsonify({"error": str(exc)}), 400
    return jsonify({"ok": True, **result})


@app.route("/api/portal/city/<city_id>/reclassify-pdf-form", methods=["POST"])
def api_portal_reclassify_pdf_form(city_id: str):
    body = request.get_json(force=True) or {}
    try:
        result = reclassify_city_as_pdf_form(city_id, notes=str(body.get("notes", "")))
    except ValueError as exc:
        return jsonify({"error": str(exc)}), 400
    return jsonify({"ok": True, **result})


@app.route("/api/portal/city/<city_id>/portal-url", methods=["POST"])
def api_portal_update_url(city_id: str):
    body = request.get_json(force=True) or {}
    portal_url = str(body.get("portal_url", "")).strip()
    url_notes = body.get("url_notes")
    if url_notes is not None:
        url_notes = str(url_notes)
    try:
        result = update_city_portal_url_record(
            city_id,
            portal_url=portal_url,
            url_notes=url_notes,
        )
    except ValueError as exc:
        return jsonify({"error": str(exc)}), 400
    return jsonify({"ok": True, **result})


@app.route("/api/portal/email-only/audit")
def api_portal_email_only_audit():
    lookback_days = int(request.args.get("days", 2))
    registry = load_registry()
    return jsonify(audit_email_only_cities(registry=registry, lookback_days=lookback_days))


@app.route("/api/portal/email-only/backfill", methods=["POST"])
def api_portal_email_only_backfill():
    body = request.get_json(force=True) or {}
    city_id = str(body.get("city_id", "")).strip()
    logged_at = str(body.get("logged_at", "")).strip()
    if not city_id or not logged_at:
        return jsonify({"error": "city_id and logged_at are required"}), 400
    try:
        event = backfill_email_only_submission(
            city_id,
            logged_at,
            email=str(body.get("email", "")),
            notes=str(body.get("notes", "Backfilled email-only submission")),
        )
    except SubmissionTrackerError as exc:
        return jsonify({"error": str(exc)}), 400
    registry = load_registry()
    city = find_city(registry, city_id)
    return jsonify({"ok": True, "event": event, "city": portal_city_payload(city, registry=registry)})


@app.route("/api/portal/city/<city_id>/send-email-only", methods=["POST"])
def api_portal_send_email_only(city_id: str):
    body = request.get_json(force=True) or {}
    try:
        result = send_city_email_only(
            city_id,
            request_type=str(body.get("request_type", "code_violation")),
            email=str(body.get("email", "")),
            subject=str(body.get("subject", "")),
            body=str(body.get("body", "")),
            notes=str(body.get("notes", "Sent from Email Only Requests workflow")),
        )
    except EmailOnlyWorkflowError as exc:
        return jsonify({"error": str(exc)}), 400
    except GmailClientError as exc:
        return jsonify({"error": str(exc)}), 400
    registry = load_registry()
    city = find_city(registry, city_id)
    return jsonify({"ok": True, **result, "city": portal_city_payload(city, registry=registry)})


@app.route("/api/portal/turnaround")
def api_portal_turnaround():
    registry = load_registry()
    return jsonify(build_turnaround_stats(registry))


@app.route("/api/form/<form_id>/send-apology-email", methods=["POST"])
def api_form_send_apology_email(form_id: str):
    body = request.get_json(force=True) or {}
    try:
        result = send_apology_city_pdf_email(
            form_id,
            request_type=str(body.get("request_type", "code_violation")),
            email=str(body.get("email", "")),
            subject=str(body.get("subject", "")),
            body=str(body.get("body", "")),
            notes=str(body.get("notes", "One-time apology resend from Records Desk")),
        )
    except ApologyEmailError as exc:
        return jsonify({"error": str(exc)}), 400
    except GmailClientError as exc:
        return jsonify({"error": str(exc)}), 400
    registry = load_registry()
    city = find_city(registry, form_id)
    return jsonify({"ok": True, **result, "city": portal_city_payload(city, registry=registry) if city else None})


@app.route("/api/form/<form_id>/send-email", methods=["POST"])
def api_form_send_email(form_id: str):
    body = request.get_json(force=True) or {}
    try:
        result = send_city_pdf_email(
            form_id,
            request_type=str(body.get("request_type", "code_violation")),
            email=str(body.get("email", "")),
            subject=str(body.get("subject", "")),
            body=str(body.get("body", "")),
            notes=str(body.get("notes", "Sent from Records Desk")),
        )
    except EmailWorkflowError as exc:
        return jsonify({"error": str(exc)}), 400
    except GmailClientError as exc:
        return jsonify({"error": str(exc)}), 400
    registry = load_registry()
    city = find_city(registry, form_id)
    return jsonify({"ok": True, **result, "city": portal_city_payload(city, registry=registry) if city else None})


@app.route("/api/ideas")
def api_list_ideas():
    return jsonify({"items": list_ideas()})


@app.route("/api/ideas", methods=["POST"])
def api_add_idea():
    body = request.get_json(force=True) or {}
    try:
        idea = add_idea(str(body.get("text", "")))
    except ProductIdeasError as exc:
        return jsonify({"error": str(exc)}), 400
    return jsonify({"ok": True, "idea": idea})


@app.route("/api/settings", methods=["GET"])
def api_get_settings():
    data = load_settings()
    public = {k: v for k, v in data.items() if k != "paths"}
    public["desktop_folder"] = data["paths"]["desktop_folder"]
    return jsonify(public)


@app.route("/api/settings", methods=["POST"])
def api_save_settings():
    body = request.get_json(force=True) or {}
    updated = save_settings(body)
    public = {k: v for k, v in updated.items() if k != "paths"}
    public["desktop_folder"] = updated["paths"]["desktop_folder"]
    return jsonify({"ok": True, "settings": public})


@app.route("/api/settings/bulk-apply", methods=["POST"])
def api_bulk_apply_settings():
    """Save contact info and regenerate all city PDFs with the new details."""
    body = request.get_json(force=True) or {}
    name = str(body.get("name", "")).strip()
    phone = str(body.get("phone", "")).strip()
    email = str(body.get("email", "")).strip()
    if not name or not phone or not email:
        return jsonify({"error": "name, phone, and email are required"}), 400

    payload = {"name": name, "phone": phone, "email": email}
    if name:
        payload["signature_name"] = name
    updated = save_settings(payload)

    queue = sync_queue_from_disk(_load_queue())
    results = apply_settings_to_all_pdfs(queue)

    updated_ids = {row["id"] for row in results["updated"]}
    for item in queue.get("items", []):
        if item["id"] not in updated_ids:
            continue
        rel = filled_path(item["state"], item["id"])
        item["status"] = "completed"
        item["user_filled_path"] = str(rel.relative_to(ROOT)).replace("\\", "/")
    queue = sync_queue_from_disk(queue)
    _save_queue(queue)

    public = {k: v for k, v in updated.items() if k != "paths"}
    public["desktop_folder"] = updated["paths"]["desktop_folder"]
    return jsonify(
        {
            "ok": True,
            "settings": public,
            "results": {
                **results,
                "updated_count": len(results["updated"]),
                "skipped_count": len(results["skipped"]),
                "error_count": len(results["errors"]),
            },
        }
    )


@app.route("/api/defaults")
def api_defaults():
    """Backward-compatible alias for settings."""
    return api_get_settings()


@app.route("/api/signature.png")
def api_signature():
    path = _signature_file()
    if not path.exists():
        return jsonify({"error": "no signature saved yet"}), 404
    resp = send_file(path, mimetype="image/png")
    resp.headers["Cache-Control"] = "no-cache, no-store, must-revalidate"
    return resp


@app.route("/api/signature", methods=["POST"])
def api_save_signature():
    body = request.get_json(force=True) or {}
    data_url = str(body.get("image", ""))
    match = re.match(r"^data:image/png;base64,(.+)$", data_url, re.DOTALL)
    if not match:
        return jsonify({"error": "send a PNG data URL"}), 400
    try:
        raw = base64.b64decode(match.group(1), validate=True)
    except Exception:
        return jsonify({"error": "invalid image data"}), 400
    if len(raw) < 32:
        return jsonify({"error": "signature image too small — draw your signature first"}), 400

    SIG_PATH.parent.mkdir(parents=True, exist_ok=True)
    SIG_PATH.write_bytes(raw)
    return jsonify({"ok": True, "path": str(SIG_PATH)})


@app.route("/api/layout/<form_id>", methods=["GET"])
def api_get_layout(form_id: str):
    data = load_layout(form_id)
    if not data:
        return jsonify({"elements": []})
    return jsonify(data)


@app.route("/api/autofill/<form_id>")
def api_autofill(form_id: str):
    queue = _load_queue()
    item = _queue_item(queue, form_id)
    if not item:
        return jsonify({"error": "not found"}), 404
    raw = _resolve_raw_pdf(item)
    if not raw:
        return jsonify({"error": "no blank PDF"}), 400
    if not item.get("fillable"):
        return jsonify({"elements": [], "message": "This PDF has no fillable fields"})
    elements = suggest_elements(raw)
    boundaries = office_use_boundaries(raw)
    return jsonify({"elements": elements, "count": len(elements), "office_boundaries": boundaries})


@app.route("/api/forms")
def api_forms():
    queue = sync_queue_from_disk(_load_queue())
    _save_queue(queue)
    items = queue.get("items", [])
    completed = sum(1 for i in items if i.get("status") == "completed")
    pending = sum(1 for i in items if i.get("status") == "pending")
    missing = sum(1 for i in items if i.get("status") == "missing_pdf")
    return jsonify(
        {
            "items": items,
            "stats": {
                **queue.get("stats", {}),
                "total": len(items),
                "completed": completed,
                "pending": pending,
                "missing_pdf": missing,
            },
            "save_locations": save_locations(),
        }
    )


@app.route("/api/form/<form_id>")
def api_form_detail(form_id: str):
    try:
        queue = sync_queue_from_disk(_load_queue())
        item = _queue_item(queue, form_id)
        if not item:
            return jsonify({"error": "not found"}), 404
        raw = _resolve_raw_pdf(item)
        if raw:
            item["office_boundaries"] = office_use_boundaries(raw)
        else:
            item["office_boundaries"] = {}
        registry = load_registry()
        city = find_city(registry, form_id)
        if city:
            item["contact_email"] = city.get("contact_email", "") or item.get("email", "")
            item["contact_email_wrong"] = bool(city.get("contact_email_wrong"))
            from review_portal.portal_registry import contact_email_invalid

            item["contact_email_invalid"] = contact_email_invalid(city)
            item["portal_url"] = city.get("portal_url", "") or item.get("url", "")
            if not item.get("url") and city.get("portal_url"):
                item["url"] = city.get("portal_url", "")
            payload = portal_city_payload(city, registry=registry)
            item["tracking"] = payload.get("tracking", {})
            item["apology_email"] = payload.get("apology_email", {})
        return jsonify(item)
    except (ValueError, FileNotFoundError, OSError) as exc:
        return json_error(exc, status=400)
    except Exception as exc:
        return json_error(exc, status=500)


@app.route("/api/upload-blank/<form_id>", methods=["POST"])
def api_upload_blank(form_id: str):
    queue = _load_queue()
    item = next((i for i in queue.get("items", []) if i["id"] == form_id), None)
    if not item:
        return jsonify({"error": "not found"}), 404

    if "pdf" not in request.files:
        return jsonify({"error": "no PDF file in request"}), 400

    upload = request.files["pdf"]
    if not upload.filename:
        return jsonify({"error": "empty filename"}), 400

    try:
        meta = save_blank_pdf(item, upload.read())
    except ValueError as exc:
        return jsonify({"error": str(exc)}), 400

    for i in queue.get("items", []):
        if i["id"] == form_id:
            i["raw_path"] = meta["raw_path"]
            i["preview_path"] = meta.get("preview_path", "")
            i["fillable"] = meta.get("fillable", False)
            i["field_count"] = meta.get("field_count", 0)
            i["field_names"] = meta.get("field_names", [])
            i["blank_uploaded_at"] = meta["uploaded_at"]
            if i.get("status") != "completed":
                i["status"] = "pending"
            break

    queue = sync_queue_from_disk(queue)
    _save_queue(queue)

    return jsonify(
        {
            "ok": True,
            "raw_path": meta["raw_path"],
            "fillable": meta.get("fillable", False),
            "message": f"Blank PDF saved for {item['city']}, {item['state']}. You can now fill it in the editor.",
        }
    )


@app.route("/api/save/<form_id>", methods=["POST"])
def api_save(form_id: str):
    try:
        queue = sync_queue_from_disk(_load_queue())
        item = _queue_item(queue, form_id)
        if not item:
            return jsonify({"error": "not found"}), 404

        dest = filled_path(item["state"], item["id"])
        dest.parent.mkdir(parents=True, exist_ok=True)
        rel_dest = str(dest.relative_to(ROOT)).replace("\\", "/")
        is_filled_upload = "multipart/form-data" in (request.content_type or "") and "pdf" in request.files
        source = "upload" if is_filled_upload else "editor"

        if is_filled_upload:
            save_uploaded_pdf(dest, request.files["pdf"].read())
        elif request.is_json:
            raw = _resolve_raw_pdf(item)
            if not raw:
                return jsonify({"error": "Blank PDF not found. Upload the blank PDF first."}), 400
            body = request.get_json(force=True)
            elements = body.get("elements", [])
            if not elements:
                return jsonify({"error": "place at least one field on the PDF"}), 400
            save_elements_pdf(raw, dest, elements)
            save_layout(form_id, elements)
            if not item.get("raw_path"):
                item["raw_path"] = str(raw.relative_to(ROOT)).replace("\\", "/")
                if item.get("status") != "completed":
                    item["status"] = "pending"
        else:
            return jsonify({"error": "invalid request"}), 400

        entry = record_save(item, rel_dest, source=source)

        now = entry["saved_at"]
        for i in queue.get("items", []):
            if i["id"] == form_id:
                i["status"] = "completed"
                i["user_filled_path"] = rel_dest
                i["saved_at"] = now
                i["desktop_path"] = entry["desktop_path"]
        queue = sync_queue_from_disk(queue)
        _save_queue(queue)

        completed = queue.get("stats", {}).get("completed", entry["completed_count"])
        return jsonify(
            {
                "ok": True,
                "path": rel_dest,
                "desktop_path": entry["desktop_path"],
                "completed_count": completed,
                "message": f"Saved! {completed} forms done total.",
            }
        )
    except (ValueError, FileNotFoundError, OSError) as exc:
        return json_error(exc, status=400)
    except Exception as exc:
        return json_error(exc, status=500)


@app.route("/api/file/<path:rel_path>")
def api_file(rel_path: str):
    full = _safe_path(rel_path)
    if not full or not full.exists():
        return jsonify({"error": "not found"}), 404
    resp = send_file(full)
    if "user-filled" in rel_path.replace("\\", "/"):
        resp.headers["Cache-Control"] = "no-cache, no-store, must-revalidate"
    return resp


def main() -> None:
    port = 8787
    url = f"http://127.0.0.1:{port}"
    print(f"\n  PDF Form Filler: {url}\n")
    print(f"  Settings: {SETTINGS_PATH}\n")
    try:
        snap = ensure_daily_snapshot()
        report = verify_integrity()
        print(f"  Data backup: {snap}")
        print(
            f"  Forms secured: {report['pdf_count']} PDFs | "
            f"{report['manifest_count']} manifest | "
            f"{report['layout_count']} layouts"
        )
        if not report["ok"]:
            print("  WARNING: integrity check found issues — run: python scripts/verify_data_integrity.py")
    except Exception as exc:
        print(f"  Backup check skipped: {exc}")
    webbrowser.open(url)
    while True:
        try:
            app.run(host="127.0.0.1", port=port, debug=False, use_reloader=False, threaded=True)
            break
        except KeyboardInterrupt:
            print("\n  Stopped.")
            break
        except Exception as exc:
            print(f"\n  Server error: {exc}")
            traceback.print_exc()
            print("  Restarting in 2 seconds…")
            time.sleep(2)


if __name__ == "__main__":
    main()