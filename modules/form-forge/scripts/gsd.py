#!/usr/bin/env python3
"""GSD command wrapper for The Form Forge (city-list-requests).

All project verification, testing, and audit actions should go through this script
so agents use a single GSD entry point instead of raw shell commands.

Usage:
  python scripts/gsd.py test [-- -k pattern]
  python scripts/gsd.py audit
  python scripts/gsd.py lint-imports
  python scripts/gsd.py structure
  python scripts/gsd.py verify-data
  python scripts/gsd.py perf
  python scripts/gsd.py deps         # install dev dependencies
  python scripts/gsd.py sync-email-only
  python scripts/gsd.py verify       # full final sweep
"""
from __future__ import annotations

import argparse
import subprocess
import sys
from pathlib import Path

# PowerShell (and some CI harnesses) treat any stderr as failure even when exit code is 0.
sys.stderr = sys.stdout

ROOT = Path(__file__).resolve().parents[1]


def run(cmd: list[str], *, cwd: Path = ROOT) -> int:
    """Run a subprocess; merge stderr into stdout so PowerShell won't false-fail on stderr."""
    print(f"[gsd] {' '.join(cmd)}", flush=True)
    return subprocess.call(cmd, cwd=cwd, stderr=subprocess.STDOUT)


def cmd_test(extra: list[str]) -> int:
    base = [sys.executable, "-m", "pytest", "tests", "-v", "--tb=short"]
    return run(base + extra)


def cmd_audit() -> int:
    scripts = [
        "scripts/audit_portal_readonly.py",
        "scripts/audit_email_only_cities.py",
        "scripts/check_request_pdfs_page.py",
        "scripts/verify_coverage_map_m5.py",
    ]
    code = 0
    for script in scripts:
        path = ROOT / script
        if not path.exists():
            print(f"[gsd] skip missing audit: {script}")
            continue
        rc = run([sys.executable, str(path)])
        code = code or rc
    return code


def cmd_lint_imports() -> int:
    """Lightweight unused-import scan via compileall (syntax) + ruff if available."""
    rc = run([sys.executable, "-m", "compileall", "-q", "review_portal", "tests", "scripts"])
    if rc:
        return rc
    try:
        subprocess.check_output(["ruff", "--version"], stderr=subprocess.STDOUT)
    except (subprocess.CalledProcessError, FileNotFoundError):
        print("[gsd] ruff not installed — syntax check only")
        return 0
    return run(["ruff", "check", "review_portal", "tests", "scripts"])


def cmd_perf() -> int:
    """Verify City Tracker summary payload stays under budget vs full cities API."""
    sys.path.insert(0, str(ROOT))
    from review_portal.app import app  # noqa: WPS433

    client = app.test_client()
    full = client.get("/api/portal/cities").get_data()
    summary = client.get("/api/portal/cities/summary").get_data()
    full_len = len(full)
    summary_len = len(summary)
    ratio = summary_len / full_len if full_len else 1.0
    budget = 0.50
    ok = ratio < budget
    print(f"  full_bytes={full_len}")
    print(f"  summary_bytes={summary_len}")
    print(f"  ratio={ratio:.1%} (budget <{budget:.0%})")
    if ok:
        print("[gsd] perf check passed")
        return 0
    print("[gsd] perf check failed — summary payload too large")
    return 1


def cmd_sync_email_only() -> int:
    scripts = [
        ROOT / "scripts" / "sync_email_only_from_excel.py",
        ROOT / "scripts" / "sync_email_only_from_audit.py",
    ]
    code = 0
    for script in scripts:
        if not script.exists():
            print(f"[gsd] skip missing: {script.name}")
            continue
        rc = run([sys.executable, str(script)])
        code = code or rc
    return code


def cmd_deps() -> int:
    """Install development dependencies (pytest, playwright, ruff, etc.)."""
    req = ROOT / "requirements-dev.txt"
    if not req.exists():
        print("[gsd] requirements-dev.txt missing")
        return 1
    return run(
        [
            sys.executable,
            "-m",
            "pip",
            "install",
            "-r",
            str(req),
            "--disable-pip-version-check",
            "-q",
        ]
    )


def cmd_verify() -> int:
    """Run complete verification sweep (Phase 5 final check)."""
    steps: list[tuple[str, int]] = []
    for name, fn in (
        ("structure", cmd_structure),
        ("lint-imports", cmd_lint_imports),
        ("test", lambda: cmd_test([])),
        ("perf", cmd_perf),
        ("verify-data", lambda: run([sys.executable, str(ROOT / "scripts" / "verify_data_integrity.py")])),
        ("audit", cmd_audit),
    ):
        print(f"\n[gsd] === verify:{name} ===", flush=True)
        rc = fn()
        steps.append((name, rc))
        if rc:
            print(f"[gsd] verify failed at step: {name}", flush=True)
            break

    print("\n[gsd] === verify:health ===", flush=True)
    health_rc = run(
        [
            "node",
            str(Path.home() / ".claude" / "get-shit-done" / "bin" / "gsd-tools.cjs"),
            "validate",
            "health",
            f"--cwd={ROOT}",
        ]
    )
    steps.append(("health", health_rc))

    print("\n[gsd] verify summary:", flush=True)
    failed = [name for name, rc in steps if rc]
    for name, rc in steps:
        print(f"  {'PASS' if rc == 0 else 'FAIL'}  {name}", flush=True)
    if failed:
        print(f"[gsd] verify FAILED ({len(failed)} steps)", flush=True)
        return 1
    print("[gsd] verify PASSED — all steps green", flush=True)
    return 0


def cmd_structure() -> int:
    entries = [
        "run_review_portal.py",
        "requirements.txt",
        "review_portal/app.py",
        "tests",
        "data/portal-registry.json",
        "config/settings.json",
        "docs/gsd/README.md",
        ".planning/codebase/ARCHITECTURE.md",
        "README.md",
    ]
    missing = [e for e in entries if not (ROOT / e).exists()]
    for e in entries:
        status = "OK" if e not in missing else "MISSING"
        print(f"  [{status}] {e}")
    if missing:
        print(f"[gsd] structure check failed: {len(missing)} missing")
        return 1
    print("[gsd] structure check passed")
    return 0


def main() -> int:
    parser = argparse.ArgumentParser(description="GSD wrapper for Form Forge")
    sub = parser.add_subparsers(dest="command", required=True)

    p_test = sub.add_parser("test", help="Run pytest suite")
    p_test.add_argument("extra", nargs=argparse.REMAINDER, help="Extra pytest args")

    sub.add_parser("audit", help="Run readonly audit scripts")
    sub.add_parser("lint-imports", help="Syntax + optional ruff lint")
    sub.add_parser("structure", help="Verify key project paths exist")
    sub.add_parser("verify-data", help="Run completed-forms integrity check")
    sub.add_parser("perf", help="Check summary vs full cities payload ratio")
    sub.add_parser("deps", help="Install dev dependencies from requirements-dev.txt")
    sub.add_parser("sync-email-only", help="Sync email-only cities from Excel into registry")
    sub.add_parser("verify", help="Full verification sweep (all checks)")

    args = parser.parse_args()
    if args.command == "test":
        extra = [a for a in args.extra if a != "--"]
        return cmd_test(extra)
    if args.command == "audit":
        return cmd_audit()
    if args.command == "lint-imports":
        return cmd_lint_imports()
    if args.command == "structure":
        return cmd_structure()
    if args.command == "verify-data":
        return run([sys.executable, str(ROOT / "scripts" / "verify_data_integrity.py")])
    if args.command == "perf":
        return cmd_perf()
    if args.command == "deps":
        return cmd_deps()
    if args.command == "sync-email-only":
        return cmd_sync_email_only()
    if args.command == "verify":
        return cmd_verify()
    return 1


if __name__ == "__main__":
    raise SystemExit(main())