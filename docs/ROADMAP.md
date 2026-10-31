# Eighty roadmap

## Built
- **Plans**: library by calorie band, cuisine and diet; full meal previews; micronutrient fingerprint per plan.
- **Plans sized to you**: portions scale to each person's calories, micros first (sizing down never drops a completed tile below 80%). Dislikes are auto-swapped by closest nutrient match.
- **Today**: meal timeline, one-tap "Ate it", swaps with live nutrient deltas, add/remove/swap-in library meals, mini board, gap closer, framework pillars, contextual tips.
- **Board**: 25 tiles done at 80% of the RDA/AI, projection from the rest of the day's plan, consistency calendar.
- **Meal library**: every meal from every plan, searchable, "best for today" ranking, saved meals.
- **Adherence**: grocery list (household size, pantry), prep day, cook mode with timers, reminders, "life happened" rescue.
- **Progress**: weekly check-in, 30-day report card, optional supplements.
- **Plan authoring**: Excel template and the AI Plan Builder kit (`templates/AI_Plan_Builder_Brief.md`, `templates/AI_Food_List.csv`), with an import report and an AI fix-list in Plan admin, plus `scripts/check-plan.mjs`.
- **Backend**: Supabase schema with row-level security, versioned plans, offline-first sync.
- **Food library**: 3,000 everyday + about 15,400 extended foods from 9 cited databases (CNF first, then USDA), grouped search with common foods first, typo tolerance, baby food / supplements / duplicates hidden with reasons. Rebuilt by `pipeline/consumer/build.py`; values spot-checked against the sources.

## Needs a phone build to test (EAS development build)
- Apple Health / Health Connect export (`src/lib/health.*.ts`). Device checklist is in the code comments and the PR notes.
- Local notifications (reminders, cook timers) and keep-awake in cook mode.
- Haptics, native tabs, form-sheet presentation.

## Blocked / next
1. **Food library gaps**: 260 everyday names have no food in the databases, mostly dishes and named varieties (jasmine rice, penne, skyr, dijon). Candidates are in `pipeline/out/unmatched_candidates.jsonl`; add them from a branded or recipe source, or leave them out.
2. **Sign-in** (Apple, Google, email) and account deletion: needs the Supabase project and an Apple developer account.
3. **Real meal plans**: authored with the AI kit; the 3 bundled plans are samples. With real data they come up short on vitamin D (fish and dairy values in CNF are lower than the old sample data) and Lean Performance day 3 is at omega-6:3 5:1.
4. **Store prep**: EAS project, bundle ids (`com.firasmaraby.eighty`), privacy policy, screenshots, TestFlight / Play internal testing.
5. Later: barcode scanning, meal photos, family accounts, coach analytics, subscriptions.
