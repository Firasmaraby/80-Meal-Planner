import re
import unittest

import helpers  # noqa: F401
from stages import schema

TYPES = helpers.REPO_ROOT / "src" / "engine" / "types.ts"
NUTR = helpers.REPO_ROOT / "src" / "engine" / "nutrients.ts"


@unittest.skipUnless(TYPES.exists() and NUTR.exists(), "TypeScript sources not present")
class SchemaSync(unittest.TestCase):
    def test_nutrient_keys_match_types_ts(self):
        src = TYPES.read_text(encoding="utf-8")
        block = src.split("export type NutrientKey =")[1].split(";\n")[0]
        keys = re.findall(r"\|\s*'(\w+)'", block)
        self.assertEqual(keys, schema.NUTRIENT_KEYS)

    def test_units_match_nutrients_ts(self):
        src = NUTR.read_text(encoding="utf-8")
        units = dict(re.findall(r"key: '(\w+)',[^\n]*?unit: '([^']+)'", src))
        self.assertEqual(units, schema.CANONICAL_UNIT)

    def test_categories_and_tags_match(self):
        src = TYPES.read_text(encoding="utf-8")
        cats = re.findall(r"\|\s*'(\w+)'", src.split("export type FoodCategory =")[1].split(";\n")[0])
        self.assertEqual(cats, schema.CATEGORIES)
        tags = re.findall(r"'(\w+)'", src.split("export type FoodTag =")[1].split(";\n")[0])
        self.assertEqual(tags, schema.TAGS)

    def test_food_interface_keys(self):
        src = TYPES.read_text(encoding="utf-8")
        body = src.split("export interface Food {")[1].split("\n}")[0]
        fields = set(re.findall(r"^\s+(\w+)\??:", body, re.M))
        self.assertEqual(fields, schema.FOOD_KEYS)


if __name__ == "__main__":
    unittest.main()
