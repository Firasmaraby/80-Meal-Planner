import unittest

import helpers  # noqa: F401
from stages.names import (build_review, canon_text, clean_names, key_tokens, load_overrides, load_rules, parse_name,
                          review_jsonl)

R = load_rules()

# (raw source description, expected cleaned display name, expected category)
CASES = [
    # --- USDA SR style
    ("Chicken, broilers or fryers, breast, meat only, cooked, roasted", "Chicken breast, roasted", "poultry"),
    ("Chicken, broilers or fryers, thigh, meat and skin, raw", "Chicken thigh, with skin, raw", "poultry"),
    ("Chicken, broilers or fryers, drumstick, meat only, cooked, fried", "Chicken drumstick, fried", "poultry"),
    ("Chicken, ground, raw", "Ground chicken, raw", "poultry"),
    ("Turkey, whole, meat only, roasted", "Turkey, whole, roasted", "poultry"),
    ("Beef, ground, 85% lean meat / 15% fat, raw", "Ground beef, 85% lean, raw", "meat"),
    ("Pork, fresh, loin, whole, separable lean only, raw", "Pork loin, whole, lean only, raw", "meat"),
    ("Pork, cured, bacon, cooked, pan-fried", "Bacon, cured, pan-fried", "meat"),
    ("Fish, salmon, Atlantic, farmed, cooked, dry heat", "Salmon, Atlantic, farmed, cooked", "fish"),
    ("Fish, tuna, fresh, bluefin, raw", "Tuna, bluefin, raw", "fish"),
    ("Crustaceans, shrimp, mixed species, cooked, moist heat", "Shrimp, cooked", "fish"),
    ("Kiwifruit, green, raw", "Kiwifruit, green, raw", "fruit"),
    ("Apples, raw, with skin", "Apples, with skin, raw", "fruit"),
    ("Broccoli, cooked, boiled, drained, without salt", "Broccoli, boiled", "vegetable"),
    ("Sweet potato, raw, unprepared (Includes foods for USDA's Food Distribution Program)", "Sweet potato, raw", "vegetable"),
    ("Beans, kidney, all types, mature seeds, cooked, boiled, without salt", "Kidney beans, boiled", "legume"),
    ("Peas, green, frozen, unprepared", "Green peas, frozen", "vegetable"),
    ("Nuts, almonds, dry roasted, with salt added", "Almonds, with salt added, dry roasted", "nut_seed"),
    ("Cheese, cottage, creamed, large or small curd", "Cottage cheese, creamed, large or small curd", "dairy"),
    ("Cheese, cheddar", "Cheddar cheese", "dairy"),
    ("Oil, olive, salad or cooking", "Olive oil, salad or cooking", "oil_fat"),
    ("Egg, whole, cooked, hard-boiled", "Egg, whole, hard-boiled", "egg"),
    ("Rice, brown, long-grain, cooked", "Brown rice, long-grain, cooked", "grain"),
    ("Bread, whole-wheat, commercially prepared", "Whole-wheat bread", "grain"),
    ("Spices, pepper, black", "Pepper, black", "condiment"),
    ("Beverages, almond milk, unsweetened, shelf stable", "Almond milk, unsweetened, shelf stable", "beverage"),
    ("Snacks, potato chips, plain, salted", "Potato chips, plain, salted", "prepared"),
    ("Game meat, bison, ground, raw", "Ground bison, raw", "meat"),
    ("Soup, chicken noodle, canned, condensed", "Chicken noodle soup, condensed, canned", "prepared"),
    ("Candies, milk chocolate", "Milk chocolate", "sweet"),
    ("Milk, reduced fat, fluid, 2% milkfat, with added vitamin A and vitamin D",
     "Milk, reduced fat, 2% milkfat, with added vitamin A and vitamin D", "dairy"),
    ("Tuna, light, canned in water, drained solids", "Tuna, light, canned in water", "fish"),
    ("Chickpeas (garbanzo beans, bengal gram), mature seeds, raw", "Chickpeas, raw", "legume"),
    # --- CNF / CoFID / FNDDS style
    ("Banana, raw", "Banana, raw", "fruit"),
    ("Salmon, Atlantic, farmed, raw", "Salmon, Atlantic, farmed, raw", "fish"),
    ("Yoghurt, plain, low fat, 12 grams protein per 8 ounce", "Yoghurt, plain, low fat", "dairy"),
    ("Broccoli, boiled in unsalted water", "Broccoli, boiled", "vegetable"),
    ("Chicken, broiler, breast, meat only, roasted", "Chicken breast, roasted", "poultry"),
]


class NameCleaning(unittest.TestCase):
    def test_examples(self):
        self.assertGreaterEqual(len(CASES), 25)
        for raw, name, cat in CASES:
            with self.subTest(raw=raw):
                r = parse_name(raw, R)
                self.assertEqual(r["name"], name)
                self.assertEqual(r["category"], cat)
                self.assertGreaterEqual(r["conf"], R.review_threshold, r["reasons"])

    def test_abbreviated_uppercase_sources(self):
        r = parse_name("CHICKEN,BROILERS OR FRYERS,BREAST,MEAT ONLY,CKD,RSTD", R, abbreviated=True)
        self.assertEqual(r["name"], "Chicken breast, roasted")
        self.assertEqual(parse_name("APPLES,RAW,WITH SKIN", R, abbreviated=True)["name"], "Apples, with skin, raw")
        self.assertEqual(parse_name("BEANS,SNAP,GRN,CND,REG PK,DRND SOL", R, abbreviated=True)["name"][:10], "Snap beans")

    def test_state_is_kept_and_last(self):
        self.assertTrue(parse_name("Beans, kidney, raw", R)["name"].endswith(", raw"))
        self.assertTrue(parse_name("Broccoli, raw", R)["name"].endswith("raw"))
        a = parse_name("Chicken, breast, raw", R)["name"]
        b = parse_name("Chicken, breast, roasted", R)["name"]
        self.assertNotEqual(a, b)

    def test_boilerplate_removed(self):
        for junk in ("NFS", "meat only", "broilers or fryers", "commercial", "includes USDA commodity"):
            r = parse_name(f"Chicken, breast, {junk}, raw", R)
            self.assertNotIn(junk.lower(), r["name"].lower())

    def test_aliases(self):
        a = parse_name("Courgette, raw", R)["aliases"]
        self.assertIn("zucchini", a)
        a = parse_name("Chickpeas, raw", R)["aliases"]
        self.assertIn("garbanzo", " ".join(a))
        a = parse_name("Kiwifruit, green, raw", R)["aliases"]
        self.assertIn("kiwi", a)
        a = parse_name("Chicken, broilers or fryers, breast, meat only, cooked, roasted", R)["aliases"]
        self.assertIn("chicken breast", a)
        self.assertIn("chicken", a)                               # base noun
        a = parse_name("Prawns, raw", R)["aliases"]
        self.assertIn("shrimp", a)
        self.assertIn("eggplant", parse_name("Aubergine, raw", R)["aliases"])
        self.assertIn("porridge oats", parse_name("Oats, dry", R)["aliases"])
        self.assertIn("whole milk", parse_name("Milk, whole", R)["aliases"])
        self.assertIn("banana", parse_name("Bananas, raw", R)["aliases"])
        for alias in parse_name("Bananas, raw", R)["aliases"]:
            self.assertEqual(alias, alias.lower())

    def test_synonym_canonicalisation_for_dedupe(self):
        self.assertEqual(key_tokens("Courgette, raw", R), key_tokens("Zucchini, raw", R))
        self.assertEqual(key_tokens("Yoghurt, plain", R), key_tokens("Yogurt, plain", R))
        self.assertEqual(key_tokens("Prawns", R), key_tokens("Shrimp", R))
        self.assertEqual(key_tokens("Bananas", R), key_tokens("Banana", R))
        # coriander seed must NOT become cilantro
        self.assertNotEqual(key_tokens("Coriander seed", R), key_tokens("Cilantro", R))
        self.assertEqual(key_tokens("Coriander leaves", R), key_tokens("Cilantro", R))

    def test_tags(self):
        self.assertIn("fatty_fish", parse_name("Fish, salmon, Atlantic, wild, raw", R)["tags"])
        self.assertIn("leafy_green", parse_name("Spinach, raw", R)["tags"])
        self.assertIn("whole_grain", parse_name("Rice, brown, cooked", R)["tags"])
        self.assertIn("fermented", parse_name("Yogurt, plain", R)["tags"])
        self.assertIn("processed", parse_name("Sausage, pork, cooked", R)["tags"])
        self.assertEqual(parse_name("Apples, raw", R)["tags"], [])

    def test_low_confidence_is_flagged_and_exported_for_review(self):
        weird = parse_name("Pommes de terre, bouillies / cuites à l'eau", R)
        self.assertLess(weird["conf"], R.review_threshold)
        self.assertIn("category_unknown", weird["reasons"])
        items = helpers.make_foods([
            {"source": "s", "source_id": "1", "raw_name": "Pommes de terre, bouillies / cuites à l'eau", "kcal": 80},
            {"source": "s", "source_id": "2", "raw_name": "Banana, raw", "kcal": 89},
        ])
        review = build_review(items, R.review_threshold)
        self.assertEqual(list(review["id"]), ["s:1"])
        line = review_jsonl(review).strip()
        import json
        obj = json.loads(line)
        self.assertEqual(set(obj) >= {"id", "raw_name", "proposed_name", "category"}, True)

    def test_overrides_replace_name_and_category(self):
        import json, tempfile, os
        items = helpers.make_foods([{"source": "s", "source_id": "1", "raw_name": "Pommes de terre, bouillies", "kcal": 80}])
        with tempfile.TemporaryDirectory() as d:
            p = os.path.join(d, "o.jsonl")
            with open(p, "w", encoding="utf-8") as fh:
                fh.write(json.dumps({"id": "s:1", "proposed_name": "Potato, boiled", "category": "vegetable"}) + "\n")
            out = clean_names(items.drop(columns=["name"]), R, overrides=load_overrides(p))
        self.assertEqual(out["name"].iloc[0], "Potato, boiled")
        self.assertEqual(out["category"].iloc[0], "vegetable")
        self.assertEqual(out["name_conf"].iloc[0], 1.0)


if __name__ == "__main__":
    unittest.main()
