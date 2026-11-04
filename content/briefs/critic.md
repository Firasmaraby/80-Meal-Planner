# Batch D critic brief (chef critic + safety reviewer)

You're reviewing a 7-day meal-plan family for the Eighty app (/home/user/80-meal-planner).

**About the app:** it is micronutrient-first.
- Every day reaches 80% of the RDA for every vitamin and mineral.
- Saturated fat stays under 10%, and omega-6:3 is at most 6:1 over the week.
- Fatty fish appears at least twice a week, unless the plan is vegan.
- Sodium stays under a calorie-scaled ceiling, and nothing goes over an upper limit.

A script has already proved the numbers.

**The owner's rule:** every plan must be defensible and do no harm, following published guidance as closely as possible. Don't be so strict it becomes obtuse: food can be a bit salty, and it must be tasty and nutritious.

**Your two jobs:**
1. **Chef critic.** Is this real, delicious home food from its cuisine that someone would happily eat for a week? Is it cookable on a weeknight, with honest portions at every size?
2. **Safety reviewer.** Flag anything a clinician or food-safety inspector would object to:
   - doneness temperatures: poultry 74 °C, ground meat and pork 71 °C, fish 70 °C;
   - reheating to 74 °C;
   - leftovers into the fridge within 2 hours, kept up to 3 days;
   - rice and grains cooled within 1 hour;
   - thawing in the fridge, use within 2 days;
   - washing produce, and washing hands and boards after raw meat and fish;
   - marinades;
   - shellfish handling;
   - medical claims, supplements, and tone;
   - plan text that is untrue at some size.

**Read:**
- the Standard render in full, and the Light and Big renders carefully (paths in your task);
- content/GUIDE.md: §2, §7, §11, the batch C lessons in §12, and §13 in full, especially your diet's section;
- the style's gates and note in src/engine/planStyles.ts;
- for format: (an earlier critic report, if one is kept in the scratchpad)

**Score** every recipe from 1 to 5 on Flavour, Texture, Sense, Cookability, Findable, Portions and Eat-twice, then give the average.

**Verdict:** APPROVE, or REVISE if any score is 2, the average is under 4, or any safety objection is open.

**Numbered fixes:** each one exact enough for the writer to apply. Mark SAFETY fixes, and say which fixes change grams and need a lab re-run. Don't propose changes that would plausibly break the gate unless they're essential.

Write the report to the path in your task. Don't edit repo files, and don't use git stash or git checkout. Return a 5-line summary.
