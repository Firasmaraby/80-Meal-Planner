"""End to end: build the SYNTHETIC workbook, run the whole pipeline, validate the output against the Food schema."""
import contextlib
import csv
import io
import json
import unittest
from pathlib import Path

import helpers  # noqa: F401
import make_fixture
import run
import search_check
from stages.export import validate_foods
from stages.schema import NUTRIENT_KEYS


class EndToEnd(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.tmp = helpers.tmpdir()
        root = Path(cls.tmp.name)
        cls.xlsx = make_fixture.main(str(root / "fx"))
        cls.cfg_path = root / "fx" / "sources_synthetic.json"
        cls.queries = root / "fx" / "search_queries_synthetic.json"
        cls.out = root / "out"
        # config paths in the synthetic config are relative to pipeline/fixtures -> point it at the real config dir
        cfg = json.loads(cls.cfg_path.read_text())
        for k in ("name_rules", "curate_rules", "common_foods", "servings_defaults"):
            cfg["settings"][k] = str(helpers.PIPELINE / "config" / Path(cfg["settings"][k]).name)
        cls.cfg_path.write_text(json.dumps(cfg))
        cls.cfg = run.load_config(cls.cfg_path)
        cls.res = run.run_pipeline(str(cls.xlsx), cls.cfg, str(cls.out), verbose=False)
        cls.foods = json.loads((cls.out / "foods.json").read_text())
        cls.by_name = {f["name"]: f for f in cls.foods}

    @classmethod
    def tearDownClass(cls):
        cls.tmp.cleanup()

    # ---- schema
    def test_output_matches_food_schema(self):
        self.assertEqual(validate_foods(self.foods), [])
        ids = [f["id"] for f in self.foods]
        self.assertEqual(len(ids), len(set(ids)))
        for f in self.foods:
            self.assertTrue(f["src"], f["id"])
            self.assertTrue(set(f["n"]) <= set(NUTRIENT_KEYS))
            for v in f["n"].values():
                self.assertGreaterEqual(v, 0)

    def test_files_written(self):
        for name in ("foods.json", "foods_seed.csv", "report.md", "report.csv", "needs_review_names.csv",
                     "needs_review_names.jsonl", "merges.csv", "curate_log.csv", "citations.json", "dropped_values.csv"):
            self.assertTrue((self.out / name).exists(), name)
        with open(self.out / "foods_seed.csv", newline="", encoding="utf-8") as fh:
            rows = list(csv.DictReader(fh))
        self.assertEqual(len(rows), len(self.foods))
        self.assertEqual(list(rows[0]), ["id", "name", "category", "aliases", "tags", "gi", "servings", "nutrients",
                                         "sources", "rare", "rank"])
        json.loads(rows[0]["nutrients"])

    # ---- cleaning behaviour
    def test_junk_is_dropped_with_reasons(self):
        names = " | ".join(self.by_name)
        for junk in ("nfant", "ndustrial", "Sample", "Baby", "mystery blend"):
            self.assertNotIn(junk, names)
        drops = self.res["decisions"]
        reasons = set(drops[drops["action"] == "drop"]["rule"])
        self.assertTrue({"infant_formula", "industrial_ingredient", "lab_sample", "missing_kcal_and_protein",
                         "baby_food"} <= reasons, reasons)

    def test_rare_flags(self):
        rare = {n for n, f in self.by_name.items() if f["rare"]}
        self.assertTrue(any("heart" in n for n in rare))
        self.assertTrue(any("bison" in n.lower() for n in rare))
        self.assertTrue(any("ellogg" in n for n in rare))
        self.assertTrue(any("beluga" in n.lower() for n in rare))
        self.assertFalse(self.by_name["Chicken breast, roasted"]["rare"])

    def test_raw_and_cooked_stay_separate(self):
        self.assertIn("Chicken breast, roasted", self.by_name)
        self.assertIn("Chicken breast, raw", self.by_name)
        self.assertIn("Broccoli, raw", self.by_name)
        self.assertIn("Broccoli, boiled", self.by_name)
        self.assertNotEqual(self.by_name["Broccoli, raw"]["n"]["kcal"] if "kcal" in self.by_name["Broccoli, raw"]["n"] else 0, 0)

    def test_duplicates_merged_and_all_citations_kept(self):
        banana = next(f for n, f in self.by_name.items() if n.lower().startswith("banana"))
        dbs = {s["db"] for s in banana["src"]}
        self.assertEqual(dbs, {"Synthetic US Table (test)", "Synthetic CA Table (test)", "Synthetic UK Table (test)"})
        self.assertEqual(sum(1 for n in self.by_name if n.lower().startswith("banana")), 1)
        cheddar = self.by_name["Cheddar cheese"]
        self.assertEqual(len(cheddar["src"]), 4)               # 3 sources, one of them listing it twice
        self.assertEqual(len({s["db"] for s in cheddar["src"]}), 3)
        shrimp = self.by_name["Shrimp, raw"]                    # prawns (UK) == shrimp (US)
        self.assertEqual(len(shrimp["src"]), 2)
        eggplant = self.by_name["Eggplant, raw"]
        self.assertIn("aubergine", eggplant["aliases"])

    def test_missing_filled_from_other_source_but_never_zero(self):
        banana = next(f for n, f in self.by_name.items() if n.lower().startswith("banana"))
        self.assertIn("vitE", banana["n"])                       # US lacks it, CA has it
        self.assertNotIn("vitK", banana["n"])                    # nobody has it: absent, not 0
        for f in self.foods:
            if f["name"] == "Honey":
                self.assertNotIn("fiber", {k for k, v in f["n"].items() if v is None})

    def test_unit_conversions(self):
        egg = self.by_name["Egg, whole, raw"]
        self.assertAlmostEqual(egg["n"]["vitD"], 82 / 40, places=2)   # primary is the CA record: 82 IU / 40
        uk_yog = self.by_name["Yogurt, plain, whole milk"]
        self.assertAlmostEqual(uk_yog["n"]["vitD"], 1.0, places=2)  # 40 IU / 40
        self.assertAlmostEqual(uk_yog["n"]["kcal"], 61.0, delta=1.0)   # 250 kJ / 4.184 or 61 kcal
        spinach = self.by_name["Spinach, raw"]
        self.assertEqual(spinach["n"]["vitA"], 469)                # RAE column, not the IU one
        crisps = self.by_name["Crisps, potato, plain"]
        self.assertAlmostEqual(crisps["n"]["sodium"], 196.7, places=1)  # 0.5 g NaCl
        self.assertAlmostEqual(crisps["n"]["kcal"], 2200 / 4.184, delta=0.1)   # kJ-only source
        courgette = self.by_name["Courgette, raw"]["n"]
        self.assertNotIn("vitA", courgette)                         # UK gives µg RE only: not convertible -> null
        self.assertEqual(courgette["vitC"], 21)

    def test_implausible_values_dropped_and_reported(self):
        dv = self.res["dropped_values"]
        reasons = set(dv["reason"])
        self.assertTrue({"negative_value", "exceeds_100g_per_100g", "implausible_magnitude"} <= reasons, reasons)
        self.assertFalse(any(f["name"].startswith("Bread, white") and "fiber" in f["n"] for f in self.foods))
        mystery = [f for f in self.foods if "mystery powder" in f["name"].lower()]
        for f in mystery:
            self.assertNotIn("protein", f["n"])

    def test_servings(self):
        banana = next(f for n, f in self.by_name.items() if n.lower().startswith("banana"))
        self.assertTrue(any("medium" in s["label"] for s in banana["servings"]))
        self.assertTrue(all(s["g"] > 0 for s in banana["servings"]))
        self.assertIn("servings", self.by_name["Olive oil, salad or cooking"])   # default: oil -> tbsp

    def test_report_contents(self):
        md = (self.out / "report.md").read_text()
        for section in ("Rows in per source", "Nutrient values dropped", "Foods dropped", "Merged groups",
                        "Foods marked rare", "Final count", "Nutrient coverage", "Sources and citations"):
            self.assertIn(section, md)
        with open(self.out / "report.csv", newline="", encoding="utf-8") as fh:
            sections = {r["section"] for r in csv.DictReader(fh)}
        self.assertTrue({"rows_in_per_source", "dropped_foods_by_reason", "nutrient_coverage", "final_counts",
                         "rare_flagged_by_reason", "merged_groups"} <= sections)
        merges = (self.out / "merges.csv").read_text()
        self.assertIn("Cheddar", merges)
        self.assertEqual(len(json.loads((self.out / "citations.json").read_text())), 3)

    def test_review_export_for_llm(self):
        lines = (self.out / "needs_review_names.jsonl").read_text().strip().splitlines()
        for ln in lines:
            o = json.loads(ln)
            self.assertTrue({"id", "raw_name", "proposed_name", "category"} <= set(o))

    # ---- search + reruns
    def test_search_check_passes(self):
        q = json.loads(self.queries.read_text())
        rate, failures = search_check.run_checks(self.foods, q)
        self.assertEqual(failures, [])
        self.assertEqual(rate, 1.0)

    def test_rerun_is_deterministic(self):
        out2 = Path(self.tmp.name) / "out2"
        run.run_pipeline(str(self.xlsx), self.cfg, str(out2), verbose=False)
        for name in ("foods.json", "foods_seed.csv", "report.csv", "merges.csv"):
            self.assertEqual((self.out / name).read_text(), (out2 / name).read_text(), name)

    def test_cli_main(self):
        out3 = Path(self.tmp.name) / "out3"
        buf = io.StringIO()
        with contextlib.redirect_stdout(buf):
            rc = run.main(["--input", str(self.xlsx), "--config", str(self.cfg_path), "--out", str(out3),
                           "--check-search", str(self.queries)])
        self.assertEqual(rc, 0)
        self.assertIn("pass rate 100%", buf.getvalue())
        only = Path(self.tmp.name) / "out4"
        with contextlib.redirect_stdout(io.StringIO()):
            run.main(["--input", str(self.xlsx), "--config", str(self.cfg_path), "--out", str(only), "--sheets", "FakeUSDA"])
        foods = json.loads((only / "foods.json").read_text())
        self.assertTrue(all(s["db"] == "Synthetic US Table (test)" for f in foods for s in f["src"]))

    def test_inspect_mode(self):
        buf = io.StringIO()
        with contextlib.redirect_stdout(buf):
            rc = run.main(["--input", str(self.xlsx), "--config", str(self.cfg_path), "--inspect"])
        text = buf.getvalue()
        self.assertEqual(rc, 0)
        for token in ("SHEET 'FakeUSDA'", "SHEET 'FakeCNF'", "SHEET 'UK_Values'", "header row guess (0-based): 2",
                      "Energ_Kcal", "suggested nutrient mapping", "configured as source 'fake_us'"):
            self.assertIn(token, text)


if __name__ == "__main__":
    unittest.main()
