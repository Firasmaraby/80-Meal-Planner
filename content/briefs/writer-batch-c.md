# Common rules for batch C writers (pregnancy, breastfeeding, PCOS, menopause)

These families serve people at sensitive times. **The owner's rule: the food must be healthy and must never make anyone sicker. Follow the published guidance as closely as you can** (Health Canada, the IOM DRIs, ACOG, the 2023 international PCOS guideline). At the same time it must be real, tasty home food, not a clinical handout.

## Read first, in full
1. `content/GUIDE.md` in /home/user/80-meal-planner, all of it. Pay particular attention to:
   - §2: the sodium ceiling, the mercury and liver limits, and the upper limits;
   - §5, §7, §9 and §11;
   - §12 in full: **"Batch C rule: healthy first, never sicker"**, your diet's section, and the batch 2A and 2B lessons.
2. Your family's brief in `content/CATALOG.md` (Batch C briefs).
3. Your style in `src/engine/planStyles.ts`: its gates, bans and `note` (the app shows the note on your plan, so don't repeat it word for word in `howItWorks`). Also read `prenatalReason`, `alcoholReason` and the method check.
4. The worked examples your brief names. Don't copy their dishes.

## Safety, beyond what the gate checks
- **Food handling in the steps:**
  - eggs until the yolk is set;
  - meat and poultry cooked through, never pink;
  - fish cooked until it flakes;
  - leftovers chilled within 2 hours and reheated until steaming;
  - wash produce.
- **Pregnancy and breastfeeding:**
  - No alcohol anywhere: no wine, mirin or Shaoxing in cooking.
  - Caffeine at most 300 mg a day: at most one cup of coffee or two of tea in a day. Decaf is fine.
  - No herbal remedies.
  - No supplements in recipes.
  - Iodized salt as the salt.
  - Seaweed only in small amounts (iodine upper limit).
- **Claims:** no medical claims anywhere. Never "cures", "balances hormones", "boosts milk supply", "prevents birth defects" or "stops hot flushes". Say what a food brings ("folate, which matters in pregnancy"), not what it will do.
- **The pregnancy calorie floor:** pregnancy and breastfeeding plans never go below 1,800 kcal, and the lab enforces it. PCOS and menopause plans are never very low calorie.

## Sodium and the usual rules
- **Write under the sodium ceiling from the start:**
  - no-salt-added canned beans: `chickpeas-canned-no-salt-added-drained-742cc3`, `black-beans-...-33bee5`, `kidney-beans-...-89a75f`, `white-beans-...-65e6ca`, `pinto-beans-...-0b80db`, `lentils-...-c1edbd`. Use find-food for the full ids.
  - plain shrimp: `shrimp-peeled-raw-fresh-or-frozen-9603cf`;
  - reduced-sodium soy sauce: `soy-sauce-reduced-sodium-de4ba7`;
  - cheese and cured foods as a garnish only.
- **Text rules:**
  - ingredient notes never state counts;
  - the text must match the list;
  - no em or en dashes, and Canadian spelling;
  - `about` is 2-3 sentences with one bold phrase;
  - `howItWorks` is 3-5 short paragraphs, each opening with a bold phrase, separated by "\n\n", with one honest line on what changes at the other size.
- **Write each size's days near its label.**
- **Working files and helpers** go in `<scratchpad>/<your-id>/`. Never put them in the repo, never run `git stash` or `git checkout`, and don't commit.

## Finding foods
Use `node scripts/find-food.mjs "<query>"` (quote multi-word queries). Extended foods are fine. If a staple doesn't exist, use the nearest real food with a note, and list it in your hand-back.

## Work
1. Draft the week in `content/families/<id>.draft.md` and check it against GUIDE §11 and §12.
2. Write `content/families/<id>.json`, including `"lifeStage"` if your style needs it: `"pregnant"` for prenatal, `"lactating"` for postpartum.
3. Run `node scripts/plan-lab.mjs content/families/<id>.json` until it exits 0, fixing everything the culinary way.
4. Read `node scripts/plan-review.mjs content/families/<id>.json` at each size, as a hungry person would, and polish.

Only create those two files.

## Hand back
- the week grid;
- the lab table per size and band edge: weekly omega, max daily omega, protein %, max sat %, max GL, min fibre, max sodium, and max caffeine for prenatal or postpartum;
- the key nutrients for your stage at their lowest (folate, iron, choline, iodine, calcium, vitamin D, B12) and anything near an upper limit, especially vitamin A, iron and iodine;
- fish meals and which fish;
- groceries;
- written kcal per day;
- bands claimed or dropped, with the reason;
- a short **safety self-check**, going through the GUIDE §12 rules for your style one by one;
- anything you're unsure of.
