# Structure

**Analysis date:** 2026-07-05

```
city-list-requests/
├── run_review_portal.py          # Entry point
├── requirements.txt
├── requirements-dev.txt
├── README.md
├── review_portal/
│   ├── app.py                    # Flask routes (all /api/* and pages)
│   ├── portal_registry.py        # Registry CRUD, import, city rules
│   ├── submission_tracker.py     # Logging, queues, KPIs, payloads
│   ├── apology_email.py          # Apology queue + send
│   ├── email_workflow.py         # PDF email send
│   ├── email_only_workflow.py    # Plain email send
│   ├── request_status.py         # Cooldown logic
│   ├── coverage_data.py          # Map layers + bootstrap
│   ├── data_guard.py             # Atomic I/O + backups
│   ├── api_errors.py             # Safe error responses
│   ├── gmail_client.py           # Gmail OAuth
│   └── static/                   # All UI pages + vendor assets
├── data/
│   ├── portal-registry.json      # Master city database (554 cities)
│   ├── submission-log.jsonl      # Append-only event log
│   ├── apology-email-queue.json  # Pending/sent apology cities
│   ├── review-queue.json         # Records Desk form queue
│   └── coverage-map-bootstrap.json
├── forms/
│   ├── raw/                      # Blank PDFs (gitignored)
│   ├── user-filled/              # Completed PDFs
│   └── previews-raw/             # PNG previews (gitignored)
├── config/
│   ├── settings.json             # User info, request text
│   └── signature-brandon.png
├── scripts/
│   ├── gsd.py                    # GSD verification wrapper
│   ├── audit_portal_readonly.py
│   ├── check_request_pdfs_page.py
│   └── import_portal_registry.py
├── tests/                        # pytest (9 modules, 89 tests)
└── docs/gsd/                     # Milestone history
```