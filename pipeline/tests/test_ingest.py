import math
import unittest

import pandas as pd

import helpers  # noqa: F401
from stages.ingest import ingest_frames, make_label, norm_col, parse_series, parse_value, resolve_column
from stages.report import Log


class ParseValues(unittest.TestCase):
    def test_numbers_and_markers(self):
        self.assertEqual(parse_value(3)[0], 3.0)
        self.assertEqual(parse_value("1,5")[0], 1.5)               # decimal comma
        self.assertEqual(parse_value("1,234.5")[0], 1234.5)
        self.assertEqual(parse_value("[0.5]")[0], 0.5)             # estimated value in brackets
        for marker in ("Tr", "N", "-", "", "nd", None, float("nan")):
            v, status = parse_value(marker)
            self.assertTrue(math.isnan(v), marker)
        self.assertEqual(parse_value("<0.1")[1], "unparseable")    # censored: missing, never 0
        self.assertTrue(math.isnan(parse_value("<0.1")[0]))

    def test_zero_is_kept(self):
        self.assertEqual(parse_value(0)[0], 0.0)
        self.assertEqual(parse_value("0")[0], 0.0)

    def test_series(self):
        s = pd.Series([1, "Tr", "2,5", "<1", None], dtype=object)
        vals, bad = parse_series(s)
        self.assertEqual(vals[0], 1)
        self.assertTrue(math.isnan(vals[1]))
        self.assertEqual(vals[2], 2.5)
        self.assertEqual(bad, 1)

    def test_column_matching_is_tolerant(self):
        df = pd.DataFrame(columns=["Energ_Kcal", "Protein_(g)"])
        self.assertEqual(resolve_column(df, ["energy", "energ kcal"]), "Energ_Kcal")
        self.assertEqual(resolve_column(df, "PROTEIN (G)"), "Protein_(g)")
        self.assertIsNone(resolve_column(df, "nothing"))
        self.assertEqual(norm_col("Vit_D_µg"), norm_col("vit d µg"))

    def test_labels(self):
        self.assertEqual(make_label(1, "cup, chopped"), "1 cup, chopped")
        self.assertEqual(make_label(0.5, "cup"), "1/2 cup")
        self.assertEqual(make_label(None, "1 medium"), "1 medium")


WIDE_CFG = {"sources": [{
    "key": "w", "db": "W", "citation": "c", "sheet": "S", "layout": "wide", "id_column": "id", "id_pad": 5,
    "name_column": "name", "group_column": "grp",
    "nutrients": {
        "kcal": {"column": "kcal", "unit": "kcal"},
        "protein": {"column": "prot", "unit": "g"},
        "folate": {"sum": [{"column": "food_fol"}, {"column": "folic", "factor": 1.7, "optional": True}], "unit": "µg DFE"},
        "vitD": [{"column": "d_ug", "unit": "µg"}, {"column": "d_iu", "unit": "IU"}],
        "iron": {"column": "missing_col", "unit": "mg"},
    },
    "portions": {"layout": "wide_pairs", "pairs": [{"grams": "g1", "desc": "d1"}]},
}]}


class Wide(unittest.TestCase):
    def frames(self):
        df = pd.DataFrame({
            "id": [1001, "01002", "01003", "01003", None, "01005"],
            "name": ["A", "B", "C", "C dup", "no id", ""],
            "grp": ["g"] * 6,
            "kcal": [100, "Tr", 0, 5, 5, 5], "prot": [1, 2, "N", 4, 4, 4],
            "food_fol": [10, 20, None, 1, 1, 1], "folic": [10, None, 5, 0, 0, 0],
            "d_ug": [None, 1.0, None, 1, 1, 1], "d_iu": [40, 40, 80, 1, 1, 1],
            "g1": [118, None, 50, 1, 1, 1], "d1": ["1 medium", None, "1 cup", "x", "x", "x"],
        }, dtype=object)
        return {("S", 0): df}

    def test_wide(self):
        log = Log()
        res = ingest_frames(self.frames(), WIDE_CFG, log)
        self.assertEqual(list(res.items["source_id"]), ["01001", "01002", "01003"])   # padded; dup/blank dropped
        self.assertEqual(list(res.items["uid"]), ["w:01001", "w:01002", "w:01003"])
        lg = res.long
        get = lambda uid, n: lg[(lg.uid == uid) & (lg.nutrient == n)]
        self.assertEqual(get("w:01001", "kcal")["value"].iloc[0], 100)
        self.assertTrue(get("w:01002", "kcal").empty)            # "Tr" -> absent, not 0
        self.assertEqual(get("w:01003", "kcal")["value"].iloc[0], 0)   # real zero kept
        self.assertTrue(get("w:01003", "protein").empty)          # "N" -> absent
        # DFE = food folate + 1.7 * folic acid (optional component)
        self.assertAlmostEqual(get("w:01001", "folate")["value"].iloc[0], 10 + 17)
        self.assertAlmostEqual(get("w:01002", "folate")["value"].iloc[0], 20)
        self.assertTrue(get("w:01003", "folate").empty)           # required component missing
        # fallback list: prio 0 µg, prio 1 IU
        d1 = get("w:01001", "vitD")
        self.assertEqual(list(d1["unit"]), ["IU"])
        d2 = get("w:01002", "vitD")
        self.assertEqual(sorted(d2["unit"]), ["IU", "µg"])
        reasons = {(e["reason"]) for e in log.events}
        self.assertIn("column_not_found", reasons)              # iron column does not exist -> warned
        self.assertIn("duplicate_id", reasons)
        self.assertEqual(len(res.portions), 2)
        self.assertEqual(set(res.portions["label"]), {"1 medium", "1 cup"})

    def test_missing_sheet_is_reported_not_fatal(self):
        log = Log()
        res = ingest_frames({}, WIDE_CFG, log)
        self.assertTrue(res.items.empty)
        self.assertIn("sheet_not_found", [e["reason"] for e in log.events])


LONG_CFG = {"sources": [{
    "key": "l", "db": "L", "citation": "c", "sheet": "VALUES", "layout": "long", "id_column": "FoodID",
    "long": {"nutrient_column": "NID", "value_column": "Val", "match_on": "code",
             "nutrient_lookup": {"sheet": "NUT", "id_column": "NID", "code_column": "Code", "name_column": "Name",
                                 "unit_column": "Unit"}},
    "names": {"sheet": "FOODS", "id_column": "FoodID", "name_column": "Desc"},
    "nutrients": {"kcal": [{"match": ["208"], "unit": "kcal"}, {"match": ["268"], "unit": "kJ"}],
                  "protein": {"match": ["203"]}, "iron": {"match": ["303"]}},
}]}


class Long(unittest.TestCase):
    def test_long_layout_with_lookup(self):
        frames = {
            ("VALUES", 0): pd.DataFrame({"FoodID": [1, 1, 1, 2], "NID": [10, 11, 12, 11], "Val": [418.4, 3.0, 2000, 7]}, dtype=object),
            ("NUT", 0): pd.DataFrame({"NID": [10, 11, 12], "Code": [268, 203, 303], "Name": ["Energy", "Protein", "Iron"],
                                      "Unit": ["kJ", "g", "mcg"]}, dtype=object),
            ("FOODS", 0): pd.DataFrame({"FoodID": [1, 2], "Desc": ["Apple, raw", "Pear, raw"]}, dtype=object),
        }
        res = ingest_frames(frames, LONG_CFG, Log())
        self.assertEqual(len(res.items), 2)
        lg = res.long
        iron = lg[lg.nutrient == "iron"].iloc[0]
        self.assertEqual((iron["value"], iron["unit"]), (2000, "mcg"))     # unit taken from the lookup sheet
        kc = lg[lg.nutrient == "kcal"].iloc[0]
        self.assertEqual((kc["value"], kc["unit"], kc["prio"]), (418.4, "kJ", 1))
        self.assertEqual(set(lg["raw_name"]), {"Apple, raw", "Pear, raw"})


if __name__ == "__main__":
    unittest.main()
