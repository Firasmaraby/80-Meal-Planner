"""Choline estimated from protein (curate.borrow_choline)."""
import unittest

import helpers  # noqa: F401
from consumer import curate as C


def rec(cid, head, cat, protein, choline=None, form="raw", rank=50, name=None, tier="everyday", estimated=()):
    n = {"protein": protein}
    if choline is not None:
        n["choline"] = choline
    return {"canonical_id": cid, "name": name or f"{head}, {form}", "head": head, "category": cat, "form": form, "rank": rank,
            "tier": tier, "n": n, "estimated": list(estimated), "notes": []}


class Choline(unittest.TestCase):
    def test_same_head_donor_scaled_by_protein_and_marked_estimated(self):
        donor = rec("d", "lentils", "legume", 24.6, 96.4, form="dried", rank=90)
        boiled = rec("b", "lentils", "legume", 9.0, form="cooked")
        stats = C.borrow_choline([donor, boiled])
        self.assertAlmostEqual(boiled["n"]["choline"], round(96.4 / 24.6 * 9.0, 1))
        self.assertIn("choline", boiled["estimated"])
        self.assertIn("lentils, dried", boiled["notes"][-1])
        self.assertEqual(stats["head"], 1)
        self.assertNotIn("choline", donor["estimated"])                    # measured values are never touched

    def test_same_form_donor_preferred_over_a_higher_ranked_other_form(self):
        dried = rec("d", "chickpeas", "legume", 20.0, 100.0, form="dried", rank=95)
        canned_donor = rec("c1", "chickpeas", "legume", 5.0, 30.0, form="canned", rank=60)
        canned = rec("c2", "chickpeas", "legume", 7.0, form="canned")
        C.borrow_choline([dried, canned_donor, canned])
        self.assertAlmostEqual(canned["n"]["choline"], 42.0)               # 6 mg/g from the canned donor, not 5 from dried

    def test_category_median_for_plain_muscle_only(self):
        fish = [rec(f"f{i}", f"fish{i}", "fish", 20.0, 60.0 + i) for i in range(11)]   # ratios 3.0 .. 3.5, median 3.25
        mackerel = rec("m", "spanish mackerel", "fish", 20.0)
        liver = rec("l", "cod liver", "fish", 10.0, name="Cod liver, raw")
        stats = C.borrow_choline(fish + [mackerel, liver])
        self.assertAlmostEqual(mackerel["n"]["choline"], 65.0)
        self.assertNotIn("choline", liver["n"])                            # organ meat never takes a muscle median
        self.assertEqual((stats["category"], stats["none"]), (1, 1))

    def test_plain_pulses_take_the_legume_median_but_not_dairy_or_bean_pastes(self):
        beans = [rec(f"b{i}", f"bean{i}", "legume", 20.0, 80.0) for i in range(12)]
        odd = rec("o", "lupin", "legume", 30.0)
        paste = rec("p", "adzuki bean paste, sweetened", "legume", 9.0)
        est = rec("e", "skyr", "dairy", 11.0, 50.0, estimated=["choline"])
        skyr = rec("s", "skyr", "dairy", 11.0)
        C.borrow_choline(beans + [odd, paste, est, skyr])
        self.assertAlmostEqual(odd["n"]["choline"], 120.0)                # 4 mg per g protein x 30 g
        self.assertNotIn("choline", paste["n"])
        self.assertNotIn("choline", skyr["n"])                            # dairy never takes a median, and estimated donors don't count

    def test_low_protein_and_other_categories_and_hidden_are_left_alone(self):
        d = rec("d", "spinach", "vegetable", 2.9, 19.3)
        veg = rec("v", "spinach", "vegetable", 2.9)
        water = rec("w", "broth", "meat", 1.0)
        hidden = rec("h", "lentils", "legume", 9.0, tier="hidden")
        donor = rec("ld", "lentils", "legume", 24.6, 96.4)
        C.borrow_choline([d, veg, water, hidden, donor])
        self.assertNotIn("choline", veg["n"])
        self.assertNotIn("choline", water["n"])
        self.assertNotIn("choline", hidden["n"])


if __name__ == "__main__":
    unittest.main()
