"""consumer.adapter: foodpipe -> NutrientKey mapping (carbs rules, folate DFE, vitamin A RAE, la estimate, estimated flags)
and display-record (region) priority."""
import unittest

import helpers  # noqa: F401
from consumer import adapter as A


def row(**kw):
    base = {"food_id": "x:1", "source_id": "cnf", "status": "active", "basis": A.EDIBLE_BASIS, "is_preferred": "False",
            "source_citation": "Some DB"}
    base.update({k: str(v) for k, v in kw.items()})
    return base


class Mapping(unittest.TestCase):
    def test_macros_direct_and_missing_stays_absent(self):
        n, est, notes = A.map_nutrients(row(energy_kcal=52, protein_g=0.3, fat_g=0.2, fiber_g=2.4, sugars_g=10.4,
                                            sat_fat_g=0.03, mono_fat_g=0.01, poly_fat_g=0.05))
        self.assertEqual((n["kcal"], n["protein"], n["fat"], n["fiber"], n["sugar"], n["satFat"], n["mufa"], n["pufa"]),
                         (52, 0.3, 0.2, 2.4, 10.4, 0.03, 0.01, 0.05))
        for k in ("vitC", "b12", "calcium", "carbs", "vitK", "folate", "vitA"):
            self.assertNotIn(k, n)                      # missing is absent, never 0

    def test_zero_is_kept_as_zero(self):
        n, _, _ = A.map_nutrients(row(energy_kcal=0, vitamin_c_mg=0))
        self.assertEqual(n["kcal"], 0)
        self.assertEqual(n["vitC"], 0)

    def test_kcal_from_kj(self):
        n, _, notes = A.map_nutrients(row(energy_kj=418.4))
        self.assertAlmostEqual(n["kcal"], 100.0, places=6)
        self.assertIn("kcal from kJ / 4.184", notes)

    def test_carbs_by_difference_wins(self):
        n, _, notes = A.map_nutrients(row(carbs_by_difference_g=14, carbs_available_g=11, fiber_g=3))
        self.assertEqual(n["carbs"], 14)
        self.assertEqual(notes, ["carbs: by difference"])

    def test_carbs_available_plus_fiber(self):
        n, _, notes = A.map_nutrients(row(carbs_available_g=11, fiber_g=3))
        self.assertEqual(n["carbs"], 14)
        self.assertIn("carbs: available + fiber", notes)

    def test_carbs_available_without_fiber_adds_nothing(self):
        n, _, _ = A.map_nutrients(row(carbs_available_g=11))
        self.assertEqual(n["carbs"], 11)

    def test_carbs_monosaccharide_over_1_05_plus_fiber(self):
        n, _, notes = A.map_nutrients(row(carbs_available_monosaccharide_g=21, fiber_g=2))
        self.assertAlmostEqual(n["carbs"], 22.0)
        self.assertTrue(any("1.05" in x for x in notes))

    def test_borrowed_fatty_acids_are_rescaled_to_the_foods_own_fat(self):
        # oats: split gap-filled from a source with more fat (sum 7.7 g against 5.89 g total fat)
        cols = {"sat_fat_g", "mono_fat_g", "poly_fat_g", "omega3_ala_g"}
        n, est, notes = A.map_nutrients(row(fat_g=5.89, sat_fat_g=1.54, mono_fat_g=3.16, poly_fat_g=3.02, omega3_ala_g=0.1), cols)
        total = n["satFat"] + n["mufa"] + n["pufa"]
        self.assertAlmostEqual(total, 5.89 * A.FA_SCALE_TO, places=2)
        self.assertAlmostEqual(n["satFat"] / total, 1.54 / 7.72, places=3)     # the split's proportions are kept
        self.assertLess(n["ala"], 0.1)
        self.assertIn("satFat", est)
        self.assertTrue(any("rescaled" in x for x in notes))

    def test_impossible_measured_split_is_dropped_but_omega3_kept(self):
        n, est, notes = A.map_nutrients(row(fat_g=1.9, sat_fat_g=0.76, mono_fat_g=6.23, poly_fat_g=3.13, omega3_dha_g=0.05))
        for k in ("satFat", "mufa", "pufa", "la"):
            self.assertNotIn(k, n)
        self.assertEqual(n["dha"], 0.05)
        n, _, _ = A.map_nutrients(row(fat_g=0.05, sat_fat_g=0.2))     # saturated fat alone above total fat
        self.assertNotIn("satFat", n)

    def test_measured_split_slightly_over_is_kept_as_published(self):
        n, _, notes = A.map_nutrients(row(fat_g=2.5, sat_fat_g=1.12, mono_fat_g=1.4, poly_fat_g=0.54))
        self.assertEqual((n["satFat"], n["mufa"], n["pufa"]), (1.12, 1.4, 0.54))
        self.assertFalse(any("fatty acids" in x for x in notes))

    def test_no_carb_columns_no_carbs(self):
        n, _, _ = A.map_nutrients(row(energy_kcal=10))
        self.assertNotIn("carbs", n)

    def test_vitamin_a_is_rae_only(self):
        n, _, _ = A.map_nutrients(row(vitamin_a_re_ug=500, retinol_ug=100, beta_carotene_ug=900))
        self.assertNotIn("vitA", n)
        n, _, _ = A.map_nutrients(row(vitamin_a_rae_ug=120, vitamin_a_re_ug=500))
        self.assertEqual(n["vitA"], 120)

    def test_vitamin_k_prefers_k1(self):
        n, _, _ = A.map_nutrients(row(vitamin_k1_ug=10, vitamin_k_total_ug=99))
        self.assertEqual(n["vitK"], 10)
        n, _, notes = A.map_nutrients(row(vitamin_k_total_ug=99))
        self.assertEqual(n["vitK"], 99)
        self.assertTrue(any("vitK" in x for x in notes))

    def test_folate_dfe_first(self):
        n, est, _ = A.map_nutrients(row(folate_dfe_ug=100, folate_total_ug=60, folic_acid_ug=20))
        self.assertEqual(n["folate"], 100)
        self.assertNotIn("folate", est)

    def test_folate_dfe_computed_from_total_and_folic_acid(self):
        n, _, notes = A.map_nutrients(row(folate_total_ug=100, folic_acid_ug=50))
        self.assertAlmostEqual(n["folate"], (100 - 50) + 1.7 * 50)       # 135
        self.assertTrue(any("DFE computed" in x for x in notes))

    def test_folate_total_only_is_estimated(self):
        n, est, _ = A.map_nutrients(row(folate_total_ug=77))
        self.assertEqual(n["folate"], 77)
        self.assertIn("folate", est)

    def test_la_estimate_and_flag(self):
        n, est, notes = A.map_nutrients(row(poly_fat_g=3.0, omega3_ala_g=0.5, omega3_epa_g=0.2, omega3_dha_g=0.3))
        self.assertAlmostEqual(n["la"], 2.0)
        self.assertIn("la", est)
        self.assertTrue(any(x.startswith("la:") for x in notes))

    def test_la_clamped_at_zero_and_only_with_pufa(self):
        n, est, _ = A.map_nutrients(row(poly_fat_g=0.4, omega3_ala_g=0.5))
        self.assertEqual(n["la"], 0.0)
        n, est, _ = A.map_nutrients(row(omega3_ala_g=0.5))
        self.assertNotIn("la", n)
        self.assertNotIn("la", est)

    def test_estimated_and_borrowed_columns_flag_their_keys(self):
        r = row(vitamin_c_mg=5, vitamin_d_ug=1, estimated_nutrients="vitamin_c_mg", filled_nutrients="vitamin_d_ug carbs_available_g",
                carbs_available_g=4, fiber_g=1)
        n, est, _ = A.map_nutrients(r, A.est_columns(r))
        self.assertEqual(set(est) - {"la"}, {"vitC", "vitD", "carbs"})

    def test_rounding_to_4_significant_figures(self):
        self.assertEqual(A.sig4(123.456), 123.5)
        self.assertEqual(A.sig4(0.0123456), 0.01235)
        self.assertEqual(A.sig4(0), 0.0)
        self.assertIsNone(A.sig4(None))

    def test_num_parsing(self):
        self.assertIsNone(A.num(""))
        self.assertIsNone(A.num("abc"))
        self.assertIsNone(A.num("-1"))
        self.assertEqual(A.num("3.5"), 3.5)


class RegionPriority(unittest.TestCase):
    def members(self):
        return [row(food_id="ciqual:1", source_id="ciqual", is_preferred="True", energy_kcal=10),
                row(food_id="usda_fdc_foundation:9", source_id="usda_fdc_foundation", energy_kcal=10),
                row(food_id="usda_fdc_sr_legacy:5", source_id="usda_fdc_sr_legacy", energy_kcal=10),
                row(food_id="cnf:2", source_id="cnf", energy_kcal=10)]

    def test_cnf_then_usda_sr_then_foundation_then_preferred(self):
        m = self.members()
        self.assertEqual(A.pick_display(m)["food_id"], "cnf:2")
        m = [x for x in m if x["source_id"] != "cnf"]
        self.assertEqual(A.pick_display(m)["food_id"], "usda_fdc_sr_legacy:5")
        m = [x for x in m if x["source_id"] != "usda_fdc_sr_legacy"]
        self.assertEqual(A.pick_display(m)["food_id"], "usda_fdc_foundation:9")
        m = [x for x in m if x["source_id"] != "usda_fdc_foundation"]
        self.assertEqual(A.pick_display(m)["food_id"], "ciqual:1")

    def test_preferred_beats_other_when_no_north_american_source(self):
        m = [row(food_id="cofid:1", source_id="cofid", energy_kcal=1), row(food_id="afcd:1", source_id="afcd", is_preferred="True", energy_kcal=1)]
        self.assertEqual(A.pick_display(m)["food_id"], "afcd:1")

    def test_ineligible_members_are_never_chosen(self):
        m = [row(food_id="cnf:1", basis="per 100 g dry matter", energy_kcal=1), row(food_id="cnf:2", status="superseded", energy_kcal=1),
             row(food_id="ciqual:3", source_id="ciqual", energy_kcal=1)]
        self.assertEqual(A.pick_display(m)["food_id"], "ciqual:3")
        self.assertIsNone(A.pick_display(m[:2]))

    def test_assumed_basis_is_not_edible_basis(self):
        m = [row(food_id="cnf:1", basis="per 100 g edible portion (assumed; not stated by the source)")]
        self.assertIsNone(A.pick_display(m))

    def test_record_without_energy_is_skipped_when_a_later_member_has_it(self):
        m = [row(food_id="cnf:1"), row(food_id="usda_fdc_sr_legacy:2", source_id="usda_fdc_sr_legacy", energy_kcal=50)]
        self.assertEqual(A.pick_display(m)["food_id"], "usda_fdc_sr_legacy:2")

    def test_src_lists_display_first_then_members_then_donors(self):
        d = row(food_id="cnf:2", source_citation="CNF")
        others = [d, row(food_id="usda_fdc_sr_legacy:7", source_citation="SR"), row(food_id="x:3", source_citation="X", status="superseded")]
        src = A.build_src(d, others, "CNF; Donor DB")
        self.assertEqual(src, [["CNF", "2"], ["SR", "7"], ["Donor DB", "gap-fill"]])


if __name__ == "__main__":
    unittest.main()
