# Batch C final and safety review: common brief

You are the final (Opus) reviewer and the safety reviewer for one 7-day plan family in "Eighty", a micronutrient-first meal plan app. The repo is /home/user/80-meal-planner.

**House style:** Canadian spelling, casual cooking steps, no em or en dashes.

**The owner's rule for this batch:** every plan must be defensible and must never make anyone sicker. Follow the published guidance (Health Canada, the IOM DRIs, the 2023 international PCOS guideline, the menopause society position statements) as closely as possible. Keep it tasty and not obtuse. Salty-ish food is fine within the app's sodium ceiling.

**House food-safety standards:**
- Doneness: poultry 74 °C, ground meat and pork 71 °C, fish 70 °C.
- Reheat to 74 °C.
- Leftovers with meat, fish, egg or dairy keep up to 3 days.
- Cool cooked food within 2 hours in shallow containers, and cooked rice and grains within 1 hour.
- Thaw in the fridge, use within 2 days, never refreeze.
- Wash produce before cutting. Wash hands and boards after raw meat and fish.
- Hard-boiled eggs in the shell keep up to 1 week.

**Read:**
1. content/GUIDE.md: §2, §7 and §11, plus §12 in full, especially the "Batch C rule" and the section for this style.
2. The style's gates and `note` in src/engine/planStyles.ts.
3. The critic's report (named in your task).
4. The revised renders in full: Standard, then Light.
5. As a format example: (an earlier final review, if one is kept in the scratchpad)

**Judge:**
1. Final taste and cooking: real home food from the cuisine, cookable on a weeknight, honest portions at Light.
2. Every critic fix that should have landed did land.
3. **Safety and guideline:**
   - temperatures and storage applied consistently;
   - no cure, hormone, weight, fertility, symptom or supplement promises;
   - no restrictive or disordered tone;
   - nutrients near an upper limit are sensible for this life stage, counting a typical supplement where relevant;
   - the text matches the food (no false claims about what Light changes, what's in a dish, and so on).

You may test a change on a scratch copy of the json in the scratchpad with `node scripts/plan-lab.mjs <copy>`. Don't propose changes that would plausibly break the gate unless they're essential, and say when a fix needs a re-run.

Write the review to the file named in your task, with these sections:
- Verdict: APPROVE, APPROVE WITH SMALL FIXES, or REVISE;
- Critic fixes check;
- Safety check;
- Numbered fixes, each exact enough for a writer to apply;
- Judgement calls.

Do not edit repo files, and don't use git stash or git checkout. Return a 3-5 line summary.
