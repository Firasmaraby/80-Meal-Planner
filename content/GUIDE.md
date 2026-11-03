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
- **Omega-6 to omega-3 ratio** at most **6:1 over the week**, and no single day above 9:1. The framework's ideal is about
  4:1; a week that reaches it earns a "Great omega balance" badge. Get there the way the cuisine would: fatty fish 2 to
  3 times a week, and walnuts, flax or chia **only where the cuisine already uses them**. Keep the cuisine's own fat
  (olive oil, sesame oil, ghee, a little palm oil): never swap in canola just for the ratio, and never sprinkle flax or
  chia on a dish that doesn't have it. Anti-inflammatory plans aim tighter: 3:1 over the week.
- **Glycaemic load** at most 100 per 2,000 kcal, scaled to each day's calories (70 for low-GI families).
- **Protein:** at least the style's floor. Balanced is 20% of calories, muscle gain is 30%, and the 60+ family puts
  25 g at every main meal.
- **Fatty fish** twice a week (salmon, sardines, mackerel, trout, herring, anchovies), unless the family is vegetarian
  or vegan.

Per recipe and per week, the cooking-sense checks:

- realistic amounts: oil at most 2 tbsp (27 g) per serving, salt at most 2.5 g, dried spices at most 8 g, and at most
  400 g of raw meat, poultry and fish together in one serving at any size (write the week near its label so Big doesn't
  have to grow the meat; let Big add a side or snack instead);
- every main meal has a real protein source;
- 4 to 14 ingredients;
- 3 to 9 steps;
- no recipe more than twice a week, except breakfasts, which may rotate 2 or 3 recipes;
- at most about 45 distinct groceries per week. Dried spices, dried herbs, spice blends, salt and pepper don't count: they're a pantry shelf with its own limit of 25, so season properly;
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
- **Make it easy to scan.** People read on a phone, so no blocks of text:
  - Split longer text into short paragraphs with a blank line (`\n\n` in the JSON).
  - Bold the key words with `**double asterisks**`: one or two phrases per paragraph, never whole sentences.
  - Nothing else: no headings, bullets or other markdown.
- **`about`:** 2 or 3 sentences for someone browsing. What it is, why it tastes good, and one plain-language nutrition point. Bold the one thing that matters most.
  - Good: *"A smoky, garlicky white bean and tomato stew with a big handful of kale stirred in at the end. The beans and kale together cover **most of your iron and folate** for the day, and a squeeze of lemon helps your body absorb that iron."*
  - Bad: *"Nutrient-dense meal optimised for micronutrient coverage."*
- **`howItWorks`** (plan level): the logic of the week in **3 to 5 short paragraphs** of about 50 words at most, each opening with a bolded key phrase. Which meals carry the hard nutrients, why fish lands on Tuesday and Friday, how the leftovers flow, what to prep on Sunday. For example:

  ```
  **Cook once, eat twice.** Monday's lemon chicken, Wednesday's lentil soup and Friday's chickpea stew each make two portions, so the next day's lunch is already done.

  **Fish three times.** Sardines on Tuesday and salmon on Thursday carry your omega-3 and help with **vitamin D**. It's always cooked fresh, never a leftover.

  **Sunday prep.** Blitz a batch of hummus and mix the first jar of overnight oats.
  ```
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
  "howItWorks": "**Key phrase.** Short paragraph.\n\n**Key phrase.** Short paragraph.\n\n**Key phrase.** Short paragraph.",
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

- **Ingredient amounts are what you buy and measure, before cooking.** If the recipe cooks it, pick the *raw* or *dry* entry and its raw or dry weight: "Chicken thigh, raw", "Barley, pearled, raw", "Shrimp, raw", "Potato, raw". Use cooked entries only for things bought ready to eat: canned beans, lentils and chickpeas, canned fish, a boiled egg made ahead, leftover cooked grain. The steps then always agree with the list.
- **Ingredient amounts** are grams for **one serving at Standard size**. The compiler sizes the other sizes with the app's own engine, then applies the `adjust` list.
- **Foods** come from the food library: the everyday list (`templates/AI_Food_List.csv`) **and** the extended tier. Find them with `node scripts/find-food.mjs` (below), then copy the `food_id` exactly. If nothing fits, pick the nearest food and list the missing one in your hand-back.
- **Snacks** that are simply a food (an apple, a handful of almonds) are still small recipes with one ingredient, a name and a one-line `about`.
- **Tags:**
  - spice: `mild`, `medium-spicy`, `spicy`;
  - audience: `kid-friendly`;
  - keeping: `freezer-friendly`, `makes-leftovers`, `no-cook`;
  - weekday shape: `weekend-project`, `15-minute`.

### Finding foods

Don't grep the CSV: it only matches the exact words in a name, and it has no extended tier. Use the finder instead:

```bash
node scripts/find-food.mjs hing dahi "urad dal" gochujang sumac cardamom
node scripts/find-food.mjs "kidney beans" --all     # every match, with the other foods of each kind listed under it
```

- It searches **everyday and extended** foods with the app's own search, in a few seconds, and prints the top 8 kinds of food per query: `food_id`, name, tier, kcal and protein per 100 g, and a note.
- It also tries **cook's names** (hing is asafoetida, dahi is yogurt, atta is whole wheat flour, rajma is kidney beans, besan is chickpea flour, scallion is green onion, eggplant is aubergine and 60 more rows). The table is `src/engine/foodSynonyms.ts`; add a row when you meet a name it misses.
- Cardamom, cinnamon, cloves, bay leaf, curry leaves, garam masala, harissa, teff and melon seeds are all in the library already. Kombu, urad dal, perilla seeds and fonio are extended.
- **Extended foods are fine.** `plan-lab`, `plan-review` and `build-plans` accept them, and the next `python3 pipeline/consumer/build.py` promotes every food a family file uses to the everyday tier. Don't avoid a food because it says "extended".
- **Curated staples** exist for foods no database has: sumac, za'atar, baharat (seven spice), chaat masala, kala namak, amchur, ajwain, kasuri methi, Kashmiri chili powder, gochugaru, gochujang, doenjang, berbere, ras el hanout, pomegranate molasses, tamarind paste and labneh. Asafoetida (hing) is in the library too. The curated ones are **Eighty composites** worked out from other foods in the library, so every value is an estimate and some nutrients are left empty (sumac and ajwain have only energy and macronutrients). Use them for flavour, not as a nutrient source. Their recipes are in `pipeline/config/custom_foods.json`.
- **Report what is still missing** in your hand-back: the word you searched, what you used instead.

## 10. Workflow for one family

1. **Read** the family's brief in `content/CATALOG.md` and this guide.
2. **Draft** the dishes first, as names and one-line ideas for the whole week. Check that list for variety and flavour before any grams. Look up the spices and pastes with `find-food` while you draft, so the flavour is not limited to what you remember is in the list.
3. **Write** the family file.
4. **Run** `node scripts/plan-lab.mjs content/families/<id>.json` and fix what it reports. Repeat until it passes. When a nutrient falls short, fix it the culinary way (section 3), not by adding a pile of one food.
5. **Render** with `node scripts/plan-review.mjs content/families/<id>.json` and read it as a hungry person would. Would you cook this week?
6. **Hand back:**
   - what you made;
   - the gate results;
   - any foods you missed in the list;
   - anything you're unsure about.
7. **Review:** the chef critic, then the final reviewer, may return numbered fixes. Fix each one, re-run the gate, and reply with what changed.

## 11. What the critic catches most (avoid these up front)

These are the problems that sent the pilot back. Check your week for each one before you hand it back.

- **Ingredients that aren't of the cuisine,** added for a number: chia in Mediterranean food, mushrooms in a Greek lentil soup. Find a nutrient source the cuisine already uses.
- **A dish renamed into something it isn't.** A barley pot isn't a paella. Name it for what it is: "Saffron barley with chicken (inspired by paella)".
- **Protein crutches.** Eggs on every salad, or 130 g of yogurt "spooned on top". Use protein that belongs in the dish.
- **The same flavour base twice in a day.** Beans, tomato and paprika at breakfast and again at dinner.
- **One vegetable everywhere.** Red pepper in 8 recipes. Vary the produce across the week.
- **Weird breakfasts.** Lentil salad at breakfast. Keep breakfasts recognisable for the culture.
- **Lists that don't match the steps.** Cooked shrimp in the list, "cook until pink" in the steps. Use raw weights for anything you cook.
- **Untrue claims.** "Pearled barley is a whole grain", "salmon gives you calcium", "spinach covers your iron". Only claim what the dish really carries.
- **Recipes that silently need another recipe.** "Hummus" with no hummus recipe. If a component is made, include how.
- **Portions nobody eats.** 300 g of shelled mussels, or 2½ eggs. Use whole eggs and real plates.
- **Crutches the batch 1A and 1B critics counted** (they count slots, so count yours first):
  - **Dairy:** yogurt, laban or labneh in 15+ slots a week. Aim at about 10 or fewer, never 4 in a day, unless the cuisine truly eats it that often.
  - **Eggs:** an egg at all 7 breakfasts, then egg snacks to patch choline. Choline also comes from fish, chicken, beef, lamb, goat, shrimp, tofu and legumes (since Nov 2 the library estimates choline for those foods from their protein when it wasn't measured, so they now count). Use eggs where the dish has them, and say so when the gate forces more.
  - **Walnuts, almonds, chia, flax** dropped into savoury dishes or every snack for omega or vitamin E. Use them only where the cuisine does (blended soy milk, a nut snack, a sweet porridge).
  - **One fruit or vegetable everywhere:** orange, carrot, bok choy, papaya, cucumber in 5+ recipes, or 3 times in one day.
- **Never above an upper limit, at any size.** The lab checks each day against the tolerable upper limits (vitamin A counts only preformed retinol from animal foods; manganese has no food limit). Big sizes scale portions up, so watch liver (about 50 g, once a week), a lot of tofu or dairy on one day, and shellfish (zinc).
- **Spices and salt never count toward the 14-ingredient cap or the 45 groceries.** Never cut cinnamon from a tagine to fit a list.
- **Stand-ins when the real staple exists.** Chili powder for ancho or chipotle, paprika for achiote, "curry powder" for sambar powder, sansho for Sichuan pepper, lemon for loomi. Search first with `scripts/find-food.mjs`; curated staples are added on request.
- **Cooking that doesn't work as written:** a cup of water in a dish that needs a third; 10 minutes for congee from cooked rice; whole-wheat flour as a stir-fry thickener (up to 10 g of cornstarch is fine and doesn't change the carb style); a filling too dry to fold; a batter that needs to ferment but only rests 10 minutes.
- **Weekday time honesty.** "15-minute" only when prep plus cook is 15 or less. A 30-minute weekday breakfast needs a make-ahead tip; a 100-minute braise needs a pressure-cooker tip.
- **Batch staples with no recipe:** the Sunday rice or bean pot must say how much to cook (enough for the week, or twice) and how long it keeps (4 to 5 days; freeze the rest).
- **Recipe ids are shared across the library.** Start every recipe id with your family id (`mexico-tinga`).


## 12. Special-diet families (Wave 2)

Everything above still applies: 80% of every board nutrient every day, taste first, the cuisine's own fats. A diet
family adds its style's gates (`src/engine/planStyles.ts`) and the rules below. The diet must feel like good food that
happens to fit the diet, never like a list of things you can't have.

### Diabetes-friendly (`low-gi`)
- **Gates:** glycaemic load at most 70 per 2,000 kcal, fibre at least 30 g a day. Light may claim 1200-1400.
- **Carbs spread evenly** over breakfast, lunch and dinner, never a carb-only meal or snack. Every carb comes with
  protein, fat or fibre (fruit with nuts or yogurt, not alone).
- **Legumes are the backbone,** most days at two meals. Intact grains (barley, steel-cut oats, bulgur, whole millet,
  brown basmati) in modest portions. No juice, little dried fruit, sweeteners only as a spoonful in a sauce.
- **Acid and fibre first:** a salad or vegetables before the starch, lemon or vinegar on the plate.
- **Say "diabetes-friendly",** never "diabetic diet". The plan explains the logic (steady carbs, fibre, protein) and
  never promises results. The app adds a note for people on insulin or sulfonylureas to check with their care team.

### Vegan (`vegan`)
- **No animal foods at all,** including honey, gelatine, fish sauce and ghee. Fatty fish doesn't apply.
- **B12 every day from a fortified food:** fortified soy beverage (at least a glass, in porridge, smoothies, sauces or
  coffee) is the reliable one in the library. Say so in `howItWorks`, and say that many vegans also take a B12
  supplement as insurance.
- **Protein at 20%+** comes from tofu, tempeh, seitan, edamame, lentils, beans, chickpeas and soy beverage, at every
  main meal. Two protein foods in a meal is normal (dal and tofu, beans and quinoa).
- **Calcium:** calcium-set tofu, fortified soy beverage, tahini, almonds, white beans, kale, bok choy and broccoli
  (not spinach: its calcium isn't absorbed).
- **Iron and zinc:** legumes, tofu, pumpkin and hemp seeds, oats, with vitamin C in the same meal.
- **Omega-3 comes from ALA only,** so walnuts, ground flax, chia and hemp hearts are welcome here every day in dishes
  where they make sense: porridge, overnight oats, smoothies, puddings, dressings, baking. Still no flax sprinkled
  on a curry. Use olive and canola oil; keep sunflower and corn oil out.
- **Choline:** soy foods, legumes, quinoa, broccoli, Brussels sprouts, cauliflower, peanuts, mushrooms. Plain pulses (dals, lentils, beans, besan, tempeh) carry
  choline estimated from their protein where the source had no value, so a dal-based week no longer needs eggs for it.
- **Iodine:** iodized salt as the salt; nori is fine, kelp is not (it can go over the upper limit).

### Keto (`keto`)
- **Gate:** net carbs (carbs minus fibre) at most 40 g every day, at every size.
- **Fat from plants and fish:** olive oil, avocado, olives, nuts, seeds, fatty fish. Butter, cream, cheese and
  coconut stay modest, because saturated fat must still stay under 10%. That is what makes this keto different.
- **Protein moderate,** 20 to 30% of calories. Fatty fish two or three times a week.
- **Vegetables carry the micros:** leafy greens, broccoli, cauliflower, Brussels sprouts, zucchini, peppers, asparagus,
  mushrooms, cabbage, every day and in volume. Berries in small handfuls. Onion, tomato and carrot in measured amounts.
  No grains, potatoes, sugar or fruit beyond berries, lemon and avocado; legumes only as a spoon of edamame or black
  soybeans.
- **Chia and flax are keto staples** (chia pudding, flax crackers), so they're welcome where they fit.
- **Watch thiamin, folate, potassium and magnesium,** the usual keto gaps: sunflower and pumpkin seeds, pork tenderloin,
  salmon, avocado, spinach, asparagus, mushrooms and almonds fix them.
- **The app notes** keto isn't for pregnancy, type 1 diabetes, kidney disease or people on SGLT2 medication. Light may
  not reach 1400; claim only what passes.

### Gluten-free (`gluten-free`)
- **No wheat, barley, rye, spelt, bulgur, couscous, farro, semolina or seitan,** and no regular soy sauce (tamari is
  fine). Oats only as "certified gluten-free oats", said in the ingredient note.
- **Naturally gluten-free cooking first:** corn tortillas and arepas, rice, quinoa, buckwheat, millet, amaranth, teff,
  potatoes, cassava, plantain, legumes. Don't lean on gluten-free bread and pasta.
- **Hidden gluten:** stock cubes, spice blends, sausages and sauces vary. Tips say "check the label" where it matters.
  The app adds a cross-contamination note for people with celiac disease.

### Lessons from batch 2A (apply to every diet family)
- **Write the week near its label.** A Standard week written at 1,600 kcal forces the sizer to grow meat to silly
  portions at Big (the 400 g gate catches it). Aim for written Standard days within about 10% of 2,100.
- **At Light, never serve a crumb.** If sizing shrinks pita, rice or roti below about 12 g, say "a spoonful or two" or
  "a small, palm-sized roti" honestly, or drop the bread from that Light meal with a swap. Never pretend it's a portion.
- **Keto fat:** olive oil is about 14% saturated, so it raises the saturated-fat share, not lowers it, and the 27 g
  oil cap binds at Big. Carry keto calories with nuts, avocado, olives and fatty fish as well as oil. Rinse olives and
  capers, and keep olives to about 100 g a day (sodium).
- **Vegan B12:** say it plainly. B12 comes from a fortified soy beverage every day. The library's carton carries about
  2 µg per cup (US-style fortification); many Canadian cartons carry about half that, so a daily B12 supplement is the
  safe bet. Plain soy yogurt (`soy-yogurt-plain`), seitan and soya chunks count as vegan protein; calcium-set tofu is
  the only tofu worth buying. Soy yogurt is not a vitamin E or C source (its old 9.7 mg vitamin E was a data error).
- **Seeds and wheat germ** belong where they make sense (porridge, shakes, sauces), never sprinkled on top for numbers.
- **Diabetes-friendly framing:** "keeps the plate steady", "the starch digests more slowly"; never "gentle on blood
  sugar", never a promise.

### Vegetarian (`vegetarian`)
- **No meat, poultry or fish** (fish sauce, anchovies and gelatine included); eggs and dairy are welcome. Fatty fish
  doesn't apply.
- **B12 from dairy and eggs:** milk, yogurt, cheese and eggs most days. A lacto-vegetarian (no egg) family leans on
  milk, yogurt and paneer daily.
- **Protein 20%+** from legumes, dairy, eggs, tofu and tempeh; two protein foods per main meal is normal.
- **Omega-3 is ALA only,** so walnuts, ground flax, chia and hemp are welcome where they make sense (porridge, raita,
  chutney, baking), as in vegan families.
- **Iron and zinc** from legumes, tofu, seeds and whole grains with vitamin C; dairy at the iron-heavy meal sparingly.

### Muscle gain (`muscle`)
- **Gate:** protein at least 30% of calories, every day. Sizes Standard (about 2,400), Big (about 3,000) and XL (about
  3,800), covering 2400-4200. No Light.
- **The 400 g raw meat per serving cap still holds:** carry the calories with starch (rice, potatoes, oats, pasta),
  dairy (Greek yogurt, skyr, cottage cheese, milk), legumes and eggs, spread over three meals and two or three snacks.
- **Protein at every meal and snack,** about 30 to 50 g per main meal. Real food, never powders.
- **Saturated fat still under 10%:** lean meat, skinless poultry, fish, low-fat dairy.

### Lean / cut (`fat-loss`)
- **Gates:** protein at least 30% and fibre at least 30 g. Sizes Light (1200-1400 where it passes, 1400-1800),
  Standard (1800-2200). No Big.
- **Volume first:** big salads, soups, roasted vegetables and fruit fill the plate; lean protein at every meal.
- **No promises.** Say "built to keep you full on fewer calories", never a weight-loss figure.

### Heart-healthy (`heart`)
- **Gates:** sodium at most 2,000 mg a day and saturated fat under 7%.
- **Low sodium is the hard part:** no added salt in most dishes (lemon, vinegar, herbs, garlic and spice instead),
  no-salt-added canned beans and tomatoes, unsalted nuts, little cheese, no cured meat. Write "no-salt-added" in the
  ingredient note where it matters.
- **Fish two or three times,** legumes most days, oats, nuts, olive or canola oil; skinless poultry, very little red meat.
- **The app adds a note** that people on blood-pressure or heart medication should follow their care team's advice.
