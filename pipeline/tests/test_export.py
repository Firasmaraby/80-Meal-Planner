import copy
import csv
import io
import json
import unittest

import pandas as pd

import helpers  # noqa: F401
from stages.export import build_foods, make_ids, pg_array, seed_frame, validate_foods, coverage
from stages.schema import NUTRIENT_KEYS


def sample_df():
    rec = {k: float("nan") for k in NUTRIENT_KEYS}
    rec.update(kcal=89.0, protein=1.09, vitC=8.7)
    return pd.DataFrame([{
        "name": "Bananas, raw", "category": "fruit", "aliases": ["banana", 'say "hi"'], "tags": [],
        "servings": [{"label": "1 medium", "g": 118.0}], "src": [{"db": "DB A", "ref": "09040"}],
        "rare": False, "rank": 90, "food_id": "bananas-raw-abc123", "primary_uid": "a:09040", **rec}])


class Schema(unittest.TestCase):
    def good(self):
        return build_foods(sample_df())

    def test_valid_object(self):
        foods = self.good()
        self.assertEqual(validate_foods(foods), [])
        f = foods[0]
        self.assertEqual(set(f), {"id", "name", "category", "aliases", "gi", "servings", "n", "src", "rare", "rank"})
        self.assertEqual(f["n"], {"kcal": 89.0, "protein": 1.09, "vitC": 8.7})     # missing nutrients are omitted, not 0
        self.assertIsNone(f["gi"])

    def test_violations_are_caught(self):
        base = self.good()[0]

        def bad(**changes):
            f = copy.deepcopy(base)
            for k, v in changes.items():
                if v is KeyError:
                    f.pop(k)
                else:
                    f[k] = v
            return validate_foods([f])

        self.assertTrue(bad(extra_key=1))
        self.assertTrue(bad(category="snacks"))
        self.assertTrue(bad(n={"kcal": 1, "kaloriez": 2}))
        self.assertTrue(bad(n={"kcal": float("nan")}))
        self.assertTrue(bad(n={"kcal": -1}))
        self.assertTrue(bad(src=[]))
        self.assertTrue(bad(src=[{"db": "x"}]))
        self.assertTrue(bad(src=[{"db": "x", "ref": "1", "citation": "extra"}]))
        self.assertTrue(bad(id="Not A Slug"))
        self.assertTrue(bad(tags=["tasty"]))
        self.assertTrue(bad(rank=101))
        self.assertTrue(bad(rare="no"))
        self.assertTrue(bad(servings=[{"label": "x", "g": 0}]))
        self.assertTrue(bad(name=KeyError))
        self.assertTrue(bad(name=""))
        self.assertEqual(bad(), [])

    def test_duplicate_ids_are_caught(self):
        f = self.good()[0]
        self.assertTrue(validate_foods([f, copy.deepcopy(f)]))


class Ids(unittest.TestCase):
    def test_stable_unique_slugs(self):
        names = ["Bananas, raw", "Bananas, raw", "Kiwifruit, green, raw"]
        uids = ["a:1", "b:2", "a:3"]
        ids = make_ids(names, uids)
        self.assertEqual(ids, make_ids(names, uids))                 # stable across runs
        self.assertEqual(len(set(ids)), 3)                           # same name, different primary -> still unique
        for i in ids:
            self.assertRegex(i, r"^[a-z0-9]+(-[a-z0-9]+)*$")
        self.assertTrue(ids[0].startswith("bananas-raw-"))
        self.assertEqual(len(set(make_ids(["x", "x"], ["a:1", "a:1"]))), 2)   # never emits a duplicate


class SeedCsv(unittest.TestCase):
    def test_postgres_array_literals(self):
        self.assertEqual(pg_array([]), "{}")
        self.assertEqual(pg_array(None), "{}")
        self.assertEqual(pg_array(["a", "b c"]), '{"a","b c"}')
        self.assertEqual(pg_array(['say "hi"', "back\\slash", "comma,here"]), '{"say \\"hi\\"","back\\\\slash","comma,here"}')

    def test_columns_and_jsonb_strings(self):
        foods = build_foods(sample_df())
        df = seed_frame(foods)
        self.assertEqual(list(df.columns), ["id", "name", "category", "aliases", "tags", "gi", "servings", "nutrients",
                                            "sources", "rare", "rank"])
        buf = io.StringIO()
        df.to_csv(buf, index=False)
        row = next(csv.DictReader(io.StringIO(buf.getvalue())))        # survives a real CSV round trip
        self.assertEqual(row["aliases"], '{"banana","say \\"hi\\""}')
        self.assertEqual(row["tags"], "{}")
        self.assertEqual(row["gi"], "")
        self.assertEqual(json.loads(row["nutrients"]), {"kcal": 89.0, "protein": 1.09, "vitC": 8.7})
        self.assertEqual(json.loads(row["sources"]), [{"db": "DB A", "ref": "09040"}])
        self.assertEqual(json.loads(row["servings"]), [{"label": "1 medium", "g": 118.0}])
        self.assertEqual(row["rare"], "false")
        self.assertEqual(row["rank"], "90")


class Coverage(unittest.TestCase):
    def test_coverage_pct(self):
        foods = build_foods(sample_df())
        cov = coverage(foods).set_index("nutrient")
        self.assertEqual(cov.loc["kcal", "coverage_pct"], 100.0)
        self.assertEqual(cov.loc["iron", "coverage_pct"], 0.0)
        self.assertEqual(len(cov), len(NUTRIENT_KEYS))


if __name__ == "__main__":
    unittest.main()
