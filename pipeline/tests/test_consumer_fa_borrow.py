"""Fatty-acid borrowing (adapter.borrow_fatty_acids, adapter.load_records route 1, curate.borrow_fatty_acids_by_head route 2)
and the peer outlier check (consumer.qa)."""
import tempfile
import unittest
from pathlib import Path

import helpers  # noqa: F401
import pandas as pd
from consumer import adapter as A, curate as C, qa as Q

DONOR = {"fat": 50.0, "satFat": 4.0, "mufa": 31.0, "pufa": 12.0, "ala": 0.2, "epa": 0.0, "dha": 0.0}


class Borrow(unittest.TestCase):
    def test_needs_and_has_split(self):
        self.assertTrue(A.needs_fa_split({"fat": 5.0}))
        self.assertFalse(A.needs_fa_split({"fat": 0.8}))                               # under 1 g of fat: leave alone
        self.assertTrue(A.needs_fa_split({"fat": 5.0, "satFat": 1.0}))                 # partly given: the missing ones are borrowed
        self.assertFalse(A.needs_fa_split({"fat": 5.0, "satFat": 1.0, "mufa": 2.0, "pufa": 1.0}))
        self.assertTrue(A.has_fa_split(DONOR))
        self.assertFalse(A.has_fa_split({"fat": 0.5, "satFat": 0.1, "mufa": 0.1, "pufa": 0.1}))

    def test_proportions_are_scaled_to_the_records_own_fat_and_marked_estimated(self):
        n, est, notes = {"fat": 25.0}, [], []
        A.borrow_fatty_acids(n, est, notes, DONOR, "Almonds [x]", "same cluster", "nuts_seeds")
        self.assertAlmostEqual(n["satFat"], 2.0)
        self.assertAlmostEqual(n["mufa"], 15.5)
        self.assertAlmostEqual(n["pufa"], 6.0)
        self.assertAlmostEqual(n["ala"], 0.1)
        self.assertAlmostEqual(n["la"], 6.0 - 0.1)                                     # la re-estimated from the new pufa
        for k in ("satFat", "mufa", "pufa", "ala", "epa", "dha", "la"):
            self.assertIn(k, est)
        self.assertTrue(any("borrowed" in x and "Almonds" in x for x in notes))

    def test_own_measured_omega3_is_kept(self):
        n, est, notes = {"fat": 10.0, "ala": 0.9}, [], []
        A.borrow_fatty_acids(n, est, notes, DONOR, "d", "same cluster", "nuts_seeds")
        self.assertEqual(n["ala"], 0.9)
        self.assertNotIn("ala", est)

    def test_partial_split_fills_only_the_missing_key_and_never_touches_measured_ones(self):
        # "Heavy cream": sat and mono measured, poly missing (so omega-6 counted as zero)
        n, est, notes = {"fat": 45.0, "satFat": 20.4, "mufa": 7.3}, [], []
        self.assertTrue(A.borrow_fatty_acids(n, est, notes, DONOR, "d", "same head and category", "dairy_eggs"))
        self.assertEqual((n["satFat"], n["mufa"]), (20.4, 7.3))
        self.assertAlmostEqual(n["pufa"], 12.0 / 50.0 * 45.0, places=2)
        self.assertEqual(sorted(est), ["ala", "dha", "epa", "la", "pufa"])
        self.assertIn("la", n)

    def test_partial_split_that_would_overshoot_total_fat_is_left_alone(self):
        n, est, notes = {"fat": 10.0, "satFat": 5.0, "mufa": 4.5}, [], []
        self.assertFalse(A.borrow_fatty_acids(n, est, notes, DONOR, "d", "x"))
        self.assertNotIn("pufa", n)
        self.assertEqual(est, [])

    def test_sum_never_exceeds_total_fat(self):
        n, est, notes = {"fat": 10.0}, [], []
        A.borrow_fatty_acids(n, est, notes, {"fat": 10.0, "satFat": 4.0, "mufa": 4.0, "pufa": 4.0}, "d", "x")   # donor sums to 120 % of its fat
        self.assertLessEqual(n["satFat"] + n["mufa"] + n["pufa"], 10.0 + 0.05)


def wide_row(fid, source, name, cid, fat, **kw):
    base = {"food_id": fid, "name_en": name, "name_original": name, "food_group": "nuts_seeds", "state": "unknown", "country": "",
            "source_id": source, "source_citation": source, "basis": A.EDIBLE_BASIS, "status": "active", "canonical_id": cid,
            "is_preferred": "False", "energy_kcal": "600", "fat_g": str(fat)}
    base.update({k: str(v) for k, v in kw.items()})
    return base


class ClusterRoute(unittest.TestCase):
    def test_display_record_without_split_borrows_from_best_member_with_one(self):
        rows = [wide_row("cnf:1", "cnf", "Almonds, dried", "c1", 50.0),
                wide_row("usda_fdc_sr_legacy:2", "usda_fdc_sr_legacy", "Almonds, dried, raw", "c1", 49.9, sat_fat_g=3.8, mono_fat_g=31.6, poly_fat_g=12.3),
                wide_row("afcd:3", "afcd", "Almonds", "c1", 52.0, sat_fat_g=9, mono_fat_g=20, poly_fat_g=8)]
        with tempfile.TemporaryDirectory() as d:
            cols = sorted({k for r in rows for k in r})
            pd.DataFrame(rows).reindex(columns=cols).fillna("").to_csv(Path(d) / "foods_wide.csv", index=False)
            pd.DataFrame([{"canonical_id": "c1", "food_id": r["food_id"]} for r in rows]).to_csv(Path(d) / "canonical_members.csv", index=False)
            recs, _ = A.load_records(d)
        r = recs[0]
        self.assertEqual(r["food_id"], "cnf:1")                                        # region priority is kept
        self.assertEqual(r["fa_borrow"], "cluster")
        self.assertIn("Almonds, dried, raw", r["fa_donor"])                            # the best-ranked member with a split (usda before afcd)
        self.assertAlmostEqual(r["n"]["mufa"], 31.6 / 49.9 * 50.0, places=1)
        self.assertTrue({"satFat", "mufa", "pufa", "la"} <= set(r["estimated"]))


def crec(cid, head, cat, rank, n, tier="everyday", name=None):
    return {"canonical_id": cid, "name": name or cid, "head": head, "category": cat, "rank": rank, "tier": tier, "n": dict(n),
            "estimated": [], "notes": [], "food_group": "nuts_seeds", "fa_borrow": ""}


class HeadRoute(unittest.TestCase):
    def test_highest_ranked_same_head_and_category_with_a_split_wins(self):
        recs = [crec("a", "almonds", "nut_seed", 90, {"fat": 50.0}),                                    # needs a split
                crec("b", "almonds", "nut_seed", 70, DONOR),                                            # donor, ranked 2nd
                crec("c", "almonds", "nut_seed", 95, {"fat": 50.0, "satFat": 20.0, "mufa": 20.0, "pufa": 9.0}),   # donor, ranked 1st
                crec("d", "almonds", "fruit", 99, DONOR),                                               # other category: never a donor
                crec("e", "almonds", "nut_seed", 80, DONOR, tier="hidden")]                              # hidden: ignored
        stats = C.borrow_fatty_acids_by_head(recs)
        a = recs[0]
        self.assertEqual(a["fa_borrow"], "head")
        self.assertIn("c", a["notes"][-1])
        self.assertAlmostEqual(a["n"]["satFat"], 20.0)
        self.assertEqual(stats["all"]["head"], 1)

    def test_no_donor_leaves_the_split_missing_and_borrowed_records_are_not_donors(self):
        recs = [crec("a", "hemp", "nut_seed", 90, {"fat": 30.0}), crec("b", "hemp", "nut_seed", 80, {"fat": 30.0})]
        stats = C.borrow_fatty_acids_by_head(recs)
        self.assertNotIn("satFat", recs[0]["n"])
        self.assertEqual(stats["all"]["none"], 2)
        recs[1]["n"].update(DONOR)
        recs[1]["fa_borrow"] = "cluster"                                                                # itself borrowed: not a donor
        C.borrow_fatty_acids_by_head(recs)
        self.assertNotIn("satFat", recs[0]["n"])


def qrec(name, calcium, head="greek yogurt", form="product", **kw):
    n = {"kcal": 100.0, "protein": 8.0, "fat": 3.0}
    if calcium is not None:
        n["calcium"] = calcium
    n.update(kw)
    return {"name": name, "head": head, "form": form, "tier": "everyday", "id": name, "source_id": "cnf", "n": n, "estimated": ["calcium"], "notes": []}


class Outliers(unittest.TestCase):
    def peers(self):
        return [qrec(f"p{i}", c) for i, c in enumerate([100, 110, 115, 126, 105])]

    def test_high_outlier_is_dropped_citation_untouched_and_noted(self):
        bad = qrec("bad", 450.0)
        flags = Q.find_outliers(self.peers() + [bad])
        self.assertEqual([(f["rec"]["name"], f["key"], f["action"]) for f in flags], [("bad", "calcium", "dropped")])
        self.assertEqual(Q.apply_outliers(flags), 1)
        self.assertNotIn("calcium", bad["n"])
        self.assertNotIn("calcium", bad["estimated"])
        self.assertTrue(any(x.startswith("outlier: calcium") for x in bad["notes"]))

    def test_small_gap_is_not_flagged(self):
        # 3x the median but only 30 mg away: below 20 % of the female RDA (200 mg)
        peers = [qrec(f"p{i}", c) for i, c in enumerate([10, 11, 10, 12])]
        self.assertEqual(Q.find_outliers(peers + [qrec("x", 40.0)]), [])

    def test_needs_three_peers_with_the_nutrient(self):
        two = [qrec("p1", 100), qrec("p2", 110), qrec("p3", None)]
        self.assertEqual(Q.find_outliers(two + [qrec("bad", 450.0)]), [])

    def test_other_heads_and_forms_are_not_peers(self):
        others = [qrec(f"o{i}", c, form="dried") for i, c in enumerate([100, 110, 115, 126])]
        self.assertEqual(Q.find_outliers(others + [qrec("odd", 450.0)]), [])

    def test_kcal_protein_fat_are_listed_never_changed(self):
        peers = [qrec(f"p{i}", 100.0, kcal=100.0 + i) for i in range(5)]
        odd = qrec("odd", 100.0, kcal=600.0)
        flags = Q.find_outliers(peers + [odd])
        self.assertEqual([(f["key"], f["action"]) for f in flags], [("kcal", "listed")])
        self.assertEqual(Q.apply_outliers(flags), 0)
        self.assertEqual(odd["n"]["kcal"], 600.0)

    def test_low_values_and_disagreeing_peers_are_listed_not_dropped(self):
        rich = [qrec(f"r{i}", c) for i, c in enumerate([800, 900, 850, 950, 880])]
        zero = Q.find_outliers(rich + [qrec("zero", 0.0)])
        self.assertEqual((zero[0]["action"], zero[0]["why"]), ("listed", "low values only list: a missing value counts as zero anyway"))
        mixed = [qrec(f"m{i}", c) for i, c in enumerate([20, 400, 90, 800, 60])]
        flags = Q.find_outliers(mixed + [qrec("hi", 3000.0)])
        hi = next(f for f in flags if f["rec"]["name"] == "hi" or f["value"] == 3000.0)
        self.assertEqual((hi["action"], hi["why"]), ("listed", "peers disagree"))


if __name__ == "__main__":
    unittest.main()
