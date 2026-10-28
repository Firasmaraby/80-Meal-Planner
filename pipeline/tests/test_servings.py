import unittest

import pandas as pd

import helpers  # noqa: F401
from stages.servings import attach_servings

DEFAULTS = {"rules": [
    {"id": "apple", "categories": ["fruit"], "name_pattern": "^apples?(,|$)", "states": ["raw", ""],
     "servings": [{"label": "1 medium", "g": 182}]},
    {"id": "oil", "categories": ["oil_fat"], "name_pattern": "oil", "servings": [{"label": "1 tbsp", "g": 14}]},
]}


def foods(rows):
    return pd.DataFrame(rows)


class Servings(unittest.TestCase):
    def test_source_portions_win_and_are_cleaned(self):
        portions = pd.DataFrame({
            "source": ["a", "a", "a", "b", "a"], "source_id": ["1", "1", "1", "2", "1"],
            "label": ["1 cup", "1 cup", "quantity not specified", "1 medium", "1 slice"],
            "grams": [100.0, 100.0, 50.0, 118.0, -5.0], "seq": [1, 2, 3, 1, 4]})
        f = foods([{"members": ["a:1", "b:2"], "category": "fruit", "name": "Apples, raw", "state": "raw"}])
        out = attach_servings(f, portions, DEFAULTS)
        self.assertEqual(out["servings"].iloc[0], [{"label": "1 cup", "g": 100.0}, {"label": "1 medium", "g": 118.0}])
        self.assertEqual(out["servings_from"].iloc[0], "source")

    def test_default_by_category_only_when_known(self):
        f = foods([
            {"members": ["a:1"], "category": "fruit", "name": "Apples, raw", "state": "raw"},
            {"members": ["a:2"], "category": "fruit", "name": "Quince, raw", "state": "raw"},          # unknown unit weight
            {"members": ["a:3"], "category": "fruit", "name": "Apples, dried", "state": "dried"},      # state mismatch
            {"members": ["a:4"], "category": "oil_fat", "name": "Olive oil", "state": ""},
        ])
        out = attach_servings(f, pd.DataFrame(columns=["source", "source_id", "label", "grams", "seq"]), DEFAULTS)
        self.assertEqual(out["servings"].iloc[0], [{"label": "1 medium", "g": 182}])
        self.assertEqual(out["servings"].iloc[1], [])
        self.assertEqual(out["servings"].iloc[2], [])
        self.assertEqual(out["servings"].iloc[3][0]["label"], "1 tbsp")
        self.assertEqual(list(out["servings_from"]), ["default", "", "", "default"])

    def test_max_per_food(self):
        portions = pd.DataFrame({"source": "a", "source_id": "1", "label": [f"{i} cup" for i in range(1, 10)],
                                 "grams": [float(i * 10) for i in range(1, 10)], "seq": list(range(9))})
        f = foods([{"members": ["a:1"], "category": "fruit", "name": "X", "state": ""}])
        out = attach_servings(f, portions, DEFAULTS, max_per_food=3)
        self.assertEqual(len(out["servings"].iloc[0]), 3)


if __name__ == "__main__":
    unittest.main()
