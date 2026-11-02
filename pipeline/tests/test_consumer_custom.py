"""consumer.custom: curated staples (composites of existing foods), promote-on-use, and the spice-energy rule that unhides asafoetida.
The last class checks the real config/custom_foods.json against the shipped bundles, so a recipe that no longer matches the data fails here."""
import json
import tempfile
import unittest
from pathlib import Path

import helpers  # noqa: F401
from consumer import adapter as A, custom as CU, export_app as X, tiers as T
from test_consumer_tiers import rec

REPO = helpers.REPO_ROOT


def food(name, n, src=None):
    return {"name": name, "n": dict(n), "src": src or [[f"DB {name}", "1"]]}


def spec(**kw):
    s = {"key": "t", "name": "Test blend", "head": "test blend", "form": "product", "category": "condiment", "recipe": "half and half",
         "components": [{"food": "a", "g": 50}, {"food": "b", "g": 50}]}
    s.update(kw)
    return s


A_FOOD = food("Food A", {"kcal": 300, "protein": 10, "carbs": 60, "fat": 4, "fiber": 20, "calcium": 100, "sodium": 10})
B_FOOD = food("Food B", {"kcal": 100, "protein": 2, "carbs": 20, "fat": 2, "fiber": 4, "calcium": 50})   # no sodium
LIVE = {"a": A_FOOD, "b": B_FOOD}


def build(s, live=None):
    return CU.build_all([s], live or LIVE)[0]


class SpiceEnergy(unittest.TestCase):
    """CoFID has water, protein and fat for asafoetida but no carbohydrate or energy: it was hidden as no_kcal."""

    def asafoetida(self, **kw):
        base = dict(food_group=A.SPICE_GROUP, water_g=16.0, protein_g=4.0, fat_g=1.1)
        base.update(kw)
        return {"food_id": "cofid:13-803", "source_id": "cofid", **{k: str(v) for k, v in base.items()}}

    def test_energy_is_derived_by_difference_with_assumed_ash_and_marked_estimated(self):
        n, est, notes = A.map_nutrients(self.asafoetida())
        ash = 0.07 * (100 - 16.0)
        carbs = 100 - 16.0 - 4.0 - 1.1 - ash
        self.assertAlmostEqual(n["carbs"], carbs, 3)
        self.assertAlmostEqual(n["kcal"], 4 * 4.0 + 9 * 1.1 + 4 * carbs, 3)
        self.assertTrue({"kcal", "carbs"} <= set(est))
        self.assertTrue(any("estimated" in x and "ash assumed" in x for x in notes))

    def test_source_ash_and_fibre_are_used_when_given(self):
        n, _, notes = A.map_nutrients(self.asafoetida(ash_g=8.0, fiber_g=20.0))
        carbs = 100 - 16.0 - 4.0 - 1.1 - 8.0
        self.assertAlmostEqual(n["kcal"], 16 + 9.9 + 4 * (carbs - 20) + 2 * 20, 3)
        self.assertTrue(any("ash from the source" in x for x in notes))

    def test_a_source_energy_or_carbohydrate_is_never_overwritten(self):
        n, est, _ = A.map_nutrients(self.asafoetida(energy_kcal=297))
        self.assertEqual(n["kcal"], 297)
        self.assertNotIn("carbs", n)
        self.assertNotIn("kcal", est)
        n, est, _ = A.map_nutrients(self.asafoetida(carbs_by_difference_g=50))
        self.assertEqual(n["carbs"], 50)
        self.assertNotIn("kcal", n)               # carbohydrate from the source: left to the normal rules, not guessed

    def test_only_the_herbs_and_spices_group_and_only_with_water_protein_and_fat(self):
        self.assertNotIn("kcal", A.map_nutrients(self.asafoetida(food_group="fruits"))[0])
        self.assertNotIn("kcal", A.map_nutrients(self.asafoetida(water_g=""))[0])
        self.assertNotIn("kcal", A.map_nutrients(self.asafoetida(protein_g=""))[0])

    def test_the_food_is_no_longer_hidden_but_is_extended_only(self):
        r = rec("Asafoetida", source="cofid", group="herbs_spices_condiments", state="", kcal=None)
        r["n"].update({"kcal": 318.0})
        r["notes"] = ["kcal and carbs: estimated, no energy or carbohydrate in the source (carbs by difference ...)"]
        self.assertIsNone(T.hidden_reason(r))
        self.assertIn("energy_estimated", T.extended_reasons(r))
        gone = rec("Asafoetida", source="cofid", group="herbs_spices_condiments", state="", kcal=None)
        self.assertEqual(T.hidden_reason(gone), "no_kcal")


class Compute(unittest.TestCase):
    def test_sums_by_grams_per_100_g_of_the_finished_food(self):
        r = build(spec())
        self.assertAlmostEqual(r["n"]["kcal"], 200, 3)
        self.assertAlmostEqual(r["n"]["protein"], 6, 3)
        self.assertAlmostEqual(r["n"]["calcium"], 75, 3)

    def test_amounts_above_100_g_model_water_lost_in_reducing_or_drying(self):
        r = build(spec(components=[{"food": "b", "g": 350}]))
        self.assertAlmostEqual(r["n"]["kcal"], 350, 3)

    def test_a_nutrient_is_filled_only_when_every_component_has_it(self):
        r = build(spec())
        self.assertNotIn("sodium", r["n"])
        self.assertIn("sodium", r["missing"])
        self.assertNotIn("vitC", r["n"])

    def test_zero_if_missing_needs_a_reason_and_only_covers_the_listed_keys(self):
        bad = spec(components=[{"food": "a", "g": 50}, {"food": "b", "g": 50, "zero_if_missing": ["sodium"]}])
        with tempfile.TemporaryDirectory() as d:
            p = Path(d) / "c.json"
            p.write_text(json.dumps({"foods": [bad]}))
            with self.assertRaises(CU.CustomFoodError):
                CU.load_specs(p)
        ok = build(spec(components=[{"food": "a", "g": 50}, {"food": "b", "g": 50, "zero_if_missing": ["sodium"], "why": "b has none"}]))
        self.assertAlmostEqual(ok["n"]["sodium"], 5, 3)
        self.assertNotIn("vitC", ok["n"])

    def test_fill_omit_and_adjust(self):
        self.assertEqual(set(build(spec(fill=["kcal", "protein"]))["n"]), {"kcal", "protein"})
        self.assertNotIn("fiber", build(spec(omit=["fiber"]))["n"])
        self.assertAlmostEqual(build(spec(adjust={"carbs": 0.5}))["n"]["carbs"], 20, 3)

    def test_kcal_atwater_recomputes_energy_from_the_final_macros(self):
        r = build(spec(adjust={"carbs": 0.5}, kcal="atwater"))
        n = r["n"]
        self.assertAlmostEqual(n["kcal"], 4 * n["protein"] + 9 * n["fat"] + 4 * (n["carbs"] - n["fiber"]) + 2 * n["fiber"], 2)

    def test_inconsistent_fat_splits_are_dropped_not_kept(self):
        a = food("A", {"kcal": 100, "fat": 5, "satFat": 4, "mufa": 4, "pufa": 4})
        r = build(spec(components=[{"food": "a", "g": 100}]), {"a": a})
        self.assertNotIn("satFat", r["n"])
        self.assertTrue(any("dropped" in n for n in r["notes"]))

    def test_every_value_is_estimated_and_the_citation_names_the_components(self):
        r = build(spec())
        self.assertEqual(set(r["estimated"]), set(r["n"]))
        self.assertEqual(r["src"][0], ["Eighty composite of Food A, Food B (foodpipe sources)", "composite:t"])
        self.assertIn(["DB Food A", "1"], r["src"])                 # the components' own citations stay
        self.assertEqual((r["tier"], r["canonical_id"], r["category"]), ("everyday", "eighty:t", "condiment"))

    def test_a_curated_food_can_use_an_earlier_one_and_not_a_later_one(self):
        first = spec(key="first", components=[{"food": "a", "g": 100}])
        second = spec(key="second", components=[{"custom": "first", "g": 50}, {"food": "b", "g": 50}])
        out = CU.build_all([first, second], LIVE)
        self.assertAlmostEqual(out[1]["n"]["kcal"], 200, 3)
        with self.assertRaises(CU.CustomFoodError):
            CU.build_all([second, first], LIVE)
        with self.assertRaises(CU.CustomFoodError):
            CU.build_all([spec(components=[{"food": "nope", "g": 10}])], LIVE)

    def test_ids_come_from_the_frozen_registry_and_new_ones_are_added(self):
        r = build(spec())
        reg = {"eighty:t": "test-blend-aaaaaa"}
        X.make_ids([r], reg)
        self.assertEqual(r["id"], "test-blend-aaaaaa")
        other = build(spec(key="u", name="Other blend"))
        X.make_ids([other], reg)
        self.assertTrue(other["id"].startswith("other-blend-"))
        self.assertEqual(reg["eighty:u"], other["id"])
        self.assertEqual(reg["eighty:t"], "test-blend-aaaaaa")      # the issued id did not move


class PromoteOnUse(unittest.TestCase):
    def families(self, files):
        d = tempfile.TemporaryDirectory()
        self.addCleanup(d.cleanup)
        for name, body in files.items():
            (Path(d.name) / name).write_text(body if isinstance(body, str) else json.dumps(body))
        return Path(d.name)

    @staticmethod
    def fam(*ids):
        return {"recipes": [{"id": "r", "ingredients": [{"food": i, "g": 5} for i in ids]}]}

    def test_reads_every_family_file_except_fixtures_and_unreadable_ones(self):
        d = self.families({"a.json": self.fam("x-1", "y-2"), "b.json": self.fam("y-2", "z-3"), "_fixture-mini.json": self.fam("fixture-only"),
                           "broken.json": "{not json", "notes.draft.md": "x"})
        self.assertEqual([p.name for p in CU.family_files(d)], ["a.json", "b.json", "broken.json"])
        used = CU.used_food_ids(d)
        self.assertEqual(used, {"x-1": ["a"], "y-2": ["a", "b"], "z-3": ["b"]})
        self.assertNotIn("fixture-only", used)

    def test_extended_foods_are_promoted_everyday_ones_are_not_and_unknown_ids_are_listed(self):
        used = {"ext-1": ["a"], "eve-2": ["a"], "sumac-aaaaaa": ["a"], "typo": ["b"]}
        ids = {"ext-1": "cf_1", "eve-2": "cf_2", "sumac-aaaaaa": "eighty:sumac"}
        tiers = {"cf_1": "extended", "cf_2": "everyday"}
        pin, promoted, unknown = CU.promotions(used, ids, tiers)
        self.assertEqual(promoted, {"cf_1"})
        self.assertEqual(pin, {"cf_1", "cf_2"})
        self.assertEqual(unknown, ["typo"])          # a curated staple is always everyday and is not an unknown id

    def test_the_real_families_use_only_known_foods(self):
        reg = json.loads((REPO / "pipeline" / "config" / "food_ids.json").read_text())
        known = set(reg.values())
        for fid, fams in CU.used_food_ids(REPO / "content" / "families").items():
            self.assertIn(fid, known, f"{fid} used by {fams} is not a food id")


class RealConfig(unittest.TestCase):
    """config/custom_foods.json against src/data: the recipes still resolve and the shipped bundle holds exactly what they compute."""

    @classmethod
    def setUpClass(cls):
        cls.live, cls.shipped = {}, {}
        for tier in ("everyday", "extended"):
            b = json.loads((REPO / "src" / "data" / f"foods.{tier}.json").read_text())
            for row in b["foods"]:
                n = {k: v for k, v in zip(b["keys"], row[11]) if v is not None}
                src = [[b["dbs"][d] if isinstance(d, int) else d, ref] for d, ref in row[9]]
                cls.live[row[0]] = {"name": row[1], "n": n, "src": src, "estimated": row[10], "tier": tier, "row": row}
        cls.specs = CU.load_specs(REPO / "pipeline" / "config" / "custom_foods.json")
        cls.reg = json.loads((REPO / "pipeline" / "config" / "food_ids.json").read_text())

    def curated(self):
        base = {i: r for i, r in self.live.items() if not r["src"][0][1].startswith("composite:")}
        return CU.build_all(self.specs, base)

    def test_the_staples_writers_asked_for_are_all_there(self):
        keys = {s["key"] for s in self.specs}
        for k in ("sumac", "za-atar", "baharat", "chaat-masala", "kala-namak", "amchur", "ajwain", "kasuri-methi", "kashmiri-chili-powder",
                  "gochujang", "gochugaru", "doenjang", "berbere", "ras-el-hanout", "pomegranate-molasses", "tamarind-paste", "labneh"):
            self.assertIn(k, keys)

    def test_every_recipe_resolves_and_every_value_is_estimated_and_cited(self):
        for r in self.curated():
            self.assertTrue(r["src"][0][0].startswith("Eighty composite of ") and r["src"][0][0].endswith(" (foodpipe sources)"), r["name"])
            self.assertEqual(set(r["estimated"]), set(r["n"]), r["name"])
            self.assertIn(r["category"], X.CATEGORIES)
            self.assertTrue(set(r["tags"]) <= set(X.TAGS))
            self.assertGreaterEqual(r["n"]["kcal"], 0)
            self.assertTrue(r["spec"]["recipe"] and r["spec"]["components"], r["name"])

    def test_ids_are_frozen_in_the_registry_and_the_bundle_holds_the_computed_values(self):
        for r in self.curated():
            cid = "eighty:" + r["spec"]["key"]
            self.assertIn(cid, self.reg, "run python3 pipeline/consumer/build.py to issue the id")
            shipped = self.live[self.reg[cid]]
            self.assertEqual(shipped["tier"], "everyday")
            self.assertEqual(shipped["name"], r["name"])
            self.assertEqual(set(shipped["n"]), set(r["n"]), r["name"])
            for k, v in r["n"].items():
                self.assertAlmostEqual(shipped["n"][k], v, delta=max(0.003 * abs(v), 0.01), msg=f"{r['name']} {k}")

    def test_nothing_is_filled_that_cannot_be_defended(self):
        by_key = {r["spec"]["key"]: r for r in self.curated()}
        self.assertEqual(set(by_key["sumac"]["n"]), {"kcal", "protein", "carbs", "fiber", "fat"})
        self.assertEqual(set(by_key["ajwain"]["n"]), {"kcal", "protein", "carbs", "fat"})
        self.assertEqual(by_key["kala-namak"]["n"]["kcal"], 0)
        self.assertGreater(by_key["kala-namak"]["n"]["sodium"], 30000)
        for k in ("vitC", "folate"):
            for key in ("amchur", "kasuri-methi", "pomegranate-molasses", "tamarind-paste"):
                self.assertNotIn(k, by_key[key]["n"], key)
        lab = by_key["labneh"]["n"]
        gy = self.live[next(i for i, v in self.live.items() if v["name"] == "Greek yogurt, plain, whole milk")]["n"]
        self.assertGreater(lab["protein"], gy["protein"])             # strained: more protein and fat per 100 g, less lactose
        self.assertGreater(lab["fat"], gy["fat"])
        self.assertLess(lab["carbs"], gy["carbs"] * 1.4)
        self.assertNotIn("potassium", lab)

    def test_sanity_of_the_estimates_against_what_the_foods_are(self):
        by_key = {r["spec"]["key"]: r["n"] for r in self.curated()}
        self.assertTrue(180 < by_key["gochujang"]["kcal"] < 230)
        self.assertTrue(1500 < by_key["gochujang"]["sodium"] < 3500)
        self.assertTrue(2500 < by_key["za-atar"]["sodium"] < 5000)
        self.assertTrue(40 < by_key["pomegranate-molasses"]["carbs"] < 80)
        for k, n in by_key.items():            # energy within 20 % of the macros wherever both exist
            if all(x in n for x in ("protein", "fat", "carbs")) and n["kcal"] > 50:
                fib = n.get("fiber", 0)
                atw = 4 * n["protein"] + 9 * n["fat"] + 4 * (n["carbs"] - fib) + 2 * fib
                self.assertLess(abs(n["kcal"] - atw) / atw, 0.20, k)


if __name__ == "__main__":
    unittest.main()
