# Eighty plan catalogue

The full plan library, family by family. Each family is a 7-day week written once and shipped in sizes (see GUIDE.md).
Progress is tracked in STATUS.md. The briefs are starting points: authors may change dishes as long as the brief's
intent survives.

**Sizes and the bands they usually cover:**

| Size | kcal | Usually covers |
|---|---|---|
| Light | 1500 | 1200-1400*, 1400-1600, 1600-1800 |
| Standard | 2100 | 1800-2000, 2000-2200, 2200-2400 |
| Big | 3000 | 2400-2800, 2800-3200 |
| XL | 3800 | 3200-3700, 3700-4200 (performance families only) |

\* 1200-1400 only where a family says so: balanced, fat loss and low-GI.

The gate proves every band a family claims. When a band can't pass, the family drops that band rather than bending
the food.

**Styles:**
- **Eating patterns:** balanced, vegan, vegetarian, pescatarian, flexitarian.
- **Goals:** muscle, fat-loss, endurance, low-gi, keto, low-carb, heart, gut, anti-inflammatory.
- **Life stage:** prenatal, postpartum, healthy-aging.
- **Lifestyle:** family, quick, batch, budget, ramadan, intermittent-fasting, gluten-free, dairy-free, iron-focus, paleo.

The gates for each style are in `src/engine/planStyles.ts`.

---

## Pilot

### P1 `med-coast` · Mediterranean Coast · balanced · Light, Standard, Big (1200-3200)
- **Places:** the coast from Greece to Southern Italy to Spain.
- **The idea:** the eating pattern with the strongest evidence behind it, cooked the way people actually eat there: olive oil, a lot of vegetables, beans and lentils, fish twice or three times, a little cheese and yogurt, fruit and nuts, meat as a treat.
- **Ideas:**
  - Greek lemon chicken with potatoes and greens;
  - sardines or mackerel on garlicky white beans;
  - fakes (Greek lentil soup) with feta and lemon;
  - shakshuka with spinach and feta;
  - Spanish chickpea and spinach stew (espinacas con garbanzos);
  - baked salmon with tomato, olives and capers;
  - horiatiki salad with chickpeas;
  - Greek yogurt with figs or berries, walnuts and honey;
  - a weekend paella-inspired dish with mussels or chicken and peas, made with brown rice or freekeh.
- **Carb style:** aim for whole-food carbs (potatoes, legumes, freekeh or barley).
- **Watch:** vitamin E (almonds and sunflower seeds in snacks and salads), iron for women at Light, and choline (eggs at 2 or 3 breakfasts).

---

## Wave 1: regional everyday eating (balanced)
Unless noted, every family covers 1400-3200 (Light, Standard, Big). Aim each one at whole-food or whole-grain carbs,
except where the cuisine is built on a staple: then use the whole-grain form, or a modest portion.

1. **`levant` · Levantine Table** (Lebanon, Syria, Palestine, Jordan).
   - **Dishes:** mujadara with crispy onions and a yogurt-cucumber salad; fattoush with grilled chicken; shish tawook with garlic sauce and a tabbouleh heavy on parsley; foul medames for breakfast; baked kibbeh (bulgur, so whole-grain); lentil and chard soup (adas bi hamod); hummus and crudités for snacks.
   - **Watch:** parsley and mint by the handful for vitamins K and C; tahini for calcium and copper.
2. **`gulf` · Gulf Kitchen** (Saudi Arabia, the Emirates, Oman, Kuwait, Qatar, Bahrain).
   - **Dishes:** chicken machboos or kabsa with the baharat spice blend, made with brown basmati or freekeh; harees (wheat and chicken porridge, as a weekend project); grilled hammour or kingfish with a dakkous tomato sauce; balaleet-inspired eggs; dates with laban and nuts; salata Arabiya.
   - **Watch:** the fish rule, which fits the coastal cuisine naturally; dates in moderation for GL.
3. **`maghreb` · North African Spice Road** (Morocco, Tunisia, Algeria).
   - **Dishes:** chicken tagine with apricots and almonds; harira (lentil, chickpea and tomato soup); chermoula-baked fish; shakshuka; zaalouk and taktouka salads; carrot salad with cumin and orange; a lamb and prune tagine as the weekend dish; couscous only in the whole-wheat form or swapped for barley.
4. **`persia-anatolia` · Persian & Turkish Table** (Iran, Turkey).
   - **Dishes:** ghormeh sabzi (herb, kidney bean and beef stew); kuku sabzi (a herb frittata, high in vitamin K); menemen (Turkish eggs); Turkish red lentil soup; adana-style chicken kofte with a shepherd salad; fesenjan-inspired chicken with walnut and pomegranate as the weekend dish; yogurt with cucumber and mint.
5. **`nile` · Nile & Red Sea Kitchen** (Egypt, Sudan).
   - **Dishes:** koshari reimagined with more lentils and chickpeas and a smaller portion of pasta (or a brown-rice base); foul medames; ta'meya (green falafel, baked); molokhia with chicken; Sudanese peanut salad (salata dakwa); grilled fish with a cumin and lemon sauce.
6. **`north-india` · North Indian & Pakistani Home Cooking.**
   - **Dishes:** dal tadka; chana masala; palak paneer (or palak tofu); chicken karahi; tandoori-spiced salmon; rajma; aloo gobi; vegetable raita; whole-wheat roti for whole-grain plans, or millet roti.
   - **Watch:** ghee in modest amounts for saturated fat (use canola oil for most tadkas); paneer portions.
7. **`south-india` · South Indian & Sri Lankan Kitchen.**
   - **Dishes:** sambar with lots of vegetables; Kerala fish curry (meen curry) with a smaller amount of coconut milk; lemon or coconut rice in a modest portion, or millet; masala dosa made from lentil and millet batter; poriyal (stir-fried greens with coconut); Sri Lankan dhal with gotu kola sambol (use parsley or kale); egg hoppers-inspired eggs.
   - **Watch:** coconut is high in saturated fat, so treat it as a flavour, not a base.
8. **`west-africa` · West African Pot** (Nigeria, Ghana, Senegal).
   - **Dishes:** egusi soup with spinach and fish; jollof (brown rice) with a lot of veg and grilled chicken; red-red (black-eyed peas in palm-free tomato stew) with plantain; groundnut (peanut) stew with chicken and sweet potato; thieboudienne-inspired fish and vegetable rice; moi moi (steamed bean pudding) for breakfast.
   - **Watch:** palm oil is high in saturated fat, so use a little for colour and flavour only.
9. **`east-africa` · East African Highlands & Coast** (Ethiopia, Eritrea, Kenya, Somalia, Tanzania).
   - **Dishes:** misir wot (red lentil with berbere); gomen (collard greens with garlic and ginger); doro wat-inspired chicken and egg stew as the weekend dish; sukuma wiki with eggs; Kenyan beans and maize (githeri); Somali-spiced fish (suqaar spices); teff porridge or injera only if a teff food exists, otherwise sorghum or millet.
10. **`southern-africa` · Southern African Braai & Pot** (South Africa, Zimbabwe, Mozambique).
    - **Dishes:** chakalaka with beans; bobotie-inspired lentil and beef bake; peri-peri chicken with a butternut salad; boerewors-style patties made with lean beef and lots of herbs; samp and beans; morogo (wild greens) with tomato; mealie (corn) for snacks.
11. **`japan-korea` · Japanese & Korean Home Table.**
    - **Dishes:** miso salmon with spinach gomae; Korean bibimbap with lots of namul and a fried egg (brown or mixed-grain rice); tofu and vegetable miso soup; chicken teriyaki made with less sugar; doenjang jjigae (soybean paste stew); onigiri with salmon for a snack; kimchi and edamame on the side.
    - **Watch:** sodium; use tamari and miso with care. Rice is usually central, so this family is "whole grains" with mixed-grain rice.
12. **`china-home` · Chinese Home Cooking** (Cantonese, Sichuan, Shanghainese).
    - **Dishes:** steamed fish with ginger and scallion; mapo tofu with more veg; tomato and egg stir-fry; garlic bok choy and gai lan; Sichuan smashed cucumber; chicken and broccoli with black bean sauce; congee for breakfast with egg and greens.
    - **Watch:** sodium, oil.
13. **`thai-viet` · Thai & Vietnamese Fresh Kitchen.**
    - **Dishes:** Vietnamese summer rolls with shrimp; pho-style beef and herb soup (rice noodles, so "any" carbs, or a zucchini and soba twist); larb gai (chicken herb salad); green papaya salad; Thai red curry with lots of veg and a little coconut milk; lemongrass grilled fish; bún-inspired bowls.
    - **Watch:** coconut milk saturated fat, fish sauce sodium.
14. **`island-asia` · Filipino, Malaysian & Indonesian Table.**
    - **Dishes:** chicken adobo with greens; sinigang (sour tamarind soup) with fish and kangkong; gado-gado (veg and egg with peanut sauce); Malaysian sambal fish; tempeh stir-fry; laksa-inspired soup as the weekend dish; pinakbet (vegetable stew).
15. **`mexico` · Mexican Kitchen.**
    - **Dishes:** chicken tinga with black beans; huevos rancheros; pozole verde with chicken; fish tacos on corn tortillas with cabbage slaw; chiles rellenos-inspired stuffed peppers; nopales salad; pico de gallo, guacamole and pepitas everywhere.
16. **`south-america` · South American Table** (Peru, Brazil, Colombia, Argentina).
    - **Dishes:** Peruvian quinoa salad and ceviche-inspired cooked fish (no raw fish needed); Brazilian feijoada made light (black beans, lean pork, collards, orange slices); Colombian arepas (whole corn) with eggs; Argentine chimichurri steak with salad; lomo saltado-inspired beef and peppers with potatoes; açaí bowls as a snack.
17. **`caribbean` · Caribbean Kitchen** (Jamaica, Trinidad, Cuba, Haiti, Puerto Rico).
    - **Dishes:** jerk chicken with rice and peas (brown rice, kidney beans); callaloo; Trinidad doubles-inspired chickpea curry; escovitch fish; ackee and saltfish (where ackee isn't in the list, use eggs and salt cod); Cuban black bean soup; plantain baked, not fried.
18. **`nordic` · Nordic Kitchen** (Scandinavia, Finland).
    - **Dishes:** pickled herring and rye; salmon with dill potatoes and peas; Finnish salmon soup (lohikeitto); rye porridge with lingonberries; Danish smørrebrød made with rye, egg and shrimp; root vegetable and barley stew; skyr bowls.
    - **Watch:** fatty fish is natural here, so aim for 3 a week. Vitamin D is the best of any family.
19. **`east-europe` · Eastern European & Georgian Table** (Poland, Ukraine, Georgia, the Balkans).
    - **Dishes:** borscht with beans; buckwheat (kasha) with mushrooms and eggs; Georgian lobio (bean stew with walnut and herbs); pkhali (spinach and walnut pâté); chicken in walnut sauce (satsivi) as the weekend dish; Polish cucumber salad (mizeria) with yogurt; stuffed peppers.
20. **`north-america` · North American Kitchen** (Canada and the US, comfort made bright).
    - **Dishes:** turkey chili with beans; maple-mustard salmon with roasted sweet potato and Brussels sprouts; Canadian split pea soup; egg and veg breakfast muffins; a big chopped Cobb-style salad; Cajun-spiced shrimp with greens; steel-cut oats with berries and walnuts; bison or lean beef burgers in lettuce wraps or whole-grain buns.

## Wave 2 onward: special diets (several families per diet)

Built after all 20 regional families. Each diet gets 2 to 4 families in different cuisines, so people on a diet still
get variety. Every family follows the same rules as the regional ones (80% every day, taste first), plus its diet's
gates in `src/engine/planStyles.ts`. Diet tags such as vegan, gluten-free, halal-friendly and nut-free are also
computed for every plan, regional ones included, so the Plans filters work across the whole library.

**Order of work:** the diets the most people need come first:

| Batch | Diets |
|---|---|
| A | diabetes-friendly, vegan, keto, gluten-free |
| B | vegetarian, muscle gain, lean, heart-healthy |
| C | prenatal, postpartum, PCOS, menopause |
| D | everything else |

| Diet (style) | Families | Cuisines and notes |
|---|---|---|
| Diabetes-friendly / low-GI (`low-gi`) | 4 | South Asian (top priority, high diabetes risk), Middle Eastern, Mediterranean, Latin. GL at most 70 per 2,000 kcal, carbs spread evenly, fibre at least 30 g. |
| Keto (`keto`) | 4 | Mediterranean, Middle Eastern, Asian, Latin. Net carbs at most 40 g. Olive oil, fish, nuts, avocado and greens keep saturated fat under 10%. |
| Low-carb, moderate (`low-carb`) | 3 | Global, Mediterranean, Asian. Carbs at most 100 g. |
| PCOS-friendly (`pcos`) | 2 | Low-GI, protein at least 25%, omega-3 rich, spearmint tea welcome. |
| Vegan (`vegan`) | 4 | Mediterranean-Levant, Indian, East Asian, Latin. B12 from fortified foods every day, calcium-set tofu, seeds for zinc. |
| High-protein vegan (`muscle` + vegan) | 1 | Tofu, tempeh, seitan, legumes, soy milk. |
| Vegetarian (`vegetarian`) | 3 | Mediterranean, global, and Indian lacto-vegetarian with no eggs. |
| Pescatarian (`pescatarian`) | 3 | Japanese-Nordic coast, Mediterranean, Latin-Caribbean coast. |
| Flexitarian (`flexitarian`) | 2 | Global, family. |
| Gluten-free / celiac-friendly (`gluten-free`) | 3 | Latin, South Asian, Mediterranean. Note in the app: check labels for cross-contamination. |
| Dairy-free (`dairy-free`) | 2 | East Asian, global. Calcium from tofu, sardines, greens, fortified plant milk. |
| Top-allergen-free (`allergen-free`) | 2 | No peanuts, tree nuts, eggs, dairy, shellfish or sesame. |
| Heart-healthy / DASH / low-sodium (`heart`) | 3 | Sodium at most 2,000 mg, saturated fat under 7%. |
| Low-cholesterol (`heart` variant) | 2 | Oats, legumes, nuts and plant sterols; very low saturated fat. |
| Anti-inflammatory (`anti-inflammatory`) | 2 | Omega at most 3:1 weekly, fish 3 times. |
| Gut health / high-fibre (`gut`) | 2 | 30 plants a week, fermented foods 5 days. |
| Low-FODMAP (`low-fodmap`) | 2 | Short-term elimination, ideally with a dietitian (the app says so). No onion, garlic, wheat, large legume servings, high-FODMAP fruit or lactose. Garlic-infused oil and scallion greens for flavour. |
| Paleo (`paleo`) | 2 | No grains, legumes, dairy or added sugar. |
| Whole30-style (`whole30`) | 2 | Paleo plus no sweeteners or alcohol, 30-day framing. |
| Muscle gain / bulk (`muscle`) | 4 | 2,400 to 4,200 kcal. Global, Middle Eastern, Asian, Latin. |
| Lean / cut (`fat-loss`) | 3 | 1,200 to 2,200 kcal, high volume and high protein. |
| Endurance (`endurance`) | 2 | High carb around training. |
| Prenatal (`prenatal`) | 2 | Pregnancy DRIs and food-safety bans. |
| Postpartum and breastfeeding (`postpartum`) | 2 | Lactation DRIs, one-hand snacks. |
| Menopause (`menopause`) | 2 | Calcium, vitamin D, protein at every meal, soy and flax. |
| 60+ healthy ageing (`healthy-aging`) | 2 | 25 g protein per main meal, softer textures. |
| Iron focus (`iron-focus`) | 2 | Iron 100% every day for menstruating women. |
| Halal (`halal`) | 2 | Gulf, South Asian. No pork, no alcohol in cooking, halal meat noted. |
| Kosher-style (`kosher`) | 2 | No pork or shellfish, never meat with dairy in a meal. |
| Jain vegetarian (`jain`) | 1 | No meat, fish or eggs, no root vegetables (onion, garlic, potato, carrot). |
| Ramadan (`ramadan`) | 3 | Arabian, South Asian, North African: suhoor and iftar. |
| Intermittent fasting 16:8 (`intermittent-fasting`) | 2 | Two meals and a snack. |
| Busy / 20-minute (`quick`) | 3 | Mediterranean, Asian, global. |
| Budget (`budget`) | 3 | Global, vegetarian, family. |
| Sunday batch-cook (`batch`) | 2 | |
| Family-friendly (`family`) | 2 | Mild, kid-approved, adult-sized. |

About 90 families in all, which makes the whole library about 110 families and 350+ sized plans.

### Batch 2A briefs (diabetes-friendly, vegan, keto, gluten-free)

Rules for each diet are in GUIDE.md §12. Ids start with the diet so the files group together.

**Diabetes-friendly (`low-gi`), Light 1200-1800, Standard, Big:**
1. **`lowgi-south-asia` · Diabetes-friendly South Asian** (North and South India, Pakistan, Sri Lanka). Top priority.
   - **Dishes:** moong dal chilla with mint chutney; vegetable upma made with millet or broken barley; chana masala with a small brown basmati portion; palak paneer or palak tofu with one whole-wheat roti; fish curry (Kerala or Goan) with cabbage thoran; tandoori chicken with kachumber and raita; rajma; sundal snacks; methi in the dal.
   - **Watch:** white rice and white flour only as small sides, if at all. Roti counts carefully. Dal at two meals most days.
2. **`lowgi-middle-east` · Diabetes-friendly Middle Eastern** (Levant, Gulf, Turkey).
   - **Dishes:** ful medames with eggs; mujaddara with bulgur and lots of salad; freekeh with chicken; fattoush with grilled fish; lentil soup; shakshuka; kofta with tabbouleh; hummus and crudités snacks.
3. **`lowgi-med` · Diabetes-friendly Mediterranean** (Greece, Italy, Spain).
   - **Dishes:** Greek yogurt with walnuts and berries; barley risotto with mushrooms; fasolada; sardines with white bean salad; chicken souvlaki with horiatiki; pasta e ceci with more ceci than pasta; frittata; Spanish lentil stew.
4. **`lowgi-latin` · Diabetes-friendly Latin** (Mexico, Central America, Caribbean, South America).
   - **Dishes:** huevos rancheros on one corn tortilla with black beans; sopa de frijoles; chicken tinga lettuce tacos plus one tortilla; ceviche with avocado; Peruvian quinoa and bean salad; pozole with lots of cabbage and radish; arroz con pollo with a modest brown rice portion and a big salad (no cauliflower rice: keep it real).

**Vegan (`vegan`), Light, Standard, Big:**
5. **`vegan-med-levant` · Vegan Mediterranean & Levant.**
   - **Dishes:** overnight oats with soy beverage, walnuts and figs; hummus bowls with tofu; mujaddara; Greek gigantes plaki; falafel baked with tahini salad; lentil and chard soup; tofu "feta" with horiatiki; ful medames; Sicilian caponata with white beans.
6. **`vegan-india` · Vegan Indian** (North and South).
   - **Dishes:** besan chilla; poha with peanuts; chana masala; dal tadka with tofu; rajma; tofu tikka; sambar with idli; chole; palak tofu; coconut-light vegetable korma with cashews; soy-beverage chai.
7. **`vegan-east-asia` · Vegan East Asian** (China, Japan, Korea, Vietnam).
   - **Dishes:** mapo tofu with mushrooms; miso soup with tofu and wakame; tempeh and broccoli stir-fry; Korean tofu jjigae; edamame and soba salad; Vietnamese tofu bánh mì bowl; soy-beverage congee; sesame spinach.
8. **`vegan-latin` · Vegan Latin.**
   - **Dishes:** black bean and sweet potato tacos; tofu scramble rancheros; Peruvian quinoa stew; feijoada-style black beans with smoky tofu; Colombian bean soup; chili sin carne; arepas with black beans and avocado; pepita and lime snacks.

**Keto (`keto`), Light (if it passes), Standard, Big:**
9. **`keto-med` · Keto Mediterranean.**
   - **Dishes:** Greek yogurt (full-fat, small) with walnuts and berries; spinach and feta omelette; salmon with lemon, zucchini and almond gremolata; Greek salad with sardines; chicken souvlaki with tzatziki and cucumber; cauliflower "rice" with shrimp and olives; chia pudding; eggplant moussaka without potato.
10. **`keto-middle-east` · Keto Middle Eastern.**
    - **Dishes:** shakshuka; lamb kofta with tahini and salad; chicken shawarma lettuce bowls with garlic sauce; baba ghanoush with crudités; grilled fish with tahini and herbs; fattoush without bread, with toasted almonds; cauliflower tabbouleh.
11. **`keto-asia` · Keto Asian** (Japan, Korea, Thailand, China).
    - **Dishes:** salmon teriyaki-style with no sugar (tamari and ginger); Thai green curry with chicken and vegetables (light coconut); Korean bulgogi lettuce wraps; egg drop soup with spinach; tofu and mushroom stir-fry; miso salmon; cucumber-sesame salad; edamame snacks.
12. **`keto-latin` · Keto Latin.**
    - **Dishes:** huevos a la mexicana with avocado; carne asada with nopales and salsa; ceviche; chicken fajita bowls without tortillas; Brazilian moqueca with fish (light coconut); chimichurri steak with grilled vegetables; pepita snacks.

**Gluten-free (`gluten-free`), Light, Standard, Big:**
13. **`gf-latin` · Gluten-free Latin.**
    - **Dishes:** arepas with eggs and black beans; corn-tortilla tacos; Peruvian quinoa and chicken soup; Brazilian rice and black beans with greens; ceviche with sweet potato; tamales or pozole; Colombian ajiaco with potatoes; plantain.
14. **`gf-south-asia` · Gluten-free South Asian.**
    - **Dishes:** dosa and idli with sambar; besan chilla; rice and dal; ragi (finger millet) porridge; chicken curry with rice; fish moilee; chana chaat; jowar or bajra roti in place of wheat.
15. **`gf-med` · Gluten-free Mediterranean.**
    - **Dishes:** buckwheat porridge; polenta with mushrooms; risotto; Greek fasolada; grilled fish with lemon potatoes; Spanish tortilla; chickpea socca; lentil salads; rice-stuffed peppers (gemista).

### Batch 2B briefs (vegetarian, muscle gain, lean, heart-healthy)

Rules for each diet are in GUIDE.md §12.

**Vegetarian (`vegetarian`), Light, Standard, Big:**
1. **`veg-med` · Vegetarian Mediterranean.** Shakshuka, spanakopita-style pie, gigantes, Greek yogurt bowls, halloumi and lentil salads, pasta e fagioli, ricotta and spinach frittata, falafel with tahini.
2. **`veg-global` · Vegetarian Global Kitchen.** Mexican bean enchiladas, Japanese tamago and tofu bowls, Italian minestrone, Indian dal, Middle Eastern labneh plates, Ethiopian misir wat, a cheese and lentil shepherd's pie.
3. **`veg-india` · Indian Lacto-vegetarian (no eggs).** Paneer, dahi, chaas and milk carry B12 and calcium; dal, rajma, chole, sambar, palak paneer, poha, upma, idli, kadhi.

**Muscle gain (`muscle`), Standard 2400, Big 3000, XL 3800 (2400-4200):**
4. **`muscle-global` · Build Muscle Global.** Oats with skyr and berries, chicken and rice bowls, salmon with potatoes, lean beef chili, cottage cheese snacks, egg scrambles, pasta with turkey ragù.
5. **`muscle-middle-east` · Build Muscle Middle Eastern.** Shish tawook with rice and salad, ful with eggs, lentil and lamb kofta, labneh and eggs, grilled fish with freekeh, hummus with chicken.
6. **`muscle-asia` · Build Muscle Asian.** Chicken teriyaki rice bowls (little sugar), bibimbap with beef and egg, tofu and edamame stir-fries, salmon onigiri, Thai basil chicken with rice, congee with egg and fish.
7. **`muscle-latin` · Build Muscle Latin.** Huevos rancheros with beans, burrito bowls, Peruvian lomo saltado with potatoes, arroz con pollo, ceviche with sweet potato, Brazilian rice, beans and grilled chicken.

**Lean / cut (`fat-loss`), Light 1200-1800, Standard 1800-2200:**
8. **`lean-med` · Lean Mediterranean.** Big Greek salads with chicken, lentil soups, grilled fish with vegetables, Greek yogurt bowls, egg-white frittata with feta.
9. **`lean-global` · Lean Global Kitchen.** Turkey chili, chicken burrito bowls on greens, miso soup with tofu and soba, shrimp stir-fry with lots of vegetables, cottage cheese and fruit.
10. **`lean-asia` · Lean Asian.** Vietnamese chicken pho with lots of herbs, Japanese grilled fish set meals, Korean tofu soups, Thai larb lettuce cups, Chinese steamed fish and greens.

**Heart-healthy (`heart`), Light, Standard, Big:**
11. **`heart-med` · Heart-healthy Mediterranean.** Oats with walnuts, sardines and white bean salad, lentil soup, baked salmon with greens, chickpea stews, olive oil and lemon everywhere, no-salt-added tomatoes.
12. **`heart-dash` · DASH North American.** Overnight oats, turkey and bean chili (no-salt-added), baked trout, big salads, sweet potatoes, low-fat yogurt, unsalted nuts, fruit with every breakfast.
13. **`heart-asia` · Heart-healthy Asian.** Brown rice and steamed fish, tofu and vegetable stir-fries with low-sodium tamari in small amounts, edamame, miso in small amounts, ginger-scallion salmon.

### Batch C briefs (pregnancy, breastfeeding, PCOS, menopause)

Rules for each are in GUIDE.md §12, starting with "Batch C rule: healthy first, never sicker".

**Pregnancy (`prenatal`), Standard 1800-2400 and Big 2400-3200:**
1. **`prenatal-global` · Pregnancy Global Kitchen.** Canadian home cooking with global dishes: oats and eggs cooked through, salmon and trout, lentil soup, beef and bean chili, chicken traybakes, yogurt and fruit. Plain breakfasts for queasy mornings.
2. **`prenatal-south-asia` · Pregnancy South Asian.** Dal, palak, egg bhurji (set eggs), low-mercury fish curry, paneer, roti, poha, khichdi, ripe fruit (no green papaya).

**Postpartum and breastfeeding (`postpartum`), Standard 1800-2400 and Big 2400-3200:**
3. **`postpartum-global` · Postpartum Global Kitchen.** One-hand snacks, freezer meals, a Sunday batch cook: oat bars, egg muffins, chili, salmon, soups, wraps.
4. **`postpartum-asia` · Postpartum Asian.** Inspired by warming postpartum traditions: ginger and sesame chicken soup (no rice wine), miyeok-guk with a little seaweed, congee with fish, dal and rice, sesame-ginger greens.

**PCOS (`pcos`), Light 1400-1800 and Standard 1800-2200:**
5. **`pcos-med` · PCOS-friendly Mediterranean.** Lentils, chickpeas, barley and bulgur, fish twice a week, eggs and Greek yogurt at breakfast, olive oil, lots of vegetables.
6. **`pcos-south-asia` · PCOS-friendly South Asian.** Moong chilla, dals and chana, millets and brown basmati, tandoori fish and chicken, raita, vegetable sabzis.

**Menopause (`menopause`), Light 1600-1800 and Standard 1800-2200:**
7. **`menopause-med` · Menopause Mediterranean.** Yogurt and almonds, sardines and salmon with bones, white beans and greens, eggs, olive oil, fortified soy drink in coffee.
8. **`menopause-japan` · Menopause Japanese.** Soy-rich: tofu, natto or edamame, miso soup (small), grilled salmon and mackerel, sesame greens, calcium-set tofu, soy drink.

### Batch D: approved by Firas (Nov 4)

Firas went through the batch D list and kept 17 families plus two computed tags. Everything else in the diet table above
that isn't built yet is **dropped** (see "Dropped from the plan" below). Rules for each diet go in GUIDE.md §12 before
its writers start.

**Tags and filters only (no families):**
- **Halal-friendly:** computed for every plan. No pork products, no alcohol, no gelatin. The app says halal meat is the
  cook's choice; it can't check that.
- **Kosher-style:** computed for every plan. No pork, no shellfish, never meat with dairy in the same meal.

**Families:**
1. **`muscle-plant` · Build Muscle Plant-based** (`muscle` gates plus the vegan ban). Tofu, tempeh, seitan, lentils,
   edamame and soy milk carry 30% protein from food, no powders. Standard and Big, XL if it passes. B12 from fortified
   soy drink, as in the vegan families.
2. **`pescatarian-med` · Pescatarian Mediterranean** (`pescatarian`). Fish and seafood most days, legumes, eggs and
   dairy; grilled sardines, octopus or shrimp, fish soups, bean stews.
3. **`pescatarian-north` · Pescatarian Japanese and Nordic Coast.** Salmon, mackerel, herring, cod, rye, potatoes,
   miso, tofu, pickles; low-mercury fish only.
4. **`dairy-free-east-asia` · Dairy-free East Asian** (`dairy-free`). Calcium from calcium-set tofu, fortified soy
   drink, greens, sesame and small fish with bones.
5. **`allergen-free-global` · Top-Allergen-free Kitchen** (new `allergen-free`). No peanuts, tree nuts, eggs, dairy,
   shellfish or sesame. Seeds such as sunflower and pumpkin, fortified oat drink, fish, poultry, legumes. The app
   reminds people to check every label for "may contain".
6. **`gut-global` · Gut Health Kitchen** (`gut`). About 30 different plants a week, a fermented food on 5 days
   (yogurt, kefir, kimchi, sauerkraut, miso), fibre at least 35 g.
7. **`endurance-global` · Endurance Kitchen** (`endurance`). Carbs built around training (rice, pasta, oats,
   potatoes, fruit), protein spread through the day, salty foods allowed around long sessions within the ceiling.
8. **`healthy-aging-global` · Healthy Ageing 60+** (`healthy-aging`). 25 g of protein at every main meal, B12, calcium
   and vitamin D foods, softer textures, easy cooking for one or two.
9. **`iron-focus-global` · Iron Focus** (`iron-focus`). Iron at 100% of the adult woman's need every day, with vitamin
   C at the iron meals, and tea and coffee kept away from them.
10. **`ramadan-arabia` · Ramadan Arabian** (`ramadan`). Suhoor and iftar: dates and water, lentil soup, fattoush,
    grilled meats and fish, rice dishes, slow-release suhoor (oats, eggs, labneh, ful).
11. **`ramadan-south-asia` · Ramadan South Asian.** Dates, a lighter take on pakora, chana chaat, haleem, biryani,
    dal, fruit chaat, suhoor parathas made lighter.
12. **`ramadan-global` · Ramadan Global Kitchen.** Iftar and suhoor built from everyday Canadian, Mediterranean and
    Turkish dishes.
    - **All three Ramadan plans** carry a note: people with diabetes, who are pregnant or breastfeeding, or who take
      medication should talk to their care team before fasting.
13. **`quick-global` · 20-minute Global** (`quick`). Weeknight dinners in 20 minutes; sheet pans, stir-fries,
    one-pan pasta.
14. **`quick-asia` · 20-minute Asian.** Stir-fries, rice bowls, noodle soups and quick curries.
15. **`budget-global` · Budget Kitchen** (`budget`). Dried beans and lentils, eggs, canned fish, chicken thighs,
    frozen vegetables, oats and rice.
16. **`budget-veg` · Budget Vegetarian.** Legumes, eggs, dairy, seasonal vegetables, whole grains.
17. **`family-global` · Family Kitchen** (`family`). Mild, kid-approved dishes at adult portions: tacos, pasta bake,
    sheet-pan chicken, fish fingers done right, soups.

**Dropped from the plan** (Firas, Nov 4), with the reason:
- **Low-carb:** keto and diabetes-friendly already cover it.
- **Flexitarian:** the regional families already eat this way.
- **Low-cholesterol:** heart-healthy covers it.
- **Anti-inflammatory:** the framework already leans this way.
- **Low-FODMAP:** clinical, short-term, needs a dietitian.
- **Paleo and Whole30:** they cut legumes, the framework's backbone.
- **Jain:** too niche.
- **Intermittent fasting 16:8:** not needed.
- **Sunday batch-cook:** every family already cooks once and eats twice.

## Not offered, and why
- **Carnivore:** it can't reach vitamin C, folate or fibre, and contradicts the framework.
- **Raw vegan:** can't reliably reach B12, vitamin D, iodine or zinc.
- **Kidney (renal), low-residue and other medical diets:** they need individual clinical limits (potassium, phosphorus, fibre) that conflict with the 80% targets. These need a clinician.
- **Plans under 1,200 kcal:** they can't meet the micronutrient floor, and they aren't safe without medical supervision.
