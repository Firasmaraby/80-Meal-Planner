import math
import unittest

import numpy as np
import pandas as pd

import helpers  # noqa: F401
from stages.normalize import conversion, normalize, to_wide, unit_token
from stages.report import Log


def long(rows):
    """rows: (uid, nutrient, value, unit[, prio])"""
    recs = []
    for r in rows:
        uid, nut, val, unit = r[:4]
        recs.append({"source": uid.split(":")[0], "source_id": uid.split(":")[1], "uid": uid, "raw_name": "x",
                     "nutrient": nut, "value": val, "unit": unit, "prio": r[4] if len(r) > 4 else 0, "col": "c"})
    return pd.DataFrame(recs)


def one(rows):
    out, dropped = normalize(long(rows), Log())
    return out, dropped


class UnitTokens(unittest.TestCase):
    def test_tokens(self):
        self.assertEqual(unit_token("µg RAE"), "ugrae")
        self.assertEqual(unit_token("μg"), "ug")          # Greek mu
        self.assertEqual(unit_token("mcg"), "ug")
        self.assertEqual(unit_token("kJ"), "kj")
        self.assertEqual(unit_token("mg α-TE"), "mgate")
        self.assertEqual(unit_token("IU (beta_carotene)"), "iu(betacarotene)")
        self.assertEqual(unit_token("mg/100g"), "mg")


class Conversions(unittest.TestCase):
    def val(self, nutrient, v, unit):
        out, dropped = one([("s:1", nutrient, v, unit)])
        return (float(out["value"].iloc[0]) if len(out) else None), dropped

    def test_kj_to_kcal(self):
        v, _ = self.val("kcal", 418.4, "kJ")
        self.assertAlmostEqual(v, 100.0, places=3)

    def test_kcal_passthrough(self):
        v, _ = self.val("kcal", 89, "kcal")
        self.assertEqual(v, 89)

    def test_vitamin_d_iu_divided_by_40(self):
        v, _ = self.val("vitD", 400, "IU")
        self.assertAlmostEqual(v, 10.0)

    def test_vitamin_a_iu_is_not_converted(self):
        v, dropped = self.val("vitA", 5000, "IU")
        self.assertIsNone(v)
        self.assertEqual(list(dropped["reason"]), ["unsafe_conversion"])

    def test_vitamin_a_re_and_bare_ug_not_converted(self):
        for unit in ("µg RE", "µg", "mcg"):
            v, dropped = self.val("vitA", 100, unit)
            self.assertIsNone(v, unit)
            self.assertEqual(dropped["reason"].iloc[0], "unsafe_conversion")

    def test_vitamin_a_rae_and_explicit_iu_basis(self):
        self.assertEqual(self.val("vitA", 469, "µg RAE")[0], 469)
        self.assertAlmostEqual(self.val("vitA", 1000, "IU(retinol)")[0], 300.0)
        out, _ = one([("s:1", "vitA", 1000, "IU(beta_carotene)")])
        self.assertAlmostEqual(out["value"].iloc[0], 50.0)
        self.assertTrue(bool(out["approx"].iloc[0]))   # approximate -> never used to fill other records

    def test_superseded_unsafe_row_is_not_a_loss(self):
        out, dropped = one([("s:1", "vitA", 469, "µg RAE", 0), ("s:1", "vitA", 9377, "IU", 1)])
        self.assertEqual(float(out["value"].iloc[0]), 469)
        self.assertTrue(dropped.empty)

    def test_unsafe_alternative_used_when_nothing_else(self):
        out, dropped = one([("s:1", "vitA", 9377, "IU", 1)])
        self.assertTrue(out.empty)
        self.assertEqual(len(dropped), 1)

    def test_folate_food_folate_equals_dfe(self):
        self.assertEqual(self.val("folate", 194, "µg")[0], 194)
        self.assertEqual(self.val("folate", 194, "µg food folate")[0], 194)
        self.assertEqual(self.val("folate", 194, "µg DFE")[0], 194)
        out, _ = one([("s:1", "folate", 100, "µg total folate")])
        self.assertTrue(bool(out["approx"].iloc[0]))

    def test_vitamin_e_alpha_tocopherol(self):
        self.assertEqual(self.val("vitE", 14.35, "mg")[0], 14.35)
        out, _ = one([("s:1", "vitE", 18.4, "mg α-TE")])
        self.assertEqual(out["value"].iloc[0], 18.4)
        self.assertTrue(bool(out["approx"].iloc[0]))
        self.assertIsNone(self.val("vitE", 10, "IU")[0])
        self.assertAlmostEqual(self.val("vitE", 10, "IU(natural)")[0], 6.7)

    def test_niacin_equivalents_are_not_niacin(self):
        v, dropped = self.val("b3", 12, "mg NE")
        self.assertIsNone(v)
        self.assertEqual(dropped["reason"].iloc[0], "unsafe_conversion")

    def test_mass_unit_scaling(self):
        self.assertAlmostEqual(self.val("sodium", 0.074, "g")[0], 74.0)
        self.assertAlmostEqual(self.val("iron", 2000, "µg")[0], 2.0)
        self.assertAlmostEqual(self.val("protein", 31000, "mg")[0], 31.0)
        self.assertAlmostEqual(self.val("selenium", 0.04, "mg")[0], 40.0)

    def test_salt_to_sodium(self):
        self.assertAlmostEqual(self.val("sodium", 1, "g NaCl")[0], 393.4)

    def test_incompatible_unit_dropped(self):
        v, dropped = self.val("protein", 5, "kJ")
        self.assertIsNone(v)
        self.assertEqual(dropped["reason"].iloc[0], "incompatible_unit")

    def test_conversion_function_directly(self):
        self.assertEqual(conversion("vitD", "IU")[0], 0.025)
        self.assertIsNone(conversion("vitA", "IU")[0])


class Plausibility(unittest.TestCase):
    def test_negative_dropped_with_report(self):
        out, dropped = one([("s:1", "fiber", -2.0, "g"), ("s:1", "protein", 3, "g")])
        self.assertEqual(list(out["nutrient"]), ["protein"])
        self.assertEqual(list(dropped["reason"]), ["negative_value"])
        self.assertEqual(dropped["uid"].iloc[0], "s:1")

    def test_more_than_100g_dropped(self):
        out, dropped = one([("s:1", "protein", 150, "g"), ("s:1", "fat", 100, "g"), ("s:2", "carbs", 100.4, "g")])
        self.assertEqual(sorted(out["nutrient"]), ["carbs", "fat"])
        self.assertEqual(list(dropped["reason"]), ["exceeds_100g_per_100g"])

    def test_g_conversion_is_checked_after_unit_conversion(self):
        out, dropped = one([("s:1", "protein", 150000, "mg")])
        self.assertTrue(out.empty)
        self.assertEqual(len(dropped), 1)

    def test_kcal_above_physical_limit(self):
        out, dropped = one([("s:1", "kcal", 5000, "kcal")])
        self.assertTrue(out.empty)
        self.assertEqual(dropped["reason"].iloc[0], "implausible_magnitude")

    def test_macro_sum_over_100(self):
        out, dropped = one([("s:1", "protein", 60, "g"), ("s:1", "fat", 40, "g"), ("s:1", "carbs", 40, "g"),
                            ("s:1", "kcal", 800, "kcal")])
        self.assertEqual(list(out["nutrient"]), ["kcal"])
        self.assertTrue((dropped["reason"] == "macro_sum_exceeds_100g").all())

    def test_subcomponent_exceeding_parent(self):
        out, dropped = one([("s:1", "carbs", 10, "g"), ("s:1", "sugar", 30, "g")])
        self.assertEqual(list(out["nutrient"]), ["carbs"])
        self.assertEqual(dropped["reason"].iloc[0], "sugar_exceeds_carbs")

    def test_zero_is_a_real_value_and_is_kept(self):
        out, _ = one([("s:1", "carbs", 0, "g")])
        self.assertEqual(float(out["value"].iloc[0]), 0.0)


class Wide(unittest.TestCase):
    def test_missing_stays_nan_never_zero(self):
        items = pd.DataFrame({"uid": ["s:1", "s:2"], "source": "s", "source_id": ["1", "2"], "raw_name": ["a", "b"]})
        out, _ = one([("s:1", "kcal", 100, "kcal")])
        wide = to_wide(items, out)
        self.assertEqual(wide.loc[0, "kcal"], 100)
        self.assertTrue(np.isnan(wide.loc[1, "kcal"]))
        self.assertTrue(np.isnan(wide.loc[0, "protein"]))
        self.assertTrue(all(wide.loc[:, "vitC"].isna()))

    def test_empty_input(self):
        out, dropped = normalize(long([]).reindex(columns=["source", "source_id", "uid", "nutrient", "value", "unit"]), Log())
        self.assertTrue(out.empty and dropped.empty)


if __name__ == "__main__":
    unittest.main()
