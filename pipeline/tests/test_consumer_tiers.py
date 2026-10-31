"""consumer.tiers / curate: hidden rules (baby, supplement, non-food, no kcal), extended-only rules, collapse of
singular/plural duplicates (region priority, citations merged), head canonicalisation, everyday selection, alias application."""
import unittest
import zlib

import helpers  # noqa: F401
from consumer import adapter as A, aliases as AL, curate as C, names_en as N, rank as R, tiers as T

LEX = N.Lexicon(N.load_heads())


def rec(name, source="cnf", group="vegetables", state="raw", kcal=40.0, cid=None, n_extra=None, src=None, **kw):
    n = {"kcal": kcal, "protein": 1.0, "vitC": 5.0, "vitK": 3.0, "iron": 0.5, "calcium": 10.0, "b6": 0.1, "folate": 10.0,
         "potassium": 100.0, "magnesium": 10.0, "fiber": 1.0}
    if n_extra:
        n.update(n_extra)
    if kcal is None:
        n.pop("kcal")
    cid = cid or f"cf_{zlib.crc32(f"{name}|{source}".encode()) % 10**8}"
    r = {"canonical_id": cid, "food_id": f"{source}:{cid}", "source_id": source, "name_en": name, "name_original": name, "food_group": group,
         "state": state, "country": "CA", "n": n, "estimated": [], "notes": [], "src": src or [[f"DB {source}", cid]], "n_sources": 1, "n_members": 1}
    r.update(kw)
    return C.enrich(r, LEX)


class Hidden(unittest.TestCase):
    def reason(self, name, **kw):
        return T.hidden_reason(rec(name, **kw))

    def test_baby_foods(self):
        self.assertEqual(self.reason("Babyfood, cereal, rice", group="baby_foods"), "baby_food")
        self.assertEqual(self.reason("Infant formula, powder"), "baby_food")
        self.assertEqual(self.reason("Toddler snack puffs"), "baby_food")
        self.assertEqual(self.reason("Rice cereal for weaning"), "baby_food")

    def test_supplements_and_shakes(self):
        for n in ("Beverages, ABBOTT, ENSURE, Nutritional Shake", "Protein powder, whey based", "Energy drink, Citrus", "Sports drink, orange flavor",
                  "Meal replacement bar", "Formulated bar, Snickers Marathon", "Dietary supplement, creatine"):
            self.assertEqual(self.reason(n, group="beverages"), "supplement", n)

    def test_non_food_items(self):
        for n in ("Oil, industrial, soy", "Shortening, industrial, for frying", "Dog food, dry", "Gelatin capsules", "Margarine, for food service",
                  "Brewer's yeast tablets"):
            self.assertEqual(self.reason(n, group="fats_oils"), "non_food", n)

    def test_no_kcal(self):
        self.assertEqual(self.reason("Mystery vegetable", kcal=None), "no_kcal")
        self.assertIsNone(self.reason("Water, tap", kcal=0.0, group="beverages"))      # 0 kcal is a value; only a missing one is hidden

    def test_ordinary_foods_are_not_hidden(self):
        for n in ("Apples, raw", "Chicken, breast, roasted", "Greek yogurt, plain", "Soy milk, unsweetened"):
            self.assertIsNone(self.reason(n))


class ExtendedOnly(unittest.TestCase):
    def test_reasons(self):
        self.assertIn("branded", T.extended_reasons(rec("Cereal, ready to eat, Kashi: GoLean Crunch, Kashi", group="grains_cereals")))
        self.assertIn("branded", T.extended_reasons(rec("McDONALD'S, Big Mac", group="mixed_dishes")))
        self.assertIn("heritage_regional", T.extended_reasons(rec("Fish, salmon, king (chinook), raw (Alaska Native)", group="fish_seafood")))
        self.assertIn("fast_food", T.extended_reasons(rec("Fast foods, hamburger, large", group="mixed_dishes")))
        self.assertIn("game_meat", T.extended_reasons(rec("Game meat, bison, ground, raw", group="meat_poultry")))
        self.assertIn("organ_meat", T.extended_reasons(rec("Beef, tongue, raw", group="meat_poultry")))
        self.assertEqual(T.extended_reasons(rec("Beef, liver, braised", group="meat_poultry")), [])        # liver is fine
        self.assertEqual(T.extended_reasons(rec("Apples, raw")), [])

    def test_sparse_records_are_extended_unless_on_the_list(self):
        sparse = rec("Obscure tuber, raw", cid="cf_sp1", n_extra=None)
        sparse["n"] = {"kcal": 50.0, "protein": 1.0}
        sparse["n_board"] = T.count_board(sparse["n"])
        apple = rec("Apples, raw", cid="cf_sp2")
        apple["n"] = {"kcal": 52.0}
        apple["n_board"] = 0
        C.prepare([sparse, apple], LEX)
        C.curate([sparse, apple], LEX)
        self.assertEqual(sparse["tier"], "extended")
        self.assertIn("sparse_data", sparse["ext_all"])
        self.assertNotIn("sparse_data", apple["ext_all"])           # apple is on the list


class Collapse(unittest.TestCase):
    def test_singular_plural_duplicates_become_one_food_with_merged_citations(self):
        a = rec("Blueberries, raw", source="usda_fdc_sr_legacy", group="fruits", cid="cf_b1", src=[["USDA SR", "1"]])
        b = rec("Blueberry, raw", source="cnf", group="fruits", cid="cf_b2", src=[["CNF", "2"]])
        c = rec("Blueberry, raw", source="ciqual", group="fruits", cid="cf_b3", src=[["CIQUAL", "3"]])
        d = rec("Blueberry, dried", source="cnf", group="fruits", state="dried", cid="cf_b4")
        recs = [a, b, c, d]
        C.prepare(recs, LEX)
        out = C.curate(recs, LEX)
        self.assertEqual(out["collapsed"], 2)
        live = [r for r in recs if r["tier"] != "hidden"]
        raw = [r for r in live if r["form"] == "raw"]
        self.assertEqual(len(raw), 1)
        self.assertEqual(raw[0]["canonical_id"], "cf_b2")                       # cnf wins (region priority)
        self.assertEqual({db for db, _ in raw[0]["src"]}, {"CNF", "USDA SR", "CIQUAL"})
        self.assertEqual(len(live), 2)                                          # the dried one is a different food
        self.assertEqual({r["head"] for r in recs}, {"blueberries"})            # one head spelling for the list entry

    def test_region_priority_order(self):
        recs = [rec("Plum, raw", source=s, group="fruits", cid=f"cf_p{i}") for i, s in
                enumerate(["ciqual", "usda_fdc_foundation", "usda_fdc_sr_legacy", "cnf"])]
        C.prepare(recs, LEX)
        C.curate(recs, LEX)
        self.assertEqual([r["canonical_id"] for r in recs if r["tier"] != "hidden"], ["cf_p3"])

    def test_hyphen_and_style_variants_collapse(self):
        a = rec("Greek yogurt-style, plain", source="cofid", group="dairy", state="unknown", cid="cf_y1")
        b = rec("Greek yogurt style, plain", source="ciqual", group="dairy", state="unknown", cid="cf_y2")
        C.prepare([a, b], LEX)
        C.curate([a, b], LEX)
        self.assertEqual(sorted(r["tier"] == "hidden" for r in (a, b)), [False, True])

    def test_different_names_do_not_collapse(self):
        a = rec("Apple, raw, with skin", group="fruits", cid="cf_a1")
        b = rec("Apple, raw, without skin", group="fruits", cid="cf_a2")
        C.prepare([a, b], LEX)
        self.assertEqual(C.curate([a, b], LEX)["collapsed"], 0)


    def test_same_name_across_categories_is_one_food_when_energy_agrees(self):
        a = rec("Hummus", source="cnf", group="legumes", state="unknown", kcal=237.0, cid="cf_h1")
        b = rec("Hummus", source="swiss_fcdb", group="mixed_dishes", state="unknown", kcal=204.0, cid="cf_h2")
        C.prepare([a, b], LEX)
        C.curate([a, b], LEX)
        self.assertEqual((a["tier"] != "hidden", b["tier"] == "hidden"), (True, True))
        self.assertEqual(b["duplicate_of"], "cf_h1")

    def test_same_name_but_different_food_is_kept_and_labelled_by_country(self):
        a = rec("Coconut milk", source="swiss_fcdb", group="dairy", state="unknown", kcal=214.0, cid="cf_c1")
        b = rec("Coconut milk", source="cofid", group="nuts_seeds", state="unknown", kcal=22.0, cid="cf_c2")
        C.prepare([a, b], LEX)
        for _ in range(2):                                   # curate runs twice in a build; names must not grow
            C.curate([a, b], LEX)
        self.assertEqual(sorted(r["name"] for r in (a, b)), ["Coconut milk", "Coconut milk (UK)"])


class Aliases(unittest.TestCase):
    def test_alias_rehead_keeps_natural_head_searchable(self):
        r = rec("Sesame butter, tahini, unroasted kernels", group="nuts_seeds", state="unknown", cid="cf_t1")
        old = r["head"]
        self.assertEqual(AL.apply_aliases([r], {"tahini": ["cf_t1"]}), 1)
        self.assertEqual(r["head"], "tahini")
        self.assertIn(old, r["aliases"])

    def test_candidates_and_confirmation(self):
        recs = [rec("Cumin seed", group="herbs_spices_condiments", state="unknown", cid="cf_c1"),
                rec("Cumin seed bread", group="grains_cereals", cid="cf_c2"),
                rec("Apples, raw", group="fruits", cid="cf_c3")]
        for r in recs:
            r["hidden_reason"] = None
            r["score"] = 50.0
        self.assertEqual(AL.confirmed("cumin", recs), ["cf_c1"])        # bread has a product word the head lacks
        cands = AL.candidates("cumin", recs)
        self.assertEqual([c["id"] for c in cands][:2], ["cf_c1", "cf_c2"])
        self.assertEqual(set(cands[0]), {"id", "name", "category"})


class Everyday(unittest.TestCase):
    def test_best_per_head_form_and_cap(self):
        cands = []
        for i in range(12):
            cands.append({"canonical_id": f"a{i}", "head": "apple", "form": "raw", "score": 90 - i, "n": {"kcal": 50 + 10 * i}})
        cands.append({"canonical_id": "dr", "head": "apple", "form": "dried", "score": 60, "n": {"kcal": 240}})
        cands.append({"canonical_id": "x", "head": "zzz", "form": "raw", "score": 70, "n": {"kcal": 10}})
        entries = [N.HeadEntry("apple", "raw")]
        chosen = T.select_everyday(cands, entries, set(), target=5)
        self.assertEqual(chosen["a0"], "common_preferred_form")
        self.assertEqual(chosen["dr"], "common_other_form")
        self.assertLessEqual(sum(1 for c in chosen if c.startswith("a")), T.MAX_PER_HEAD)
        self.assertIn("x", chosen)          # filled from the top-ranked rest

    def test_pinned_are_everyday(self):
        cands = [{"canonical_id": "p", "head": "kale", "form": "raw", "score": 5, "n": {"kcal": 30}}]
        self.assertEqual(T.select_everyday(cands, [], {"p"}, target=0)["p"], "legacy_pin")


if __name__ == "__main__":
    unittest.main()
