import json
import unittest

import helpers
from stages.curate import curate, load_common
from stages.names import load_rules
from stages.schema import NUTRIENT_KEYS

R = load_rules()
CFG = json.loads((helpers.PIPELINE / "config" / "curate_rules.json").read_text())
COMMON = load_common(helpers.PIPELINE / "config" / "common_foods.txt")

FULL = dict(kcal=100, protein=5, carbs=10, fat=2, fiber=1, calcium=10, iron=1, potassium=100, sodium=10, vitC=1, zinc=1)


def prep(rows):
    foods = helpers.make_foods(rows)
    foods["n_sources"] = 1
    foods["members"] = [[u] for u in foods["uid"]]
    return foods


def row(sid, name, grp="", **n):
    return {"source": "s", "source_id": sid, "raw_name": name, "source_group": grp, **{**FULL, **n}}


def decide(rows):
    kept, dec = curate(prep(rows), CFG, COMMON, R)
    return kept, dec.set_index("uid")


class DropRules(unittest.TestCase):
    def check_drop(self, name, reason, grp="", **n):
        kept, dec = decide([row("1", name, grp, **n)])
        self.assertTrue(kept.empty, name)
        self.assertEqual(dec.loc["s:1", "action"], "drop")
        self.assertEqual(dec.loc["s:1", "rule"], reason)

    def test_lab_and_test_samples(self):
        self.check_drop("Sample 12 - lab test", "lab_sample")
        self.check_drop("Test sample, apple", "lab_sample")

    def test_industrial_ingredients(self):
        self.check_drop("Shortening, industrial, soy (partially hydrogenated), pourable", "industrial_ingredient")
        self.check_drop("Cheese, cheddar, for food service", "industrial_ingredient")

    def test_infant_formula_and_baby_foods(self):
        self.check_drop("Infant formula, MEAD JOHNSON, ENFAMIL, ready-to-feed", "infant_formula")
        self.check_drop("Baby food, apples, strained", "baby_food")
        self.check_drop("Apples, junior", "baby_food", grp="Baby Foods")

    def test_missing_kcal_and_protein(self):
        kept, dec = decide([row("1", "Spices, mystery blend", kcal=float("nan"), protein=float("nan"))])
        self.assertTrue(kept.empty)
        self.assertEqual(dec.loc["s:1", "rule"], "missing_kcal_and_protein")

    def test_only_one_of_kcal_protein_missing_is_kept(self):
        kept, _ = decide([row("1", "Water, tap", protein=float("nan")), row("2", "Egg, raw", kcal=float("nan"))])
        self.assertEqual(len(kept), 2)

    def test_normal_foods_survive(self):
        kept, dec = decide([row("1", "Banana, raw"), row("2", "Chicken, breast, roasted")])
        self.assertEqual(len(kept), 2)
        self.assertEqual(set(dec["action"]), {"keep"})


class RareRules(unittest.TestCase):
    def rare(self, name, grp="", **n):
        kept, dec = decide([row("1", name, grp, **n)])
        return bool(kept["rare"].iloc[0]), dec.loc["s:1", "rule"]

    def test_game_meat(self):
        r, why = self.rare("Game meat, venison, raw")
        self.assertTrue(r)
        self.assertIn("game_meat", why)

    def test_organs_beyond_liver(self):
        self.assertTrue(self.rare("Beef, variety meats and by-products, heart, raw")[0])
        self.assertTrue(self.rare("Pork, tongue, raw")[0])
        self.assertFalse(self.rare("Beef, liver, raw")[0])           # liver stays visible
        self.assertFalse(self.rare("Chicken, liver, raw")[0])
        self.assertFalse(self.rare("Beans, kidney, raw")[0])         # category guard: kidney beans are fine

    def test_branded(self):
        r, why = self.rare("CEREALS RTE, KELLOGG'S, RICE KRISPIES")
        self.assertTrue(r)
        self.assertIn("branded", why)
        self.assertTrue(self.rare("Snacks, ORIGINAL CHIPS™")[0])

    def test_regional_ethnic_with_low_commonness(self):
        self.assertTrue(self.rare("Whale, beluga, meat, dried (Alaska Native)")[0])

    def test_sparse_data(self):
        r, why = self.rare("Mystery paste", kcal=10, protein=1, carbs=None, fat=None, fiber=None, calcium=None, iron=None,
                           potassium=None, sodium=None, vitC=None, zinc=None)
        self.assertTrue(r)
        self.assertIn("sparse_data", why)

    def test_rare_rank_is_capped(self):
        kept, _ = decide([row("1", "Game meat, venison, raw")])
        self.assertLessEqual(kept["rank"].iloc[0], CFG["rank"]["rare_cap"])


class Rank(unittest.TestCase):
    def test_everyday_beats_obscure(self):
        kept, _ = decide([
            row("1", "Banana, raw"),
            row("2", "Bananas, dehydrated, or banana powder"),
            row("3", "Rice, white, long-grain, regular, enriched, cooked"),
            row("4", "Sorghum syrup, light, canned in heavy liquid with added flavor"),
        ])
        r = dict(zip(kept["raw_name"], kept["rank"]))
        self.assertTrue(0 <= min(r.values()) and max(r.values()) <= 100)
        self.assertGreater(r["Banana, raw"], r["Bananas, dehydrated, or banana powder"])
        self.assertGreater(r["Banana, raw"], r["Sorghum syrup, light, canned in heavy liquid with added flavor"])

    def test_more_sources_rank_higher(self):
        foods = prep([row("1", "Apple, raw"), row("2", "Quince, raw")])
        foods["n_sources"] = [3, 1]
        kept, _ = curate(foods, CFG, [], R)       # no common list: isolates the source-count effect
        r = dict(zip(kept["raw_name"], kept["rank"]))
        self.assertGreater(r["Apple, raw"], r["Quince, raw"])

    def test_common_list_has_hundreds_of_foods_and_synonyms_fold(self):
        self.assertGreaterEqual(len(COMMON), 300)
        kept, _ = decide([row("1", "Courgette, raw"), row("2", "Salsify, raw")])
        r = dict(zip(kept["raw_name"], kept["rank"]))
        self.assertGreater(r["Courgette, raw"], r["Salsify, raw"])     # 'zucchini' is in the list, 'courgette' folds to it

    def test_every_decision_is_logged_with_rank_parts(self):
        rows = [row("1", "Banana, raw"), row("2", "Infant formula, x"), row("3", "Game meat, bison, raw")]
        kept, dec = decide(rows)
        self.assertEqual(len(dec), 3)
        self.assertEqual(set(dec["action"]), {"keep", "drop", "rare"})
        parts = json.loads(dec.loc["s:1", "rank_parts"])
        self.assertIn("common", parts)


if __name__ == "__main__":
    unittest.main()
