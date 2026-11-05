# Next: handoff for a fresh session (Nov 5, step 1 done)

Read this first, then `content/STATUS.md` (session log at the bottom), `content/GUIDE.md` (§2, §11, §12, §13) and `content/CATALOG.md`. `AGENTS.md` has the Expo rules.

## Where things stand
- **Library:** 74 plan families (one family = one 7-day plan, offered in Light, Standard, Big and sometimes XL), 206 sized plans and 1,709 recipes. Every family passes `node scripts/plan-lab.mjs`.
- **Food database:** 3,000 everyday foods plus about 15,400 extended. It is rebuilt by `python3 pipeline/consumer/build.py`.
- **Demo:** v21, a private artifact at https://claude.ai/artifact/LpcEVibNovUakvU6rMPz4V. Republish to the same URL by publishing `.demo/eighty-demo.html` with the Artifact tool.
- **Repo:** `main` is clean and pushed. In-progress families are backed up to the branch `wip/plan-library` (temp-index `commit-tree`, force-push, verify with `git ls-remote`).

## Firas's decisions
- **30 new global plans** following his framework:
  - 80% of the RDA or AI for every micronutrient every day;
  - high fibre and low saturated fat;
  - whole foods: legumes, nuts, seeds, fruit, vegetables.

  The plans are general and global, not regional, and above all tasty, everyday food people will actually make. Each has Light, Standard and Big sizes.
  - **20 plans: whole-food carbs only.** Legumes, potatoes, sweet potatoes, squash, fruit, and intact grains (oats, quinoa, barley, buckwheat, millet). No bread, pasta or rice.
  - **10 plans: whole grains allowed.** As above, plus brown rice, whole-wheat pasta and whole-grain bread in modest amounts.
  - These become the default plans the Plans tab shows first.
- **Remove pork everywhere.** It is in 27 families and 43 recipes. Replace it with a fitting protein, rewrite names, text and cooking temperatures, and re-check nutrients. Do this at the end, in one content pass with the new plans.
- **Remove the halal-friendly and kosher-style tags and filter chips**, so the app stays religiously neutral. They live in `src/engine/family.ts` `dietTagsOf`, `src/ui/planParts.tsx` DIET_OPTIONS, and the tests. Keep alcohol out of recipes.
- **Tofu data fix (my call).** Add properly sourced Canadian firm tofu entries in `pipeline/config/custom_foods.json`, with realistic iron and both regular and calcium-set calcium. The current entries have iron about 2-3x too high, and calcium-set calcium too low. Then re-check the soy-heavy families (menopause-japan, muscle-plant, dairy-free-east-asia, vegan-east-asia and others).
- **Leftover sizing fix (my call).** A leftover lunch should use exactly the portion cooked the night before, not be sized on its own (see `sizePlan` and `personalizeDay`). Re-run the lab on every family afterwards.
- **Pricing.** The app is paid: a free download with a 7-day store trial, about $59.99 a year (shown first) or $9.99 a month, through RevenueCat. The paywall comes after onboarding. Build the screens now and wire them once store accounts exist.
- **Name.** "Eighty" is a working name; the final name is not decided.
- **Accounts.**
  - Apple and Google developer accounts wait until Firas has the cash, so finish everything that doesn't need them first.
  - Supabase comes later, in its own project.
  - Expo: Firas will sign up at https://expo.dev/signup and add `EXPO_TOKEN` as an environment secret. Never ask for tokens in chat.
  - Firas uses **Android**. Once the token exists, build an EAS development APK for his phone.
- **Desktop.** An admin console for Firas after launch, to manage plans, publish without a store release, and see usage. A web version for clients comes later.

## Order of work
1. **UX fixes from Firas's testing: done Nov 5.**
   - Check-in trends: the report card has Week, Month and Year views, with energy, sleep and mood lines, weight, and Eighty days (daily squares, or monthly bars for a year).
   - Plans tab: **Everyday · Cuisines · Diets & goals** views (`src/engine/browse.ts`). Everyday is cuisine "Global" with the balanced style; until those plans ship it shows the regional kitchens with a line saying so. **Give the 30 new plans `cuisine: "Global"` and `style: "balanced"` so they land in Everyday.**
   - Carb-style wording leads with whole-food carbs and offers "Add grains too".
   - Meals: "Calories at your size" chips, using the same recipe in the plan size that fits the person.
   - Search on both tabs (`src/engine/textSearch.ts`): plurals, prefixes, one typo, cooks' synonyms, ingredients; nutrient queries ("high iron", "omega-3") rank by amount and show it.
   - **Revisit plan discovery with Firas once the app is done.** He sees how people find a plan as make or break for the app. Plan a session together on a creative solution; today's views and search are a stopgap. Note: with the default whole-food carb choice, most current plans are hidden until the global plans ship.
2. **Engine and data:** remove the halal and kosher tags, fix the tofu data, fix leftover sizing, then rebuild and re-check.
3. **The 30 global plans** in waves of about 5. Add briefs to CATALOG and GUIDE §13 first, using the writer → critic → final review loop below.
4. **Final content pass:** remove pork; remove the alcohol still in 29 recipes (Shaoxing wine and mirin in china-home, japan-korea, lean-asia and muscle-asia), then add a lab gate so no recipe has alcohol; rebuild, run the full checks, publish the demo.
5. **Paywall screens:** UI only, ready for RevenueCat.
6. **When the accounts exist:** Supabase sign-in (Apple, Google, email), account deletion, sync, EAS builds, a beta (Google needs 12 testers for 14 days), store listing, submit.

## How each family is made (quality loop)
- **Writer (Sonnet).** Uses `content/briefs/writer-common.md` plus a family brief (spec, sizes, dishes, worked examples). It must exit 0 on `node scripts/plan-lab.mjs content/families/<id>.json`.
- **Critic and safety review (Sonnet).** Uses `content/briefs/critic.md`. Render first with `node scripts/plan-review.mjs <file> --size standard|light|big|xl > <scratchpad>/review/<id>-<size>.md`.
- **Rulings.** I rule on the critic's points, then the writer applies the fixes.
- **Final and safety review (Opus).** Uses `content/briefs/final-review.md`, then the writer applies the fixes.
- **Before committing a family:** lab passes, a Python check finds no em or en dashes (`re.findall('[–—]', text)`; grep gives false hits on characters like ⅓), then commit.
- **House safety rules**, also in `writer-common.md`:
  - Doneness: poultry 74 °C, ground meat and pork 71 °C, fish 70 °C. Reheat to 74 °C.
  - Leftovers: in the fridge within 2 hours, eaten within 3 days. Rice and grains are cooled within 1 hour.
  - Eggs: yolks firm, at most 4 a day.
  - Headroom under upper limits: iron 40 mg, calcium 2,200 mg, zinc 36 mg, selenium about 300 µg, phosphorus 3,600 mg.
  - Tofu stress test: with every firm tofu counted at 400 mg calcium per 100 g, no day may go over 2,500 mg.
  - Text must be true at every size. No medical claims.
- **Style:** casual cooking steps, Canadian spelling, no em or en dashes.

## Ship sequence (after a batch)
1. Run `python3 pipeline/consumer/build.py`.
2. Run `node scripts/build-plans.mjs $(git ls-files 'content/families/*.json' | grep -v _fixture)`. It takes about 10 minutes, so run it in the background.
3. Check that every food a family uses is in the everyday tier.
4. Run `npx tsc --noEmit`, `npx vitest run`, and `cd pipeline && python3 -m unittest discover -s tests`.
5. Run `npx expo export --platform web --output-dir dist`, then `node scripts/make-demo.mjs dist .demo/eighty-demo.html --single`, then `node .demo/check-demo.cjs`.
6. Walk through the app with Playwright.
7. Add STATUS rows and a session-log line.
8. Commit, push, and republish the demo.
