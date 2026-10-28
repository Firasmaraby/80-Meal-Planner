import unittest

import numpy as np

import helpers
from stages.dedupe import dedupe
from stages.names import load_rules

R = load_rules()
PRIO = ["a", "b", "c"]
DB = {"a": "DB A", "b": "DB B", "c": "DB C"}
CFG = {"name_threshold": 0.88, "cosine_min": 0.98, "kcal_rel_tol": 0.10, "kcal_abs_tol": 5.0}

BANANA = dict(kcal=89, protein=1.09, carbs=22.8, fat=0.33, fiber=2.6)


def run(rows):
    foods = helpers.make_foods(rows)
    merged, merges = dedupe(foods, CFG, PRIO, DB, R)
    return merged, merges


def row(source, sid, name, **n):
    return {"source": source, "source_id": sid, "raw_name": name, **n}


class Dedupe(unittest.TestCase):
    def test_true_duplicates_across_sources_merge_and_keep_all_citations(self):
        merged, merges = run([
            row("a", "1", "Bananas, raw", **BANANA),
            row("b", "9", "Banana, raw", **{**BANANA, "kcal": 90}),
            row("c", "X", "Banana, raw", kcal=89, protein=1.1, carbs=23, fat=0.3),
        ])
        self.assertEqual(len(merged), 1)
        food = merged.iloc[0]
        self.assertEqual({(s["db"], s["ref"]) for s in food["src"]}, {("DB A", "1"), ("DB B", "9"), ("DB C", "X")})
        self.assertEqual(food["n_sources"], 3)
        self.assertEqual(len(merges), 1)
        self.assertEqual(merges.iloc[0]["n_members"], 3)

    def test_raw_and_cooked_are_different_foods(self):
        merged, _ = run([
            row("a", "1", "Broccoli, raw", kcal=34, protein=2.8, carbs=6.6, fat=0.4),
            row("b", "2", "Broccoli, raw", kcal=34, protein=2.8, carbs=6.6, fat=0.4),
            row("a", "3", "Broccoli, cooked, boiled, drained, without salt", kcal=35, protein=2.4, carbs=7.2, fat=0.4),
            row("b", "4", "Broccoli, boiled", kcal=35, protein=2.4, carbs=7.2, fat=0.4),
            row("a", "5", "Chicken, breast, roasted", kcal=165, protein=31, carbs=0, fat=3.6),
            row("a", "6", "Chicken, breast, raw", kcal=120, protein=22.5, carbs=0, fat=2.6),
        ])
        names = sorted(merged["name"])
        self.assertEqual(len(merged), 4, names)
        self.assertIn("Broccoli, raw", names)
        self.assertIn("Broccoli, boiled", names)
        self.assertEqual(sorted(merged["n_sources"]), [1, 1, 2, 2])

    def test_identity_tokens_block_merge_even_with_similar_nutrients(self):
        merged, _ = run([
            row("a", "1", "Chicken, breast, with skin, roasted", kcal=197, protein=29.8, carbs=0, fat=7.8),
            row("b", "2", "Chicken, breast, without skin, roasted", kcal=195, protein=29.9, carbs=0, fat=7.5),
        ])
        self.assertEqual(len(merged), 2)

    def test_same_name_different_nutrients_not_merged(self):
        merged, merges = run([
            row("a", "1", "Pasta, cooked", kcal=158, protein=5.8, carbs=30.9, fat=0.9),
            row("b", "2", "Pasta, cooked", kcal=350, protein=12, carbs=70, fat=1.5),
        ])
        # identical canonical key but contradicting nutrient vectors (cooked vs dry mislabelled) must stay apart
        self.assertEqual(len(merged), 2)
        self.assertTrue(merges.empty)

    def test_synonyms_merge_across_sources(self):
        merged, _ = run([
            row("a", "1", "Squash, summer, zucchini, raw", kcal=17, protein=1.2, carbs=3.1, fat=0.3),
            row("a", "2", "Zucchini, raw", kcal=17, protein=1.2, carbs=3.1, fat=0.3, fiber=1.0),
            row("b", "3", "Courgette, raw", kcal=17, protein=1.2, carbs=3.1, fat=0.3, fiber=1.1),
        ])
        self.assertEqual(len(merged), 2)   # "Squash, summer, zucchini" has more words: stays separate
        z = merged[merged["name"].str.contains("ourgette|ucchini") & ~merged["name"].str.contains("Squash")].iloc[0]
        self.assertEqual(z["n_sources"], 2)

    def test_primary_is_most_complete_and_gaps_are_filled(self):
        merged, merges = run([
            row("a", "1", "Kiwifruit, green, raw", kcal=61, protein=1.1, carbs=14.7, fat=0.5),
            row("b", "2", "Kiwifruit, green, raw", kcal=60, protein=1.1, carbs=14.5, fat=0.5, fiber=3.0, vitC=92.7,
                vitK=40.3, potassium=312),
        ])
        food = merged.iloc[0]
        self.assertEqual(food["primary_uid"], "b:2")                  # more non-null nutrients wins
        self.assertEqual(food["src"][0], {"db": "DB B", "ref": "2"})  # primary first
        self.assertEqual(len(food["src"]), 2)                         # but ALL sources are listed

        merged, _ = run([
            row("a", "1", "Kiwifruit, green, raw", kcal=61, protein=1.1, carbs=14.7, fat=0.5, fiber=3.0, vitC=92.7),
            row("b", "2", "Kiwifruit, green, raw", kcal=60, protein=1.1, carbs=14.5, fat=0.5, vitK=40.3),
        ])
        food = merged.iloc[0]
        self.assertEqual(food["primary_uid"], "a:1")
        self.assertEqual(food["vitK"], 40.3)                          # filled from the other record
        self.assertEqual(food["kcal"], 61)                            # primary's value is never overwritten
        self.assertIn("vitK", merges_filled(merged))

    def test_source_priority_breaks_ties(self):
        merged, _ = run([
            row("b", "2", "Banana, raw", **BANANA),
            row("a", "1", "Banana, raw", **BANANA),
        ])
        self.assertEqual(merged.iloc[0]["primary_uid"], "a:1")

    def test_approximate_values_are_not_used_to_fill(self):
        merged, _ = run([
            row("a", "1", "Egg, whole, raw", kcal=143, protein=12.6, carbs=0.7, fat=9.5, fiber=0, iron=1.7, zinc=1.3),
            row("b", "2", "Egg, whole, raw", kcal=143, protein=12.6, carbs=0.7, fat=9.5, vitE=1.2, vitA=100,
                approx_keys="vitE"),
        ])
        food = merged.iloc[0]
        self.assertTrue(np.isnan(food["vitE"]))     # vitE came from an alpha-TE (approximate) column: not unit-safe
        self.assertEqual(food["vitA"], 100)

    def test_within_source_duplicates_merge(self):
        merged, _ = run([
            row("a", "1", "Cheese, cheddar", kcal=403, protein=22.9, carbs=3.1, fat=33.3),
            row("a", "2", "Cheese, cheddar", kcal=403, protein=22.9, carbs=3.1, fat=33.3, calcium=710),
        ])
        self.assertEqual(len(merged), 1)
        self.assertEqual(len(merged.iloc[0]["src"]), 2)
        self.assertEqual(merged.iloc[0]["n_sources"], 1)

    def test_different_categories_never_merge(self):
        merged, _ = run([
            row("a", "1", "Pepper, black", kcal=251, protein=10.4, carbs=64, fat=3.3, source_group="Spices and Herbs"),
            row("b", "2", "Peppers, black, raw", kcal=251, protein=10.4, carbs=64, fat=3.3),
        ])
        self.assertEqual(len(merged), 2)

    def test_every_merge_is_reported(self):
        merged, merges = run([
            row("a", "1", "Banana, raw", **BANANA), row("b", "2", "Banana, raw", **BANANA),
            row("a", "3", "Apple, raw", kcal=52, protein=0.3, carbs=13.8, fat=0.2),
        ])
        self.assertEqual(len(merges), 1)
        self.assertEqual(merges.iloc[0]["primary_uid"], "a:1")
        self.assertIn("b:2", merges.iloc[0]["members"])


def merges_filled(merged):
    return [k for k in ("vitK", "vitC", "fiber") if not np.isnan(merged.iloc[0][k])]


if __name__ == "__main__":
    unittest.main()
