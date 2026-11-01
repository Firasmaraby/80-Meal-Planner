"""consumer.gi + pipeline/config/gi_values.json: table values, analogues, category defaults, thresholds, legacy fallback, and the
glycaemic index in the built bundle (row index 12; index 13 = 1 when estimated)."""
import json
import unittest
from pathlib import Path

import helpers  # noqa: F401
from consumer import gi as G

CFG = Path(helpers.REPO_ROOT) / "pipeline" / "config" / "gi_values.json"
BUNDLE = Path(helpers.REPO_ROOT) / "src" / "data" / "foods.everyday.json"
TABLE = G.load_table(CFG)


def food(name, head, category, carbs, fiber=0.0, form="cooked"):
    return {"name": name, "raw_name": name, "head": head, "category": category, "form": form, "n": {"carbs": carbs, "fiber": fiber}}


def pick(r, legacy=None):
    return G.pick_gi(r, TABLE, legacy)


class TableValues(unittest.TestCase):
    def test_rice(self):
        self.assertEqual(pick(food("Rice, white, long-grain, cooked", "rice", "grain", 28.2, 0.4))[0], 73)
        self.assertEqual(pick(food("Brown rice, long-grain, cooked", "brown rice", "grain", 25.6, 1.6))[0], 68)
        self.assertEqual(pick(food("Basmati rice, white, boiled", "basmati rice", "grain", 25.2))[0], 58)
        self.assertEqual(pick(food("Rice, white, long-grain, pre-cooked or instant, prepared", "rice", "grain", 26.5, 0.3))[0], 87)

    def test_grains_pasta_bread_potato_legumes_fruit(self):
        cases = [
            (food("Pasta, cooked", "pasta", "grain", 31, 1.8), 49),
            (food("Whole wheat pasta, boiled", "whole wheat pasta", "grain", 30, 4), 48),
            (food("Soba noodles, boiled", "soba noodles", "grain", 21.5), 46),
            (food("White bread", "white bread", "grain", 49, 2.7, "product"), 75),
            (food("Sourdough bread", "sourdough bread", "grain", 47, 2, "product"), 54),
            (food("Potato, baked, flesh and skin", "potato", "vegetable", 21, 1.6), 111),
            (food("Potato, boiled", "potato", "vegetable", 20, 1.8), 78),
            (food("Lentils, boiled", "lentils", "legume", 20, 7.9), 32),
            (food("Chickpeas, boiled", "chickpeas", "legume", 27, 7.6), 28),
            (food("Apple, raw", "apple", "fruit", 14, 2.4, "raw"), 36),
            (food("Honey", "honey", "sweet", 82.4, 0.2, "product"), 61),
        ]
        for r, expected in cases:
            self.assertEqual(pick(r), (expected, pick(r)[1], False), r["name"])

    def test_every_table_mapping_has_a_source_entry_and_a_sane_value(self):
        for m in json.loads(CFG.read_text(encoding="utf-8"))["mappings"]:
            if m.get("skip"):
                continue
            self.assertTrue(m["src"], m)
            self.assertTrue(0 <= m["gi"] <= 120, m)

    def test_source_is_recorded(self):
        gi, src, est = pick(food("Rice, white, long-grain, cooked", "rice", "grain", 28.2, 0.4))
        self.assertIn("IGT 2008", src)
        self.assertFalse(est)

    def test_first_mapping_wins_name_pattern_before_general(self):
        # 'canned' chickpeas have their own entry, plain chickpeas the boiled one
        self.assertEqual(pick(food("Chickpeas, canned, drained", "chickpeas", "legume", 20, 5, "canned"))[0], 38)


class Defaults(unittest.TestCase):
    def test_category_defaults_are_estimated(self):
        for name, head, cat, expected in [("Zork grain porridge", "zork", "grain", 65), ("Zork berry", "zork", "fruit", 45),
                                          ("Zork bean", "zork", "legume", 32), ("Zork curd", "zork", "dairy", 35),
                                          ("Zork candy", "zork", "sweet", 65), ("Zork stew", "zork", "prepared", 55),
                                          ("Zork drink", "zork", "beverage", 50)]:
            gi, src, est = pick(food(name, head, cat, 20))
            self.assertEqual((gi, est), (expected, True), name)
            self.assertTrue(src.startswith("default"))

    def test_starchy_vegetable_default_only_for_starchy_heads(self):
        self.assertEqual(pick(food("Breadfruit, raw", "breadfruit", "vegetable", 25, 4.9, "raw"))[:1], (70,))
        self.assertTrue(pick(food("Breadfruit, raw", "breadfruit", "vegetable", 25, 4.9, "raw"))[2])
        self.assertEqual(pick(food("Kohlrabi, boiled", "kohlrabi", "vegetable", 10, 2))[0], 40)      # non-starchy vegetable extension

    def test_thresholds(self):
        self.assertIsNone(pick(food("Zork leaf", "zork", "vegetable", 4.0, 1.5, "raw"))[0])           # 2.5 g available: no estimate
        self.assertIsNone(pick(food("Zork meat", "zork", "meat", 0, 0))[0])
        self.assertIsNone(pick(food("Zork", "zork", "grain", None))[0])
        # 4.9 g available is below the 5 g default threshold, but a table mapping applies from 2 g
        self.assertEqual(pick(food("Milk, whole", "milk", "dairy", 4.8, 0, "product"))[0], 39)
        self.assertEqual(G.available_carbs({"carbs": 20, "fiber": 25}), 0.0)

    def test_not_applicable_foods_get_none(self):
        self.assertEqual(pick(food("Cinnamon, ground", "cinnamon", "condiment", 80.6, 53.1, "product")), (None, "", False))

    def test_legacy_value_is_a_fallback_after_the_table(self):
        r = food("Zork grain", "zork", "grain", 20)
        self.assertEqual(pick(r, 42), (42, "legacy sample food", False))
        self.assertEqual(pick(food("Lentils, boiled", "lentils", "legume", 20, 7.9), 31)[0], 32)    # table wins


@unittest.skipUnless(BUNDLE.exists(), "bundles not built")
class BuiltBundle(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        b = json.loads(BUNDLE.read_text(encoding="utf-8"))
        cls.keys, cls.rows = b["keys"], b["foods"]

    def avail(self, r):
        v = dict(zip(self.keys, r[11]))
        return None if v["carbs"] is None else max(0.0, v["carbs"] - (v["fiber"] or 0))

    def test_gi_lands_at_index_12_and_is_sane(self):
        with_gi = [r for r in self.rows if len(r) > 12]
        self.assertGreater(len(with_gi), 1300)
        for r in with_gi:
            self.assertTrue(0 <= r[12] <= 120, r[1])
            if len(r) > 13:
                self.assertEqual(r[13], 1)

    def test_starchy_everyday_foods_have_a_gi(self):
        starch = [r for r in self.rows if r[2] in {"grain", "fruit", "legume", "sweet", "dairy"} and (self.avail(r) or 0) >= 5]
        missing = [r[1] for r in starch if len(r) <= 12]
        self.assertLess(len(missing), 0.08 * len(starch), missing[:15])

    def test_known_foods(self):
        by_name = {r[1]: r for r in self.rows}
        self.assertEqual(by_name["Rice, white, long-grain, cooked"][12], 73)
        self.assertEqual(by_name["Lentils, boiled"][12], 32)
        self.assertFalse(len(by_name["Rice, white, long-grain, cooked"]) > 13)           # a table value is not marked estimated


if __name__ == "__main__":
    unittest.main()
