# Common rules for batch D writers

**The owner's rule:** every plan must be defensible and do no harm, following published guidance (Health Canada, the IOM DRIs) as closely as you can. Don't be so strict it becomes obtuse. The food must be tasty, nutritious, real home cooking; it can be a bit salty within the app's ceiling.

## Read first, in full
1. `content/GUIDE.md` in /home/user/80-meal-planner, all of it. Pay particular attention to:
   - §2: the sodium ceiling, the mercury and liver limits, and the upper limits;
   - §5, §7, §9 and §11;
   - §12: the batch 2A, 2B and C lessons, and the "Batch C rule" (the same spirit applies);
   - §13 in full, especially your diet's section (§13b for the Everyday global plans).
2. Your family's brief in `content/CATALOG.md` (Batch D).
3. Your style in `src/engine/planStyles.ts`: its gates, bans and `note` (the app shows the note on your plan, so don't repeat it word for word in `howItWorks`). If your style has bans, read the ban regexes so you know what they catch.
4. The worked examples your brief names. Don't copy their dishes.

## Safety, beyond what the gate checks
- **Food handling in the steps:** write these in from the start. Every batch C critic had to add them.
  - Doneness with a temperature: poultry 74 °C (165 °F), ground meat and pork 71 °C (160 °F), fish 70 °C (158 °F).
  - Leftovers: into a shallow container and the fridge within 2 hours, keep up to 3 days, reheat once to 74 °C.
  - Cooked rice and grains: cooled within 1 hour.
  - Wash produce before cutting. Wash hands and boards after raw meat and fish. Marinate in the fridge and never reuse a raw marinade.
  - Thaw in the fridge, use within 2 days, never refreeze.
- **Claims:** no medical claims anywhere. Say what a food brings ("iron, with vitamin C to help absorb it"), not what it will cure or prevent. No supplements or powders in recipes.
- **Alcohol:** leave it out of every recipe (no wine, beer, spirits or mirin in cooking); use stock, vinegar, citrus or a pinch of sugar instead.
- **Pork:** none in any form, anywhere (bacon, ham, lard, chorizo...). Use chicken, turkey, beef, lamb, fish or beans; beef or turkey versions of cured meats only if the library has them. The lab checks foods and words for every family (GUIDE §2 house bans).
- **Eggs:** yolks firm, always, in the words too (no soft-boiled, jammy or runny). The lab checks it.

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

## Upper-limit headroom (lessons from batch D so far)
- Keep every day at every edge at or under: iron 40 mg, calcium 2,200 mg (Light and Standard 2,000 mg where you can), zinc 36 mg, selenium about 300 µg, phosphorus 3,600 mg. Brands vary, and people take multivitamins.
- **Tofu:** use `firm-tofu-calcium-set-c9fb4e` (firm, 78 kcal, 9 g protein, 180 mg calcium per 100 g) or `extra-firm-tofu-calcium-set-455d4a` (extra-firm, 144 kcal, 17 g protein, 300 mg calcium), sourced from the Canadian Nutrient File and North American labels. Pick one per week where you can (they count as two groceries). Brands vary, so claim "some calcium", never "a day's calcium" from tofu. With every firm tofu counted at 400 mg per 100 g (the top of the label range) on a scratch copy, no day may go over 2,500 mg.
- **Eggs:** cook yolks firm everywhere (Health Canada's general advice). At most 4 eggs a day at any size.
- **Leftovers:** a cooked dish keeps 3 days; plan the week so nothing is eaten later than that, or freeze it with a thaw-in-the-fridge line.
- **Plan text** must be true at every size: read the Light and Big renders before you hand back.

## Finding foods
Use `node scripts/find-food.mjs "<query>"` (quote multi-word queries). Extended foods are fine. If a staple doesn't exist, use the nearest real food with a note, and list it in your hand-back.

## Work
1. Draft the week in `content/families/<id>.draft.md` and check it against GUIDE §11 and §12.
2. Write `content/families/<id>.json`.
3. Run `node scripts/plan-lab.mjs content/families/<id>.json` until it exits 0, fixing everything the culinary way.
4. Read `node scripts/plan-review.mjs content/families/<id>.json` at each size, as a hungry person would, and polish.

Only create those two files.

## Hand back
- the week grid;
- the lab table per size and band edge: weekly omega, max daily omega, protein %, max sat %, max GL, min fibre, max sodium;
- the tightest nutrients at their lowest, and anything near an upper limit (vitamin A, iron, iodine, calcium);
- fish meals and which fish;
- groceries;
- written kcal per day;
- bands claimed or dropped, with the reason;
- a short **safety self-check**, going through the GUIDE §13 rules for your style one by one;
- anything you're unsure of.
