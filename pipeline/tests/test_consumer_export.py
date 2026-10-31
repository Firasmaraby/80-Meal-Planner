"""consumer.export_app: ids, compact bundle round trip, validation, seed CSV, review/notes files, servings, legacy map."""
import csv
import json
import tempfile
import unittest
from pathlib import Path

import helpers  # noqa: F401
import search_check as SC
from consumer import adapter as A, export_app as X, legacy as L, names_en as N
from test_consumer_tiers import rec

LEX = N.Lexicon(N.load_heads())


def prepared(name, cid, **kw):
    r = rec(name, cid=cid, **kw)
    r.update({"tier": "everyday", "rank": 80, "score": 60.0, "estimated": ["la"], "notes": ["la: estimated as pufa - (ala+epa+dha)"],
              "servings": [{"label": "1 medium", "g": 182}], "servings_from": "common_list", "aliases_out": ["apples"], "why": "common_head",
              "src": [["USDA FoodData Central (SR Legacy)", "09003"], ["Canadian Nutrient File, Health Canada, 2026", "2"]]})
    return r


class Export(unittest.TestCase):
    def setUp(self):
        self.recs = [prepared("Apples, raw, with skin", "cf_1", group="fruits"), prepared("Kale, raw", "cf_2", n_extra={"vitA": 241.123456})]
        X.make_ids(self.recs)

    def test_ids_are_slugs_stable_and_unique(self):
        ids = [r["id"] for r in self.recs]
        self.assertTrue(all(i.startswith(("apple-raw-with-skin-", "kale-raw-")) for i in ids))
        again = [dict(r) for r in self.recs]
        X.make_ids(again)
        self.assertEqual(ids, [r["id"] for r in again])
        dup = [prepared("Kale, raw", "cf_2"), prepared("Kale, raw", "cf_2")]
        X.make_ids(dup)
        self.assertNotEqual(dup[0]["id"], dup[1]["id"])

    def test_values_are_4_significant_figures_and_missing_is_null(self):
        b = X.build_bundle(self.recs)
        kale = next(r for r in b["foods"] if r[1] == "Kale, raw")
        vals = dict(zip(b["keys"], kale[11]))
        self.assertEqual(vals["vitA"], 241.1)
        self.assertIsNone(vals["b12"])
        self.assertEqual(vals["kcal"], 40)

    def test_round_trip_through_json_and_decoder(self):
        b = X.build_bundle(self.recs)
        self.assertEqual(X.validate_bundle(b), [])
        back = json.loads(json.dumps(b, ensure_ascii=False, separators=(",", ":")))
        foods = SC.decode_bundle(back, "everyday")
        self.assertEqual(len(foods), 2)
        apple = next(f for f in foods if f["name"].startswith("Apple"))
        self.assertEqual((apple["head"], apple["form"], apple["category"]), ("apple", "raw", "fruit"))
        self.assertEqual(b["keys"], A.NUTRIENT_KEYS)
        row = next(r for r in b["foods"] if r[1].startswith("Apple"))
        self.assertEqual(row[9], [[0, "09003"], [1, "2"]])                       # db index + ref
        self.assertEqual(b["dbs"], ["USDA FoodData Central (SR Legacy)", "Canadian Nutrient File, Health Canada, 2026"])
        self.assertEqual(row[10], ["la"])
        self.assertEqual(row[8], [["1 medium", 182]])

    def test_validation_catches_problems(self):
        b = X.build_bundle(self.recs)
        b["foods"][0][11][0] = -1
        b["foods"][1][9] = []
        b["foods"][1][2] = "nonsense"
        errs = X.validate_bundle(b)
        self.assertTrue(any("negative" in e for e in errs))
        self.assertTrue(any("empty src" in e for e in errs))
        self.assertTrue(any("bad category" in e for e in errs))

    def test_seed_csv_has_the_foods_table_columns(self):
        for r in self.recs:
            r["gi"] = None
        with tempfile.TemporaryDirectory() as d:
            p = Path(d) / "seed.csv"
            X.write_seed(p, self.recs)
            with p.open(encoding="utf-8") as fh:
                rows = list(csv.DictReader(fh))
        self.assertEqual(list(rows[0]), ["id", "name", "category", "aliases", "tags", "gi", "servings", "nutrients", "sources", "rare", "rank"])
        n = json.loads(rows[0]["nutrients"])
        self.assertNotIn("b12", n)                                              # missing never becomes 0
        self.assertEqual(json.loads(rows[0]["sources"])[0], {"db": "USDA FoodData Central (SR Legacy)", "ref": "09003"})
        self.assertEqual(rows[0]["rare"], "false")

    def test_review_notes_and_log_files(self):
        with tempfile.TemporaryDirectory() as d:
            X.write_review(Path(d) / "r.csv", self.recs)
            X.write_notes(Path(d) / "n.csv", self.recs)
            with (Path(d) / "r.csv").open(encoding="utf-8") as f1, (Path(d) / "n.csv").open(encoding="utf-8") as f2:
                rows = list(csv.DictReader(f1))
                notes = list(csv.DictReader(f2))
        self.assertEqual(list(rows[0])[:8], ["id", "display_name", "head", "form", "category", "rank", "original_name", "source"])
        self.assertIn("la: estimated", notes[0]["notes"])

    def test_servings_priority_legacy_then_list_then_category_default(self):
        cfg = json.loads((helpers.PIPELINE / "config" / "servings_defaults.json").read_text(encoding="utf-8"))
        hs = X.head_servings(LEX.entries)
        apple = rec("Apples, raw", cid="s1", group="fruits")
        s, why = X.pick_servings(apple, hs, cfg, None)
        self.assertEqual((why, s[0]["g"]), ("common_list", 182))
        s, why = X.pick_servings(apple, hs, cfg, {"servings": [{"label": "1 big", "g": 250}]})
        self.assertEqual((why, s[0]["label"]), ("legacy", "1 big"))
        none = rec("Obscure tuber, raw", cid="s2")
        self.assertEqual(X.pick_servings(none, hs, cfg, None), ([], ""))


class Legacy(unittest.TestCase):
    def test_match_requires_kcal_within_15_percent(self):
        old = {"id": "banana-raw", "name": "Banana, raw", "category": "fruit", "n": {"kcal": 89}, "aliases": ["banana"]}
        good = rec("Bananas, raw", cid="l1", group="fruits", kcal=89.0)
        bad = rec("Bananas, raw, ripe", cid="l2", group="fruits", kcal=130.0)
        for r in (good, bad):
            r.update({"score": 50.0, "hidden_reason": None})
        m, info = L.best_match(old, [good, bad], LEX)
        self.assertEqual(m["canonical_id"], "l1")
        self.assertTrue(info["within_15pct"])
        m, info = L.best_match(old, [bad], LEX)
        self.assertIsNone(m)

    def test_kept_sample_food_cites_the_foodpipe_database_name_and_says_so(self):
        old = {"id": "x", "name": "Collard greens, raw", "category": "vegetable", "n": {"kcal": 32}, "aliases": [],
               "src": [{"db": "USDA FDC SR Legacy", "ref": "11161"}]}
        r = L.legacy_record(old, LEX)
        self.assertEqual(r["src"], [["USDA FoodData Central (SR Legacy)", "11161"]])
        self.assertTrue(r["notes"][0].startswith("not from the cited DB"))
        self.assertEqual(r["id"], "x")


if __name__ == "__main__":
    unittest.main()
