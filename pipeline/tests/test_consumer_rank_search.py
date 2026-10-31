"""Ranking rules (preferred forms / words) and the search rules (head grouping, exact head first, everyday first, composite
demotion), then the real top queries against the built bundles when they exist."""
import json
import unittest

import helpers  # noqa: F401
import search_check as SC
from consumer import curate as C, names_en as N, rank as R
from test_consumer_tiers import rec

LEX = N.Lexicon(N.load_heads())
SRC_DIR = helpers.REPO_ROOT / "src" / "data"


def ranked(records):
    C.prepare(records, LEX)
    C.curate(records, LEX)
    return sorted((r for r in records if r["tier"] != "hidden"), key=lambda r: -r["score"])


class Preferences(unittest.TestCase):
    def test_skinless_lean_poultry_before_with_skin_and_products(self):
        rs = ranked([
            rec("Chicken, broilers or fryers, breast, meat and skin, cooked, roasted", group="meat_poultry", state="roasted_baked", cid="c1"),
            rec("Chicken, broilers or fryers, breast, meat only, cooked, roasted", group="meat_poultry", state="roasted_baked", cid="c2"),
            rec("Chicken breast, skinless, boneless, roasted", group="meat_poultry", state="roasted_baked", cid="c3"),
            rec("Chicken breast with broccoli and cheese stuffing, frozen", group="meat_poultry", state="frozen", cid="c4"),
            rec("Chicken breast tender, breaded, frozen, cooked", group="meat_poultry", state="frozen", cid="c5"),
        ])
        order = [r["canonical_id"] for r in rs]
        self.assertIn(order[0], {"c2", "c3"})
        self.assertLess(order.index("c3"), order.index("c1"))
        self.assertLess(order.index("c2"), order.index("c1"))
        self.assertGreater(order.index("c4"), order.index("c1"))
        self.assertGreater(order.index("c5"), order.index("c1"))

    def test_rice_cooked_white_first(self):
        rs = ranked([
            rec("Rice, white, long-grain, regular, raw, enriched", group="grains_cereals", state="unknown", cid="r1"),
            rec("Rice, white, long-grain, regular, cooked, enriched", group="grains_cereals", state="cooked_moist", cid="r2"),
            rec("Rice, brown, long-grain, cooked", group="grains_cereals", state="cooked_moist", cid="r3"),
            rec("Rice, white, glutinous, cooked", group="grains_cereals", state="cooked_moist", cid="r4"),
        ])
        rice = [r for r in rs if r["head"] == "rice"]
        self.assertEqual(rice[0]["canonical_id"], "r2")

    def test_atlantic_salmon_before_pacific_species(self):
        rs = ranked([
            rec("Fish, salmon, chum, raw", group="fish_seafood", cid="s1"),
            rec("Fish, salmon, pink, raw", group="fish_seafood", cid="s2"),
            rec("Fish, salmon, sockeye, cooked, dry heat", group="fish_seafood", state="cooked_moist", cid="s3"),
            rec("Fish, salmon, Atlantic, farmed, cooked, dry heat", group="fish_seafood", state="cooked_moist", cid="s4"),
            rec("Fish, salmon, Atlantic, wild, raw", group="fish_seafood", cid="s5"),
        ])
        self.assertTrue({r["head"] for r in rs} == {"salmon"})
        self.assertIn(rs[0]["canonical_id"], {"s4", "s5"})
        self.assertIn(rs[1]["canonical_id"], {"s4", "s5"})

    def test_cow_milk_2pct_or_whole_before_other_milks(self):
        rs = ranked([
            rec("Milk, reduced fat, fluid, 2% milkfat", group="dairy", state="unknown", cid="m1"),
            rec("Milk, whole, 3.25% milkfat", group="dairy", state="unknown", cid="m2"),
            rec("Milk, goat, fluid, with added vitamin D", group="dairy", state="unknown", cid="m3"),
            rec("Milk, chocolate, fluid, commercial, reduced fat", group="dairy", state="unknown", cid="m4"),
            rec("Milk, nonfat, fluid", group="dairy", state="unknown", cid="m5"),
            rec("Milk, dry, whole, with added vitamin D", group="dairy", state="dried", cid="m6"),
        ])
        milk = [r for r in rs if r["head"] == "milk"]
        self.assertIn(milk[0]["canonical_id"], {"m1", "m2"})
        self.assertIn(milk[1]["canonical_id"], {"m1", "m2"})

    def test_category_forms_come_from_config(self):
        p = R.Prefs()
        self.assertEqual(p.forms_for("anything", "fruit"), ["raw"])
        self.assertEqual(p.forms_for("anything", "poultry"), ["cooked"])
        self.assertEqual(p.forms_for("rice", "grain"), ["cooked"])
        self.assertEqual(p.forms_for("oats", "grain"), ["dried", "cooked"])      # head-specific override

    def test_generic_avoid_words_do_not_hit_a_head_that_contains_them(self):
        p = R.Prefs()
        self.assertLess(p.word_adjust("Pizza dough, baked", "pizza", "prepared"), 0)
        self.assertEqual(p.word_adjust("Pizza dough, baked", "pizza dough", "prepared"), 0)

    def test_dish_is_penalised_for_a_plain_head(self):
        plain = rec("Apples, raw", group="fruits", cid="d1")
        dish = rec("Apples, raw", group="mixed_dishes", cid="d2")
        dish["form"] = "dish"
        dish["category"] = "fruit"
        pos = C.common_positions(LEX)
        self.assertGreater(R.score(plain, pos, len(pos)), R.score(dish, pos, len(pos)))


def food(id, name, head, tier="extended", rank=50, form="raw", aliases=None, tags=None):
    return {"id": id, "name": name, "head": head, "tier": tier, "rank": rank, "form": form, "aliases": aliases or [], "tags": tags or []}


class SearchRules(unittest.TestCase):
    FOODS = [
        food("a", "Apple, raw", "apple", "everyday", 95),
        food("a2", "Apple, dried", "apple", "everyday", 80, "dried"),
        food("a3", "Apple, Gala, raw", "apple", "extended", 40),
        food("b", "Apple pie", "apple pie", "everyday", 70, "dish"),
        food("c", "Pineapple, raw", "pineapple", "everyday", 90),
        food("d", "Applesauce", "applesauce", "everyday", 75, "product"),
        food("m1", "Milk, 2% fat", "milk", "everyday", 90, "product"),
        food("m2", "Milk chocolate", "milk chocolate", "extended", 60, "product"),
        food("m3", "V8 Splash Juice Drinks, Berry Blast", "v8 splash juice", "extended", 0, "product", tags=["processed"]),
        food("m4", "Cocoa beverage mix, milk added", "cocoa beverage", "extended", 30, "product", aliases=["milk"]),
        food("m5", "Pizza dough", "pizza dough", "extended", 20, "product", aliases=["milk"]),
    ]

    def test_exact_head_beats_prefix_and_contains(self):
        names = [h["food"]["name"] for h in SC.FoodSearch(self.FOODS).search_grouped("apple", 6)]
        self.assertEqual(names[0], "Apple, raw")
        self.assertLess(names.index("Apple pie"), names.index("Pineapple, raw"))

    def test_results_are_grouped_by_head_and_best_member_is_shown(self):
        hits = SC.FoodSearch(self.FOODS).search_grouped("apple", 10)
        heads = [h["food"]["head"] for h in hits]
        self.assertEqual(len(heads), len(set(heads)))
        top = hits[0]
        self.assertEqual({f["id"] for f in top["group"]}, {"a", "a2", "a3"})
        self.assertEqual(top["group"][0]["id"], "a")

    def test_everyday_beats_extended_inside_a_class(self):
        foods = [food("x", "Kale chips", "kale chips", "extended", 90), food("y", "Kale stems", "kale stems", "everyday", 10)]
        self.assertEqual(SC.FoodSearch(foods).search_grouped("kale", 2)[0]["food"]["id"], "y")

    def test_plain_head_query_keeps_drinks_mixes_and_brands_out_of_the_top(self):
        names = [h["food"]["name"] for h in SC.FoodSearch(self.FOODS).search_grouped("milk", 3)]
        self.assertEqual(names[0], "Milk, 2% fat")
        for bad in ("V8 Splash Juice Drinks, Berry Blast", "Cocoa beverage mix, milk added", "Pizza dough"):
            self.assertNotIn(bad, names[:2])

    def test_asking_for_the_composite_word_lifts_the_demotion(self):
        names = [h["food"]["name"] for h in SC.FoodSearch(self.FOODS).search_grouped("pizza dough", 2)]
        self.assertEqual(names[0], "Pizza dough")

    def test_foods_without_head_behave_as_before(self):
        foods = [{"id": "1", "name": "Bananas, raw", "aliases": ["banana"], "rank": 90}, {"id": "2", "name": "Banana bread", "rank": 40}]
        self.assertEqual(SC.FoodSearch(foods).search("banana")[0][0]["id"], "1")

    def test_multi_word_query_prefers_name_that_starts_with_it(self):
        foods = [food("j", "Jelly, made with skim milk", "jelly", "everyday", 70, "product"),
                 food("s", "Skim milk, UHT", "milk", "extended", 30, "product")]
        self.assertEqual(SC.FoodSearch(foods).search_grouped("skim milk", 2)[0]["food"]["id"], "s")

    def test_head_key_comparison_in_the_checker(self):
        res = SC.run_real_checks([food("b", "Blueberry, raw", "blueberry", "everyday", 90)],
                                 [{"q": "blueberries", "head": "blueberries", "form": "raw"}])
        self.assertEqual(res["top1"], 1.0)


@unittest.skipUnless((SRC_DIR / "foods.everyday.json").exists() and (SRC_DIR / "foods.extended.json").exists(), "bundles not built")
class RealBundles(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        foods = SC.decode_bundle(json.loads((SRC_DIR / "foods.everyday.json").read_text(encoding="utf-8")), "everyday")
        foods += SC.decode_bundle(json.loads((SRC_DIR / "foods.extended.json").read_text(encoding="utf-8")), "extended")
        cls.fs = SC.FoodSearch(foods)

    def top(self, q, n=3):
        return [h["food"] for h in self.fs.search_grouped(q, n)]

    def test_chicken_breast_is_plain_cooked_not_with_skin_or_stuffed(self):
        f = self.top("chicken breast")[0]
        self.assertEqual((f["head"], f["form"]), ("chicken breast", "cooked"))
        self.assertNotIn("with skin", f["name"].lower())
        self.assertNotIn("stuffing", f["name"].lower())

    def test_plain_queries_have_no_drinks_dishes_or_brands_in_top3(self):
        # kiwi has a single whole food, so the list may continue with kiwi products; they only come after it
        self.assertEqual(self.top("kiwi")[0]["name"], "Kiwi fruit, raw")
        for q in ("milk", "olive oil", "apple", "banana"):
            for f in self.top(q):
                self.assertNotIn("processed", f["tags"], (q, f["name"]))
                low = f["name"].lower()
                for bad in ("v8", "splash", "cocoa", "dough", "pizza", "mix"):
                    self.assertNotIn(bad, low, (q, f["name"]))

    def test_typo_lookalikes_only_when_nothing_else_matches(self):
        self.assertEqual([f["name"] for f in self.top("feta")][:1], ["Feta cheese"])
        self.assertTrue(all("feta" in f["name"].lower() for f in self.top("feta")), [f["name"] for f in self.top("feta")])
        self.assertTrue(all("chia" in f["name"].lower() for f in self.top("chia")), [f["name"] for f in self.top("chia")])
        self.assertTrue(self.top("appel")[0]["name"].startswith("Apple"))      # a swapped pair of letters is one typo
        self.assertTrue(self.top("brocoli")[0]["name"].startswith("Broccoli"))

    def test_rice_is_cooked_white_first(self):
        f = self.top("rice")[0]
        self.assertEqual((f["head"], f["form"]), ("rice", "cooked"))
        self.assertIn("white", f["name"].lower())

    def test_salmon_is_atlantic_first(self):
        f = self.top("salmon")[0]
        self.assertEqual(f["head"], "salmon")
        self.assertIn("atlantic", f["name"].lower())
        for bad in ("chum", "pink", "sockeye", "coho"):
            self.assertNotIn(bad, f["name"].lower())

    def test_milk_is_cow_2pct_or_whole(self):
        f = self.top("milk")[0]
        self.assertEqual(f["head"], "milk")
        low = f["name"].lower()
        self.assertTrue("2%" in low or "whole" in low, f["name"])
        for bad in ("goat", "sheep", "chocolate", "dry", "powder", "evaporated"):
            self.assertNotIn(bad, low)

    def test_no_singular_plural_duplicates_of_the_same_food(self):
        for q in ("blueberries", "strawberries"):
            names = [f["name"].lower() for f in self.fs_everyday(q)]
            self.assertEqual(len(names), len(set(N.head_key(n) for n in names)), names)

    def fs_everyday(self, q):
        return [f for h in self.fs.search_grouped(q, 3) for f in h["group"] if f["tier"] == "everyday" and f["form"] == "raw"
                and N.head_key(f["head"]) == N.head_key(q)]

    def test_real_queries_meet_targets(self):
        queries = json.loads((helpers.PIPELINE / "config" / "search_queries_real.json").read_text(encoding="utf-8"))
        self.assertEqual(len(queries), 300)
        res = SC.run_real_checks(list(e.food for e in self.fs.entries), queries, 3)
        self.assertGreaterEqual(res["top1"], 0.90, res["fail_top1"][:5])
        self.assertGreaterEqual(res["top3"], 0.97, res["fail_top3"][:5])


if __name__ == "__main__":
    unittest.main()
