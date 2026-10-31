"""consumer.names_en: display names, heads, forms, categories, tags, head normalisation. 45+ real names from foodpipe-v1.0."""
import unittest

import helpers  # noqa: F401
from consumer import names_en as N

LEX = N.Lexicon(N.load_heads())

# (raw foodpipe name_en, expected display name, expected head)
REAL = [
    ("Chicken, broilers or fryers, breast, meat only, cooked, roasted", "Chicken breast, skinless, roasted", "chicken breast"),
    ("Chicken, broiler, breast, meat, roasted", "Chicken breast, skinless, roasted", "chicken breast"),
    ("Chicken, broiler, dark meat and skin, roasted", "Chicken, dark meat, with skin, roasted", "chicken"),
    ("Peas, edible-podded (snow peas), raw", "Snow peas, raw", "snow peas"),
    ("Shrimp or prawn, boiled", "Shrimp, boiled", "shrimp"),
    ("Apples, raw, with skin", "Apple, raw, with skin", "apple"),
    ("Fish, salmon, Atlantic, farmed, cooked, dry heat", "Salmon, Atlantic, farmed, cooked", "salmon"),
    ("Pears, raw, bartlett (Includes foods for USDA's Food Distribution Program)", "Pear, raw, bartlett", "pear"),
    ("Beans, kidney, dark red, mature seeds, boiled, without salt", "Kidney beans, boiled", "kidney beans"),
    ("Cheese, cheddar", "Cheddar cheese", "cheddar cheese"),
    ("Egg, chicken, whole, fresh or frozen, raw", "Egg, whole, raw", "egg"),
    ("Cereals, oats, regular and quick, not fortified, dry", "Oats, regular and quick, dry", "oats"),
    ("Rice, brown, long-grain, cooked", "Brown rice, long-grain, cooked", "brown rice"),
    ("Pork, fresh, loin, tenderloin, separable lean only, cooked, roasted", "Pork tenderloin, lean, roasted", "pork tenderloin"),
    ("Beef, ground, 93% lean meat / 7% fat, raw", "Ground beef, 93% lean, raw", "ground beef"),
    ("Juice, pomegranate", "Pomegranate juice", "pomegranate juice"),
    ("Soup, chicken noodle, canned, condensed, reduced sodium", "Chicken noodle soup, canned, condensed, reduced sodium", "chicken noodle soup"),
    ("Nuts, almonds, dried, unblanched, unroasted", "Almonds, dried, unblanched, unroasted", "almonds"),
    ("Spices, rosemary, dried", "Rosemary, dried", "rosemary"),
    ("Seeds, pumpkin and squash seed kernels, dried", "Pumpkin seeds, dried", "pumpkin seeds"),
    ("Grains, rice, wild, cooked", "Wild rice, cooked", "wild rice"),
    ("Mollusks, oyster, eastern (blue point), wild, breaded and fried", "Oyster, eastern (blue point), wild, breaded and fried", "oyster"),
    ("Candies, chocolate, dark, 70-85% cocoa solids", "Dark chocolate, 70-85% cocoa solids", "dark chocolate"),
    ("Lettuce, cos or romaine, raw", "Romaine lettuce, raw", "romaine lettuce"),
    ("Squash, winter, butternut, raw", "Butternut squash, raw", "butternut squash"),
    ("Squash, summer, zucchini, includes skin, raw", "Zucchini, with skin, raw", "zucchini"),
    ("Peppers, sweet, red, raw", "Red bell pepper, raw", "red bell pepper"),
    ("Beans, snap, green, raw", "Green beans, raw", "green beans"),
    ("Peas, green, raw", "Green peas, raw", "green peas"),
    ("Milk, canned, evaporated", "Evaporated milk", "evaporated milk"),
    ("Oil, olive, salad or cooking", "Olive oil", "olive oil"),
    ("Yogurt, Greek, plain, nonfat", "Greek yogurt, plain, nonfat", "greek yogurt"),
    ("Yogourt (yogurt), Greek style, 2% M.F., plain", "Greek yogurt, 2% fat, plain", "greek yogurt"),
    ("Turkey, all classes, breast, meat only, cooked, roasted", "Turkey breast, skinless, roasted", "turkey breast"),
    ("Lamb, New Zealand, imported, fresh, shoulder, arm, separable lean and fat, raw", "Lamb shoulder arm, New Zealand, lean and fat, raw", "lamb shoulder"),
    ("Soybeans, green (edamame), raw", "Edamame, raw", "edamame"),
    ("Sauce, salsa, ready-to-serve", "Salsa, ready-to-serve", "salsa"),
    ("Pasta, wholemeal wheat flour, dry", "Whole wheat pasta, dry", "whole wheat pasta"),
    ("Bread, whole-wheat, commercially prepared", "Whole wheat bread", "whole wheat bread"),
    ("Kiwifruit, green, peeled, raw", "Kiwifruit, green, peeled, raw", "kiwi"),
    ("Cereals, rice, wild, boiled", "Wild rice, boiled", "wild rice"),
    ("Tuna, light, canned in water, drained solids", "Light tuna, canned in water, drained solids", "tuna"),
    ("Leavening agents, baking soda", "Baking soda", "baking soda"),
    ("Indian, bread, naan", "Naan bread", "naan"),
    ("Cheese, feta", "Feta cheese", "feta cheese"),
    ("Tomatoes, red, ripe, raw, year round average", "Tomato, red, raw", "tomato"),
    ("Broccoli, raw", "Broccoli, raw", "broccoli"),
    ("Spinach, raw", "Spinach, raw", "spinach"),
    ("Lentils, mature seeds, cooked, boiled, without salt", "Lentils, boiled", "lentils"),
    ("Mushrooms, white, raw", "Mushrooms, white, raw", "mushrooms"),
    ("Bananas, raw", "Banana, raw", "banana"),
]


class RealNames(unittest.TestCase):
    def test_at_least_forty_real_examples(self):
        self.assertGreaterEqual(len(REAL), 40)

    def test_display_name_and_head(self):
        bad = []
        for raw, name, head in REAL:
            r = N.build_name(raw, "", LEX)
            if (r.name, r.head) != (name, head):
                bad.append((raw, (r.name, r.head), (name, head)))
        # keep the failure message useful but allow at most a handful of cosmetic differences to be tuned in one place
        self.assertEqual(bad, [], "\n" + "\n".join(map(str, bad)))

    def test_boilerplate_never_leaks(self):
        for raw, _, _ in REAL:
            n = N.build_name(raw, "", LEX).name
            for junk in ("NFS", "UPC", "meat only", "broilers", "Includes", "dry heat", "moist heat", "commercial"):
                self.assertNotIn(junk, n)


class Heads(unittest.TestCase):
    def test_head_key_collapses_plural_and_punctuation(self):
        self.assertEqual(N.head_key("Blueberries"), N.head_key("blueberry"))
        self.assertEqual(N.head_key("Strawberries"), N.head_key("Strawberry"))
        self.assertEqual(N.head_key("Greek yogurt-style"), N.head_key("Greek yogurt style"))
        self.assertEqual(N.head_key("Greek yogurt-style"), N.head_key("greek yogurt"))
        self.assertEqual(N.head_key("whole-wheat bread"), N.head_key("Whole wheat bread"))
        self.assertNotEqual(N.head_key("apple"), N.head_key("pineapple"))

    def test_head_is_lowercase_short_and_canonical(self):
        for raw in ("Atlantic salmon, farmed, baked", "Sockeye salmon, canned", "Green onion (cebolinha), raw", "Oatmeal, reduced-calorie",
                    "Whole milk, pasteurized", "Pearl barley, boiled", "Naan bread"):
            h = N.build_name(raw, "", LEX).head
            self.assertEqual(h, h.lower())
            self.assertLessEqual(len(h.split()), 3)
        self.assertEqual(N.build_name("Atlantic salmon, farmed, baked", "", LEX).head, "salmon")
        self.assertEqual(N.build_name("Green onion (cebolinha), raw", "", LEX).head, "scallion")
        self.assertEqual(N.build_name("Whole milk, pasteurized", "", LEX).head, "milk")
        self.assertEqual(N.build_name("Pearl barley, boiled", "", LEX).head, "barley")

    def test_head_ignores_with_clause(self):
        self.assertEqual(N.build_name("Boulette d'Avesnes cheese from cow's milk", "", LEX).head, "boulette d'avesnes cheese")


class FormCategoryTags(unittest.TestCase):
    def test_forms(self):
        f = N.form_of
        self.assertEqual(f("raw", "Apple, raw", "fruit"), "raw")
        self.assertEqual(f("roasted_baked", "Chicken breast, roasted", "poultry"), "cooked")
        self.assertEqual(f("unknown", "Spinach, baby", "vegetable"), "raw")
        self.assertEqual(f("unknown", "Orange juice", "fruit"), "juice")
        self.assertEqual(f("canned", "Tuna, canned", "fish"), "canned")
        self.assertEqual(f("dried", "Lentils, dry", "legume"), "dried")
        self.assertEqual(f("unknown", "Beef stew", "prepared"), "dish")
        self.assertEqual(f("unknown", "Raisin, seedless (sultana)", "fruit"), "dried")
        self.assertEqual(f("unknown", "Hummus", "legume"), "product")
        self.assertEqual(f("unknown", "Almonds, dried, unblanched, unroasted", "nut_seed"), "raw")

    def test_category_mapping(self):
        c = N.category_of
        self.assertEqual(c("meat_poultry", "Chicken breast"), "poultry")
        self.assertEqual(c("meat_poultry", "Turkey, ground"), "poultry")
        self.assertEqual(c("meat_poultry", "Beef, ground"), "meat")
        self.assertEqual(c("snacks", "Potato chips"), "sweet")
        self.assertEqual(c("soups_sauces", "Tomato soup"), "prepared")
        self.assertEqual(c("fish_seafood", "Salmon"), "fish")
        self.assertIsNone(c("baby_foods", "Babyfood, cereal"))
        self.assertEqual(c("legumes", "Soy milk, unsweetened"), "beverage")

    def test_tags(self):
        self.assertIn("fatty_fish", N.tags_of("Salmon, cooked", "fish", 0.5, False))
        self.assertIn("leafy_green", N.tags_of("Spinach, raw", "vegetable", 2.7, False))
        self.assertIn("plant_iron", N.tags_of("Spinach, raw", "vegetable", 2.7, False))
        self.assertNotIn("plant_iron", N.tags_of("Kale, raw", "vegetable", 1.0, False))
        self.assertIn("whole_grain", N.tags_of("Oats, dry", "grain", 4.0, False))
        self.assertIn("processed", N.tags_of("Cereal, Kellogg's", "grain", 2.0, True))
        self.assertEqual(N.tags_of("Apple, raw", "fruit", 0.1, False), [])

    def test_branded_detection(self):
        for raw in ("Soup, HEALTHY CHOICE Chicken Noodle Soup, canned", "McDONALD'S, Big Mac", "Cereal, ready to eat, Special K: Almond Vanilla, Kellogg's",
                    "Oscar Mayer, Chicken Breast (honey glazed)", "Pizza Hut 12\" Cheese Pizza"):
            self.assertTrue(N.branded(raw), raw)
        for raw in ("Chicken, broilers or fryers, breast, raw", "Apples, raw, with skin", "Cheese, cheddar", "Oats, dry (BBQ)"):
            self.assertFalse(N.branded(raw), raw)

    def test_singularisation_keeps_natural_plurals(self):
        self.assertEqual(N.singular_phrase("Apples"), "Apple")
        self.assertEqual(N.singular_phrase("Bananas"), "Banana")
        self.assertEqual(N.singular_phrase("Eggs"), "Egg")
        for keep in ("Oats", "Lentils", "Chickpeas", "Strawberries", "Almonds", "Hummus", "Molasses"):
            self.assertEqual(N.singular_phrase(keep), keep)


if __name__ == "__main__":
    unittest.main()
