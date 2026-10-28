import unittest

import helpers  # noqa: F401
import search_check as sc

FOODS = [
    {"id": "a", "name": "Bananas, raw", "aliases": ["banana"], "rank": 90, "rare": False},
    {"id": "b", "name": "Banana bread", "aliases": [], "rank": 40, "rare": False},
    {"id": "c", "name": "Banana chips, dried", "aliases": [], "rank": 90, "rare": True},
    {"id": "d", "name": "Chicken breast, roasted", "aliases": ["chicken breast", "chicken"], "rank": 83, "rare": False},
    {"id": "e", "name": "Courgette, raw", "aliases": ["zucchini"], "rank": 77, "rare": False},
]


class Search(unittest.TestCase):
    def test_ranking_and_rare_exclusion(self):
        fs = sc.FoodSearch(FOODS)
        names = [h[0]["name"] for h in fs.search("banana")]
        self.assertEqual(names[0], "Bananas, raw")
        self.assertNotIn("Banana chips, dried", names)                 # rare excluded
        self.assertEqual(fs.search("zucchini")[0][0]["id"], "e")      # alias
        self.assertEqual(fs.search("chiken breast")[0][0]["id"], "d")   # one-typo tolerance like the app
        self.assertEqual(fs.search("bana")[0][0]["id"], "a")           # prefix

    def test_run_checks(self):
        rate, fails = sc.run_checks(FOODS, [{"q": "banana", "expect_any": ["banana"]},
                                            {"q": "kiwi", "expect_any": ["kiwi"]}])
        self.assertEqual(rate, 0.5)
        self.assertEqual(fails[0]["q"], "kiwi")

    def test_default_query_file_has_about_100_queries(self):
        import json
        q = json.loads((helpers.PIPELINE / "config" / "search_queries.json").read_text())
        self.assertGreaterEqual(len(q), 100)
        self.assertTrue(all({"q", "expect_any"} <= set(x) and x["expect_any"] for x in q))


if __name__ == "__main__":
    unittest.main()
