# Eighty plan authoring guide

This is the brief for everyone who writes or reviews a plan family: the authors, the chef critic and the final reviewer.
Read it in full before you start. The plan library is the product. If the food isn't delicious, the app fails, however
good the numbers are.

## 1. What we are making

A **plan family** is one week of eating (7 days) with a clear identity: a region, a diet or a goal. It is written
once and shipped in 3 or 4 **sizes** (Light, Standard, Big, and XL for performance families). The app then fits the
size to each person's exact calories, scaling protein, grains and fats while keeping vegetables and fruit as written.

Every meal in every family also lands in the Meal library, where people browse, save and add single meals to their day.
So every recipe has to stand on its own: it needs a name you'd order, a short explanation, and steps someone can
cook from.

## 2. The non-negotiables (the automated gate checks all of these)

Each day, at every band the family claims (checked at the band's lowest and highest calories):

- **The 80% rule.** Every board nutrient reaches at least 80% of the RDA or AI for the reference people:
  - an adult woman for bands below 1,600 kcal;
  - an adult woman and an adult man for 1,600 kcal and up;
  - pregnancy DRIs for prenatal families.

  Vitamin D, iodine and biotin are "hard from food". They're reported but don't fail the gate, yet you still do your
  best: fatty fish, eggs, dairy, mushrooms, iodized salt, seaweed.
- **Saturated fat** under 10% of calories.
- **Omega-6 to omega-3 ratio** at most 4:1. Fatty fish, walnuts, chia, flax and canola help. Sunflower and corn oil
  don't.
- **Glycaemic load** inside the daily limit, with tighter limits for low-GI families.
- **Protein:** at least the style's floor. Balanced is 20% of calories, muscle gain is 30%, and the 60+ family puts
  25 g at every main meal.
- **Fatty fish** twice a week (salmon, sardines, mackerel, trout, herring, anchovies), unless the family is vegetarian
  or vegan.

Per recipe and per week, the cooking-sense checks:

- realistic amounts: oil at most 2 tbsp (27 g) per serving, salt at most 2.5 g, dried spices at most 8 g;
- every main meal has a real protein source;
- 4 to 14 ingredients;
- 3 to 9 steps;
- no recipe more than twice a week, except breakfasts, which may rotate 2 or 3 recipes;
- at most about 45 distinct groceries per week;
- no em dashes or en dashes anywhere. Use a comma, a full stop, or "and".

## 3. Taste comes first: the rubric

The chef critic and the final reviewer score every meal from 1 to 5 on each point. Any 2 sends the family back. So
does a family average under 4.

1. **Flavour balance.** Salt, acid, fat, heat and aromatics are all considered. Most savoury dishes need an acid: lemon, vinegar, yogurt, tomato or tamarind. Spices are toasted or bloomed in fat. Herbs go in at the end.
2. **Texture.** Something soft and something crisp or crunchy: toasted nuts or seeds, raw veg, a crisp skin, a crunchy topping.
3. **It makes sense.** A cook from that region would recognise the idea, even with our tweaks. Ingredients belong together. No "chicken, kale, quinoa and mango" piles chosen only for the numbers.
4. **Cookable.** A weeknight dinner takes 45 minutes or less of hands-on time. One weekend "project" dish a week can take longer. No restaurant techniques. Equipment is a normal home kitchen.
5. **Findable.** Ingredients are available in an ordinary Canadian or US supermarket, with a specialty item now and then (sumac, gochujang, berbere) that you'll reuse.
6. **Real portions.** Portions look like a plate a person would serve. Nobody eats 400 g of spinach. Breakfasts look like breakfasts.
7. **Would I happily eat this twice?** Leftovers have to be good the next day too. Plan for that: grain salads, stews, curries and roasted trays reheat or keep well. Fried and crispy things don't.

**How to make nutrient-dense food taste great.** Build density into the dish, not on top of it:

- greens wilted into sauces, soups, eggs and stews;
- seeds and nuts toasted as toppings;
- legumes in place of part of the meat;
- fruit with breakfast and snacks;
- yogurt or tahini sauces;
- herbs by the handful;
- fish cooked simply with a bright sauce.

If a tweak makes the dish worse, find another way to reach the nutrient.

## 4. Region-inspired, respectfully

- **Name it honestly.** Name the dish what it is ("Moroccan chicken and apricot tagine"). When it departs from the original, say "inspired" in the recipe's `inspiredBy` note: "Inspired by Egyptian koshari, with lentils doing more of the work".
- **Keep the soul.** Keep the flavour base that makes the cuisine itself: the sofrito, the tadka, the berbere, the sambal, the herb salad. Change the proportions (more veg, more legumes, less oil and refined starch) before you change the identity.
- **Spread the region.** A regional family draws on at least three sub-regions or countries, so the week doesn't taste the same every night.
- **Stay modern.** No stereotypes, and no "exotic" language.

## 5. The shape of a week

- **Breakfast:** 2 or 3 recipes that rotate. Quick on weekdays (10 minutes or less, or made the night before); one slower weekend breakfast is welcome.
- **Cook once, eat twice:** most dinners make 2 servings, and the second becomes the next day's lunch. Mark it with `leftover` in the week grid. That keeps cooking and shopping realistic.
- **Dinners:** 5 to 7 distinct dinners, including one weekend project dish.
- **Snacks:** 1 or 2 a day. Whole foods (fruit, nuts, yogurt, hummus and veg, boiled eggs, roasted chickpeas) or a small recipe.
- **Timing:** fish on 2 days that aren't back to back, and legumes on most days.
- **Variety:** across the week, the main protein, main vegetable and cooking method keep changing.

## 6. Carb style (computed automatically, but write to it on purpose)

Every family is labelled automatically with the lowest setting it fits:

| Carb style | Allowed starches |
|---|---|
| **Whole-food carbs** | legumes, potatoes, sweet potatoes, squash, fruit, and intact grains: oats, quinoa, buckwheat, barley, millet, freekeh. No bread, rice, pasta, noodles, couscous or flour products. |
| **Whole grains too** | adds brown, wild or red rice, whole-wheat, rye or sprouted bread, whole-wheat pasta, corn tortillas, bulgur, soba, whole-wheat pita. |
| **Everything in moderation** | adds white rice, white pasta, naan and other refined staples, only where the cuisine truly needs them (sushi rice, a bowl of pasta), in modest portions next to plenty of vegetables. |

Aim the library at about half whole-food, a third whole grains, and the rest everything. Give grain-based meals the
`low_gi_grains` swap group so people can trade rice for quinoa or buckwheat. The swap groups are `leafy_greens`,
`legumes`, `low_gi_grains`, `vit_c_fruit`, `berries`, `fatty_fish`, `lean_protein`, `nuts_seeds`, `dairy_protein` and
`healthy_oils` (see `src/data/swapGroups.json`).

## 7. Writing: the voice

The app's voice is a warm friend who cooks well. Casual, clear and encouraging. Never clinical, never preachy.

- **No em dashes or en dashes.** Ever.
- **Steps:**
  - Natural sentences, one action or a small group of actions each.
  - Say what it should look, smell or sound like: "until the onions are soft and golden, about 8 minutes".
  - Write them so they work at any size: describe the ingredients rather than repeating grams ("add the lentils and the stock"). The app shows the scaled amounts in the ingredient list.
  - Mention leftovers when a recipe makes two servings: "Pack the second portion for tomorrow's lunch."
- **`about`:** 2 or 3 sentences for someone browsing. What it is, why it tastes good, and one plain-language nutrition point.
  - Good: *"A smoky, garlicky white bean and tomato stew with a big handful of kale stirred in at the end. The beans and kale together cover most of your iron and folate for the day, and a squeeze of lemon helps your body absorb that iron."*
  - Bad: *"Nutrient-dense meal optimised for micronutrient coverage."*
- **`howItWorks`** (plan level): a short friendly paragraph on the logic of the week. Which meals carry the hard nutrients, why fish lands on Tuesday and Friday, how the leftovers flow, what to prep on Sunday.
- **`summary`** (plan level): one or two sentences for the plan card.
- **`tip`** (optional): one "make it your own" line, a swap or a shortcut.
- **Spelling:** Canadian English (flavour, yogurt, colour) to match the app.

## 8. Nutrient strategy cheat sheet

Targets for adults 31 to 50 (80% line in brackets). F is the woman and M the man.

| Nutrient | Target | Reliable ways to get there inside real dishes |
|---|---|---|
| Vitamin A | F 700, M 900 µg (560 / 720) | sweet potato, carrot, squash, dark leafy greens, red pepper, eggs |
| Vitamin C | F 75, M 90 mg | peppers, kiwi, citrus, strawberries, broccoli, Brussels sprouts, tomatoes, fresh herbs, lemon dressing |
| Vitamin E | 15 mg (12) **often the hardest** | sunflower seeds, almonds, hazelnuts, peanut butter, avocado, olive oil, spinach, trout. Plan a seed or nut source every day. |
| Vitamin K | F 90, M 120 µg | any dark leafy green, herbs (parsley!), broccoli, cabbage |
| Thiamin (B1) | 1.1 / 1.2 mg | pork, legumes, sunflower seeds, oats, whole grains, peas |
| Riboflavin (B2) | 1.1 / 1.3 mg | dairy, eggs, almonds, mushrooms, lean meat |
| Niacin (B3) | 14 / 16 mg | chicken, tuna, salmon, turkey, peanuts, mushrooms |
| B5 | 5 mg | mushrooms, avocado, eggs, chicken, sunflower seeds, lentils |
| B6 | 1.3 mg | chickpeas, potatoes, bananas, poultry, fish, pistachios |
| Biotin (B7) *hard* | 30 µg | eggs (yolk), salmon, sunflower seeds, almonds, sweet potato |
| Folate | 400 µg DFE (320) | lentils, beans, chickpeas, edamame, spinach, asparagus, avocado |
| B12 | 2.4 µg | fish, shellfish, meat, eggs, dairy. Vegan families must use fortified soy milk, fortified nutritional yeast or fortified yogurt, and say so. |
| Choline | F 425, M 550 mg (340 / 440) **hard for men** | eggs (about 150 mg each), fish, chicken, beef, soy, broccoli and cauliflower |
| Calcium | 1,000 mg (800) | yogurt, milk, cheese, sardines with bones, calcium-set tofu, fortified soy milk, kale, bok choy, tahini, almonds, white beans |
| Iron | F 18, M 8 mg (14.4 for women) **hardest at low calories** | legumes daily, lean red meat 2 or 3 times a week, tofu, pumpkin seeds, spinach, oysters, quinoa. Pair with vitamin C. Avoid tea or coffee with the iron-heavy meal. |
| Magnesium | F 320, M 420 mg (256 / 336) | pumpkin seeds, chia, almonds, cashews, beans, leafy greens, quinoa, oats |
| Phosphorus | 700 mg | easy with protein foods and dairy |
| Potassium | F 2,600, M 3,400 mg (2,080 / 2,720) | potatoes, sweet potatoes, beans, lentils, bananas, leafy greens, squash, yogurt, tomatoes |
| Zinc | F 8, M 11 mg (6.4 / 8.8) | beef, oysters, pumpkin seeds, chickpeas, lentils, cashews, yogurt |
| Copper | 0.9 mg | cashews, sesame and tahini, lentils, mushrooms, chickpeas, dark chocolate |
| Manganese | F 1.8, M 2.3 mg | oats, brown rice, chickpeas, hazelnuts, pecans, spinach, pineapple, mussels |
| Selenium | 55 µg | Brazil nuts (1 or 2 is plenty), tuna, sardines, salmon, shrimp, eggs, turkey |
| Iodine *hard* | 150 µg | iodized salt (use it as the salt), dairy, eggs, cod and haddock, shrimp, nori |
| Vitamin D *hard* | 15 µg | salmon, trout, sardines, mackerel, herring, eggs, fortified milk or soy milk, UV mushrooms |
| Fibre | F 25, M 38 g | legumes, vegetables, fruit, whole grains, seeds |

**At low calories (Light size):** keep the vegetables, fruit and legumes. Trim oil, starch and portion size of meat.
Lean on the densest foods: leafy greens, legumes, eggs, sardines, yogurt, seeds, liver once a week if the cuisine
welcomes it. Drop the less useful snack rather than shrinking every meal.

**At high calories (Big and XL):** add a snack and more protein and starch. Don't add empty calories. The micros are
already met, so the gate there is mostly protein, saturated fat and omega balance.

## 9. Family file format (`content/families/<id>.json`)

```jsonc
{
  "id": "med-coast",                       // kebab-case, stable forever
  "name": "Mediterranean Coast",
  "style": "balanced",                     // see CATALOG.md for the list of styles
  "cuisine": "Mediterranean",
  "regions": ["Greece", "Southern Italy", "Spain"],
  "summary": "One or two sentences for the plan card.",
  "howItWorks": "A friendly paragraph on the logic of the week.",
  "signature": ["greek-lemon-chicken-orzo", "sardines-on-white-beans", "shakshuka-with-feta"],
  "lifeStage": "none",                     // "pregnant" or "lactating" for those families
  "sizes": {
    "standard": { "kcal": 2100, "covers": ["1800-2000", "2000-2200", "2200-2400"] },
    "light":    { "kcal": 1500, "covers": ["1400-1600", "1600-1800"],
                  "adjust": [ { "day": "*", "drop": { "slot": "snack", "index": 1 } } ] },
    "big":      { "kcal": 3000, "covers": ["2400-2800", "2800-3200"],
                  "adjust": [ { "day": "*", "add": { "slot": "snack", "recipe": "greek-yogurt-honey-walnuts" } } ] }
  },
  "recipes": [
    {
      "id": "white-bean-kale-stew",
      "name": "Smoky white bean and kale stew",
      "inspiredBy": "Spanish fabada and Tuscan ribollita",
      "about": "Two or three sentences for the library.",
      "ingredients": [
        { "food": "<food_id from templates/AI_Food_List.csv>", "g": 180, "swap": "legumes", "note": "drained" }
      ],
      "steps": ["Warm the olive oil in a pot and soften the onion and garlic, about 6 minutes.", "..."],
      "prepMin": 10,
      "cookMin": 30,
      "servings": 2,                       // portions the steps make; 2 = makes tomorrow's lunch
      "tags": ["mild", "freezer-friendly", "makes-leftovers"],
      "tip": "Optional make-it-your-own line."
    }
  ],
  "week": [
    { "day": 1, "meals": [
      { "slot": "breakfast", "recipe": "..." },
      { "slot": "lunch",     "recipe": "...", "leftover": true },
      { "slot": "dinner",    "recipe": "white-bean-kale-stew" },
      { "slot": "snack",     "recipe": "..." }
    ] }
  ]
}
```

- **Ingredient amounts** are grams for **one serving at Standard size**. The compiler sizes the other sizes with the app's own engine, then applies the `adjust` list.
- **Foods** come only from `templates/AI_Food_List.csv`, the everyday list. Copy the `food_id` exactly. If a food you need isn't there, pick the nearest one and mention it in your hand-back.
- **Snacks** that are simply a food (an apple, a handful of almonds) are still small recipes with one ingredient, a name and a one-line `about`.
- **Tags:**
  - spice: `mild`, `medium-spicy`, `spicy`;
  - audience: `kid-friendly`;
  - keeping: `freezer-friendly`, `makes-leftovers`, `no-cook`;
  - weekday shape: `weekend-project`, `15-minute`.

## 10. Workflow for one family

1. **Read** the family's brief in `content/CATALOG.md` and this guide.
2. **Draft** the dishes first, as names and one-line ideas for the whole week. Check that list for variety and flavour before any grams.
3. **Write** the family file.
4. **Run** `node scripts/plan-lab.mjs content/families/<id>.json` and fix what it reports. Repeat until it passes. When a nutrient falls short, fix it the culinary way (section 3), not by adding a pile of one food.
5. **Render** with `node scripts/plan-review.mjs content/families/<id>.json` and read it as a hungry person would. Would you cook this week?
6. **Hand back:**
   - what you made;
   - the gate results;
   - any foods you missed in the list;
   - anything you're unsure about.
7. **Review:** the chef critic, then the final reviewer, may return numbered fixes. Fix each one, re-run the gate, and reply with what changed.
