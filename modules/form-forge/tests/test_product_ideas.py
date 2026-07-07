from __future__ import annotations

import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

from review_portal.product_ideas import ProductIdeasError, add_idea, list_ideas, load_ideas


class ProductIdeasTests(unittest.TestCase):
    def setUp(self) -> None:
        self.temp_dir = tempfile.TemporaryDirectory()
        self.ideas_path = Path(self.temp_dir.name) / "product-ideas.json"
        self.patch = patch("review_portal.product_ideas.IDEAS_PATH", self.ideas_path)
        self.patch.start()

    def tearDown(self) -> None:
        self.patch.stop()
        self.temp_dir.cleanup()

    def test_load_seeds_default_ideas(self) -> None:
        data = load_ideas()
        self.assertEqual(len(data["ideas"]), 2)
        self.assertTrue(self.ideas_path.exists())

    def test_add_idea(self) -> None:
        load_ideas()
        idea = add_idea("Add onboarding walkthrough videos")
        self.assertIn("onboarding", idea["text"])
        items = list_ideas()
        self.assertEqual(items[0]["text"], idea["text"])

    def test_empty_idea_raises(self) -> None:
        load_ideas()
        with self.assertRaises(ProductIdeasError):
            add_idea("   ")


if __name__ == "__main__":
    unittest.main()