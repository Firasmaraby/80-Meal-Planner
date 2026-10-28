"""The prefilled USDA SR Legacy and CNF mappings must at least work against files shaped like their published layouts
(column names are guesses until the real workbook arrives - this guards the machinery and the unit handling)."""
import json
import unittest
from pathlib import Path

import pandas as pd

import helpers
import run
from stages.ingest import ingest_frames
from stages.normalize import normalize
from stages.report import Log


def sr_frame():
    return pd.DataFrame({
        "NDB_No": ["01009", "09003"],
        "Shrt_Desc": ["CHEESE,CHEDDAR", "APPLES,RAW,WITH SKIN"],
        "Energ_Kcal": [403, 52], "Protein_(g)": [22.87, 0.26], "Lipid_Tot_(g)": [33.31, 0.17], "Carbohydrt_(g)": [3.09, 13.81],
        "Fiber_TD_(g)": [0, 2.4], "Calcium_(mg)": [710, 6], "Vit_C_(mg)": [0, 4.6],
        "Folate_DFE_(µg)": [None, None], "Food_Folate_(µg)": [27, 3], "Folic_Acid_(µg)": [0, 0],
        "Vit_A_RAE": [330, 3], "Vit_A_IU": [1200, 54], "Vit_D_µg": [0.6, 0], "Vit_D_IU": [24, 0],
        "GmWt_1": [132, 182], "GmWt_Desc1": ["1 cup, diced", "1 medium (3\" dia)"], "GmWt_2": [28.35, None],
        "GmWt_Desc2": ["1 oz", None],
    }, dtype=object)


def cnf_frames():
    return {
        ("NUTRIENT AMOUNT", 0): pd.DataFrame({"FoodID": [1, 1, 1, 1, 1], "NutrientID": [10, 11, 12, 13, 14],
                                              "NutrientValue": [1686, 22.9, 710, 330, 2.1]}, dtype=object),
        ("NUTRIENT NAME", 0): pd.DataFrame({"NutrientID": [10, 11, 12, 13, 14], "NutrientCode": [268, 203, 301, 320, 324],
                                            "NutrientName": ["ENERGY (KILOJOULES)", "PROTEIN", "CALCIUM", "RETINOL ACTIVITY EQUIVALENTS", "VITAMIN D (IU)"],
                                            "NutrientUnit": ["kJ", "g", "mg", "mcg", "IU"]}, dtype=object),
        ("FOOD NAME", 0): pd.DataFrame({"FoodID": [1], "FoodDescription": ["Cheese, cheddar"], "FoodGroupID": [1]}, dtype=object),
        ("FOOD GROUP", 0): pd.DataFrame({"FoodGroupID": [1], "FoodGroupName": ["Dairy and Egg Products"]}, dtype=object),
        ("CONVERSION FACTOR", 0): pd.DataFrame({"FoodID": [1], "MeasureID": [5], "ConversionFactorValue": [0.28]}, dtype=object),
        ("MEASURE NAME", 0): pd.DataFrame({"MeasureID": [5], "MeasureDescription": ["1 oz"]}, dtype=object),
    }


class Prefilled(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.cfg = run.load_config()

    def test_config_is_marked_todo(self):
        for s in self.cfg["sources"]:
            self.assertIn("TODO verify", s["status"])
            self.assertTrue(s["citation"])

    def test_sr_legacy_mapping(self):
        log = Log()
        res = ingest_frames({("SR Legacy", 0): sr_frame()}, self.cfg, log, only=["usda_sr_legacy"])
        self.assertEqual(list(res.items["source_id"]), ["01009", "09003"])
        self.assertTrue(res.items["abbreviated"].all())            # upper-case Shrt_Desc detected
        long, dropped = normalize(res.long, log)
        cheddar = long[long.uid == "usda_sr_legacy:01009"].set_index("nutrient")["value"]
        self.assertEqual(cheddar["kcal"], 403)
        self.assertEqual(cheddar["vitA"], 330)                      # RAE column; the IU column is not convertible
        self.assertAlmostEqual(cheddar["vitD"], 0.6)
        self.assertAlmostEqual(cheddar["folate"], 27)               # food folate + 1.7 * 0
        self.assertEqual(len(res.portions), 3)
        self.assertEqual(sorted(res.portions["label"]), ["1 cup, diced", "1 medium (3\" dia)", "1 oz"])

    def test_cnf_mapping(self):
        log = Log()
        res = ingest_frames(cnf_frames(), self.cfg, log, only=["cnf"])
        self.assertEqual(res.items["raw_name"].tolist(), ["Cheese, cheddar"])
        self.assertEqual(res.items["source_group"].tolist(), ["Dairy and Egg Products"])
        long, dropped = normalize(res.long, log)
        v = long.set_index("nutrient")["value"]
        self.assertAlmostEqual(v["kcal"], 1686 / 4.184, places=2)
        self.assertEqual(v["protein"], 22.9)
        self.assertEqual(v["vitA"], 330)
        self.assertAlmostEqual(v["vitD"], 2.1 / 40)
        self.assertEqual(res.portions["grams"].tolist(), [28.0])
        self.assertEqual(res.portions["label"].tolist(), ["1 oz"])
        self.assertTrue(dropped.empty)

    def test_cli_help_and_missing_sheets_are_reported_not_fatal(self):
        with helpers.tmpdir() as d:
            res = run.run_pipeline(None, self.cfg, str(Path(d) / "o"), frames={}, verbose=False)
        self.assertEqual(res["foods"], [])
        self.assertIn("sheet_not_found", [e["reason"] for e in res["log"].events])


if __name__ == "__main__":
    unittest.main()
