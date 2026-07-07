"""Pytest-collected E2E check for Request PDFs page (requires Playwright)."""
from __future__ import annotations

import importlib.util
import subprocess
import sys
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
PLAYWRIGHT_AVAILABLE = importlib.util.find_spec("playwright") is not None


@unittest.skipUnless(PLAYWRIGHT_AVAILABLE, "playwright not installed")
class RequestPdfsE2ETests(unittest.TestCase):
    def test_request_pdfs_page_script_passes(self) -> None:
        script = ROOT / "scripts" / "check_request_pdfs_page.py"
        result = subprocess.run(
            [sys.executable, str(script)],
            cwd=ROOT,
            capture_output=True,
            text=True,
            timeout=120,
            check=False,
        )
        self.assertEqual(
            result.returncode,
            0,
            msg=f"stdout:\n{result.stdout}\nstderr:\n{result.stderr}",
        )
        self.assertIn("PASS", result.stdout)


if __name__ == "__main__":
    unittest.main()