# Eighty food-data pipeline

Turns a workbook of several food-composition databases (USDA SR Legacy / Foundation / FNDDS, Canadian Nutrient File,
CIQUAL, CoFID, AUSNUT/NUTTAB, Frida, ...) into one clean, searchable library that matches the app's `Food` type
(`src/engine/types.ts`) exactly, with every food keeping the citation of every source it came from.

Python 3.13, `pandas`, `openpyxl`, stdlib only (JSON config; `rapidfuzz` is used automatically if installed, otherwise `difflib`).
The pipeline never edits anything outside `pipeline/`.

## Quick start (when the real workbook arrives)

```bash
# 1. look at it - sheet names, row counts, first rows, columns, and suggested column->nutrient mappings
python3 pipeline/run.py --inspect --input /path/to/foods.xlsx
#    (--no-count skips the slow full row count for the 70 MB file)

# 2. edit pipeline/config/sources.json: one entry per database (see "Adding a source mapping")
#    entries marked "TODO verify against file" (USDA SR Legacy, CNF) are guesses - check them against step 1

# 3. run everything
python3 pipeline/run.py --input /path/to/foods.xlsx --out pipeline/out
#    --sheets "SR Legacy" cnf                      only the sources reading those sheets (or with those keys)
#    --dump-stages                                also write intermediate tables to out/stages/
#    --check-search                               afterwards run the ~120 everyday search queries

# 4. read pipeline/out/report.md first. The "Warnings" section lists mapping problems
#    (column not found, sheet not found, unparseable cells). Fix config, re-run. Runs are deterministic.

# 5. tests (no pytest needed)
python3 -m unittest discover pipeline/tests
python3 pipeline/search_check.py            # search acceptance check on out/foods.json
```

## Output (`pipeline/out/`)

| file | what |
|---|---|
| `foods.json` | array of `Food` objects (ids are slugs: `slug(name)-<6 hex of sha1(primary source uid)>`, unique, stable across runs for identical input). Missing nutrients are omitted, never 0. `gi` is `null` (no source). |
| `foods_seed.csv` | Supabase `foods` columns `id,name,category,aliases,tags,gi,servings,nutrients,sources,rare,rank`; `aliases`/`tags` are Postgres array literals (`{"a","b"}`), `servings`/`nutrients`/`sources` are JSON strings for jsonb. |
| `report.md`, `report.csv` | rows in per source, values dropped by reason, foods dropped by reason, merged groups, rare flagged, final count, nutrient coverage % per NutrientKey, citations |
| `merges.csv` | every merge: primary, members, match type, similarity, cosine, nutrients filled |
| `curate_log.csv` | every drop / rare / keep decision with rule, matched text, rank and rank components |
| `dropped_values.csv` | every nutrient value removed by normalize (negative, > 100 g, unsafe unit, ...) |
| `needs_review_names.csv` / `.jsonl` | low-confidence names for LLM review (see below) |
| `citations.json` | `db -> citation` for each source (the `Food.src` entries carry `{db, ref}` only, as the type requires) |
| `dedupe_rejected_pairs.csv` | name-similar pairs that the nutrient check refused to merge (sanity check the thresholds) |

## Stages (`pipeline/stages/`, pure functions over DataFrames)

1. **ingest** - reads only the sheets the config needs (`dtype=object`, so ids like `01001` and markers like `Tr` survive) and
   produces a long table `source, source_id, raw_name, nutrient, value, unit` (raw units, plus `prio`, `col`, `uid`).
   `Tr`, `N`, `-`, `<0.1`, blanks become *missing* (no row), never 0. `[0.5]` and `1,5` are parsed. Duplicate/blank ids and blank
   names are dropped and counted. Column names are matched tolerantly (`Energ_Kcal` == `energ kcal`).
2. **normalize** - converts to the canonical units of `nutrients.ts` (kcal, g, mg, µg):
   kJ -> kcal (/ 4.184); vitamin D IU -> µg (/ 40); folate: a plain/food-folate column *is* DFE (build DFE from food folate +
   1.7 x folic acid with a `sum` mapping if both exist); vitamin E is alpha-tocopherol in mg; salt -> sodium (x 393.4).
   **Vitamin A IU -> µg RAE is source dependent** (retinol IU: 0.3; beta-carotene IU: 0.05, and the mix in between): it is only
   converted if the mapping states the basis (`"unit": "IU(retinol)"` / `"IU(beta_carotene)"`); plain `IU`, `µg RE`, a bare `µg`
   are left **null** and listed as `unsafe_conversion`. Same for niacin equivalents (`mg NE`) and vitamin E IU without basis.
   Dropped with a report row: negative values, any gram nutrient > 100 g/100 g (0.5 g slack), kcal > 950 and other generous
   per-nutrient maxima, protein+fat+carbs > 110 g, sub-components bigger than their parent (sugar > carbs, SFA/MUFA/PUFA > fat,
   EPA/DHA/ALA/LA > PUFA). If a food has several candidate columns (e.g. RAE and IU) the first *convertible* one wins.
   Values converted with an approximation (alpha-TE, total folate, beta-carotene IU) are flagged `approx` and never used to fill other records.
3. **names** - rule-driven (`config/name_rules.json`): `Chicken, broilers or fryers, breast, meat only, cooked, roasted` ->
   `Chicken breast, roasted`; boilerplate stripped (`NFS`, `meat only`, `broilers or fryers`, `commercial`, `includes USDA commodity`,
   `drained`, `without salt`, grades, trim levels ...), `raw` and the cooking state kept and moved last, generic heads promoted
   (`Fish, salmon` -> `Salmon`), cuts joined (`Beef, ground` -> `Ground beef`), some heads inverted (`Cheese, cheddar` -> `Cheddar cheese`),
   sentence case with proper nouns. Upper-case abbreviated sources (SR `Shrt_Desc`: `CKD`, `RSTD`, `W/`) are expanded automatically.
   Aliases: head phrase, reversed modifier (`whole milk`), base noun (`chicken`), singular, ~65 synonym groups (garbanzo/chickpea,
   courgette/zucchini, aubergine/eggplant, coriander/cilantro, prawn/shrimp, rocket/arugula, porridge oats/oats, ...), alt-name
   columns and parenthetical alternative names. Category by lexicon scoring (head word beats the rest; the source food-group is a hint),
   tags (`fatty_fish`, `leafy_green`, ...). Each name gets a confidence; below `review_threshold` it is exported for review.
4. **dedupe** - canonical key = synonym/spelling-folded, singular, stop-word-free, sorted tokens **plus the preparation state**, so raw / boiled /
   roasted are different foods. Candidates (same category *and* same state): identical key, or name similarity >= 0.88; names that differ
   by an identity token (with/without, skin, lean, low-fat, salted, colours, wild/farmed, digits ...) never merge. Confirmation: cosine of
   kcal/protein/carbs/fat/fiber >= 0.98 on the shared keys (>= 3 shared) **and** kcal within 10 % (or 5 kcal). Greedy star clustering from the
   most complete record, so there is no A~B~C chaining. Primary = most non-null nutrients, ties by `source_priority`, then uid. Gaps are filled
   from other members only with non-approximate values. `src` lists every contributing record, primary first. Every merge is in `merges.csv`.
5. **curate** (`config/curate_rules.json`, `config/common_foods.txt`) - drop: lab/test samples, industrial/food-service ingredients, infant
   formula, baby foods, supplements/medical, foods with neither kcal nor protein. Mark `rare`: game meat, organs beyond liver, skin/fat-only
   parts, branded items, regional/ethnic entries with low commonness, very sparse records (< 8 nutrients) unless clearly everyday.
   `rank` 0-100 = category base + match to the ~340 everyday foods in `common_foods.txt` (exact or partial; synonyms fold) + short name +
   number of sources + good state (raw/boiled/...) + nutrient completeness - penalties; rare foods are capped at 20.
6. **servings** (`config/servings_defaults.json`) - household measures from the source's portion data (configured per source), de-duplicated and
   limited to 6; otherwise a default only where the unit weight is well known (apple/banana/kiwi "1 medium", oils "1 tbsp", nuts "1 oz", milk
   "1 cup", meat/fish "3 oz" ...). Unknown -> no servings; nothing is guessed.
7. **export** - schema-validates (`validate_foods`: exact key set, valid NutrientKeys, categories/tags, unique slug ids, non-empty `src`,
   no NaN/negatives, rank 0-100) *before* writing, then writes all files above.

## Adding a source mapping (`config/sources.json`)

One object in `sources[]` per database. Anything not listed is ignored; `"enabled": false` parks an entry.

```jsonc
{
  "key": "ciqual",                       // short id; used in uids and source_priority
  "db": "ANSES CIQUAL 2020",             // goes into Food.src[].db  (keep it identical to how the citation names the database)
  "citation": "ANSES. Table de composition nutritionnelle des aliments Ciqual 2020. ciqual.anses.fr",
  "status": "verified",                  // free text; the report prints it
  "sheet": "CIQUAL",                     // sheet name (tolerant match)
  "layout": "wide",                      // "wide": one row per food, one column per nutrient | "long": see below
  "header_row": 0,                       // 0-based row holding the column names
  "id_column": ["alim_code"],            // candidate column names, first one present wins
  "id_pad": null,                        // e.g. 5 to zero-pad numeric ids (SR NDB_No)
  "name_column": ["alim_nom_eng", "alim_nom_fr"],
  "name_is_abbreviated": "auto",         // true for SR Shrt_Desc style upper-case abbreviations; auto = mostly upper-case names
  "group_column": ["alim_grp_nom_eng"],  // optional; used as a category hint and for curate rules
  "alias_columns": ["alim_nom_fr"],      // optional extra names -> aliases
  "nutrients": {
    "kcal":    {"column": ["Energie, Règlement UE N° 1169/2011 (kcal/100 g)"], "unit": "kcal"},
    "protein": {"column": "Protéines, N x 6.25 (g/100 g)", "unit": "g"},
    "vitD":    [ {"column": "Vitamine D (µg/100 g)", "unit": "µg"},      // list = fallbacks, first non-null (after unit
                 {"column": "Vitamine D (IU)", "unit": "IU"} ],          // conversion) wins
    "folate":  {"sum": [ {"column": "Folates (µg/100 g)"},                  // computed column: DFE = food folate + 1.7 x folic acid
                         {"column": "Acide folique", "factor": 1.7, "optional": true} ], "unit": "µg DFE"},
    "vitA":    {"column": "Vitamine A (RAE)", "unit": "µg RAE"},        // state the basis! plain µg / IU / RE stay null
    "sodium":  {"column": "Sel chlorure de sodium (g/100 g)", "unit": "g NaCl"}   // salt -> sodium mg
  },
  "portions": {"layout": "wide_pairs", "pairs": [{"grams": "GmWt_1", "desc": "GmWt_Desc1"}]}   // optional
}
```

* **Units** accepted: `g mg µg/mcg/ug ng kg kcal kJ MJ IU`, `µg RAE`, `µg DFE`, `µg food folate`, `µg total folate` (approx), `mg α-TE` (approx), `g NaCl`,
  `IU(retinol)`, `IU(beta_carotene)` (approx), `IU(natural)`, `IU(synthetic)`. `factor` multiplies the raw value (e.g. a per-1-g column -> 100).
  If `unit` is omitted the canonical unit is assumed (long layout: the unit column / lookup unit is used).
* **Long layout** (CNF style: a values sheet `id, nutrient, value` plus lookups):
  `"layout": "long", "sheet": "<values sheet>", "id_column": "FoodID",
  "long": {"nutrient_column": "NutrientID", "value_column": "NutrientValue", "unit_column": null, "match_on": "code",
  "nutrient_lookup": {"sheet": "NUTRIENT NAME", "id_column": "NutrientID", "code_column": "NutrientCode", "name_column": "NutrientName", "unit_column": "NutrientUnit"}},
  "names": {"sheet": "FOOD NAME", "id_column": "FoodID", "name_column": "FoodDescription", "group_column": "FoodGroupID", "group_lookup": {...}}`
  and map nutrients with `{"match": ["208"], "unit": "kcal"}` (matches the code/name/raw id according to `match_on`).
* **Portions**: `wide_pairs` (SR abbreviated: `GmWt_1`/`GmWt_Desc1` ...) or `long` (`id_column`, `desc_column`, `amount_column`, `grams_column`
  or `factor_column` (x100 g, CNF) + `measure_lookup`).
* Add the key to `source_priority` (earlier = preferred primary when two records are equally complete).
* Workflow: `run.py --inspect` prints, per sheet, a draft `"suggested nutrient mapping"` you can paste and correct; run; fix everything in the report's
  **Warnings** table; check `dropped_values.csv` for `unsafe_conversion` (a column you probably need to map differently).

## Name review loop (LLM)

`out/needs_review_names.jsonl` has one line per low-confidence final food: `{"id","raw_name","proposed_name","category","reasons"}` (`id` = uid of the
primary source record, e.g. `usda_sr_legacy:09148`; the csv also has `food_id`, `confidence`). Send it in batches to an LLM and ask for the same JSON
lines back with corrected `proposed_name` / `category` (optionally `aliases`). Save the reply as `pipeline/config/name_overrides.jsonl` and re-run: overrides
are applied by `id` and are stable because they are keyed by the source record, not by the generated slug.

## Config files

`sources.json` (mappings + settings: thresholds, file names) · `name_rules.json` (every lexicon, boilerplate list, synonym group) · `curate_rules.json` (drop /
rare patterns, rank weights) · `common_foods.txt` (everyday foods) · `servings_defaults.json` · `search_queries.json` (~120 queries for `search_check.py`).
`fixtures/make_fixture.py` builds the SYNTHETIC workbook + config used by `tests/test_e2e.py`
(`python3 pipeline/fixtures/make_fixture.py` writes `synthetic.xlsx`, `sources_synthetic.json`, `search_queries_synthetic.json`).

## Search check

`search_check.py` ports the app's `src/engine/search.ts` ranking (token prefix + one-typo tolerance + exact name/alias boost + concise names + `rank`
boost, `rare` excluded) and requires an expected food in the top 3 for each query. Run it against real output with `--min-pass 0.9`; the failures it
prints are the quickest guide to missing aliases (`name_rules.json` synonyms) or wrong ranks (`common_foods.txt`).

## Known limits

* The SR/CNF mappings are best guesses from published layouts - verify. The 5 other databases need entries (column names unknown until the file arrives).
* Nothing computes glycemic index (`gi` is `null`).
* Names are rules, not language models: non-English names (CIQUAL French) are flagged low-confidence and need the review loop or an English name column.
* Carbohydrate/fibre definitions differ between databases (available carbs vs by difference, AOAC vs Englyst); gaps are filled across sources anyway for fibre/sugar,
  and the dedupe check only guards against gross disagreement.
* Dedupe on ~40k records takes about a minute; `max_posting` in settings bounds the candidate search.
