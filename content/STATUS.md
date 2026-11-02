# Plan library status

Every family in CATALOG.md moves through these steps:

| Step | Who |
|---|---|
| brief | Opus |
| authored + gate passes | Sonnet |
| chef critic | Sonnet, fresh context |
| final sign-off | Opus |
| compiled and shipped | |

| Family | Wave | Status | Notes |
|---|---|---|---|
| med-coast | Pilot | shipped | Light 1400-1800, Standard 1800-2400, Big 2400-3200. 25 recipes. |
| levant | 1A | shipped | Standard 1800-2400, Big 2400-3200. Light dropped: calcium can't reach 80% at 1600 kcal without a yogurt crutch. 26 recipes. |
| north-india | 1A | shipped | Light, Standard, Big (1400-3200). 27 recipes. |
| west-africa | 1A | shipped | Light, Standard, Big (1400-3200). 23 recipes. |
| japan-korea | 1A | shipped | Light, Standard, Big (1400-3200). Carb style "everything" (white rice). 26 recipes. |
| gulf | 1B | chef critic | all 6 bands pass |
| china-home | 1B | chef critic | all 6 bands pass; needs staples (Sichuan pepper, star anise, five spice, douchi) and the cornstarch-thickener carb rule |
| mexico | 1B | authoring | |
| south-india | 1B | authoring | |

## Lessons from the pilot (now in GUIDE.md and the engine)
- **Weekly omega balance.** Omega-6:3 is graded over the week (≤6:1, Firas's choice; ≤4:1 earns the "Great omega balance" badge), with a daily ceiling of 9:1. Grading it day by day pushed chia onto most breakfasts and fish into snacks.
- **Raw weights.** Ingredients are listed at buying weight (raw or dry), so the list and the steps agree.
- **Whole units.** Eggs size in whole eggs; spice pinches keep 0.1 g precision.
- **Starchy vegetables.** Potatoes, sweet potatoes, cassava and plantain size like grains.
- **The critic's recurring catches.** Watch for these up front:
  - an ingredient that isn't of the cuisine (chia, mushrooms in fakes);
  - a dish renamed into something it isn't ("barley paella");
  - eggs or yogurt used as a protein crutch;
  - the same flavour base twice in a day;
  - one vegetable everywhere;
  - nutrition claims that aren't true ("pearled barley is a whole grain").
- **Cost.** One family took about 2.3M tokens across all tiers, because the pilot also shook out the rules. Later families should need far less.

## Session log
- **Oct 31:** GUIDE.md and CATALOG.md written. Toolchain (plan-lab, plan-review, build-plans, carb style, style gates) built.
- **Nov 1:** app screens for the library, stable food ids, and the med-coast pilot through the author, critic and final-review loop. Shipped.
- **Nov 1 (later):** Firas approved the pilot. Asked for paragraph breaks and bold in explanations (rich text, guide §7), and special-diet families after the regions (CATALOG restructured). Batch 1A started.
- **Nov 1-2:** batch 1A through author, critic and Opus final review; omega rule moved to 6:1; staples toolchain (find-food, curated blends, promote-on-use); spices off the grocery cap. Batch 1A shipped (5 families, 14 plans, 127 recipes); the 3 sample plans retired from browsing. Household measures fixed (walnut halves, whole counts, no "70 tbsp"). Recipe ids must start with the family id. Batch 1B (gulf, china-home, mexico, south-india) authored.
