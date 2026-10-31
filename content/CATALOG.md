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

## Wave 2: eating patterns (12)
- **Vegan (4):**
  - `vegan-levant` · Vegan Mediterranean and Levant (Light to Big);
  - `vegan-india` · Vegan Indian;
  - `vegan-east-asia` · Vegan East Asian (tofu, tempeh, edamame, natto if it's in the list);
  - `vegan-latin` · Vegan Latin.

  Every vegan family:
  - B12 through fortified soy milk or fortified nutritional yeast every day, and the `about` says so kindly;
  - calcium-set tofu;
  - seeds for zinc;
  - an iron and vitamin C pairing at every main meal;
  - walnuts, chia and flax for omega-3.
- **Vegetarian (3), lacto-ovo:**
  - `veg-mediterranean`;
  - `veg-india`;
  - `veg-global` · World Vegetarian.
- **Pescatarian (3):**
  - `pesca-coastal` · Japanese and Nordic coast;
  - `pesca-med` · Mediterranean seafood;
  - `pesca-latin` · Latin American and Caribbean coast.
- **Flexitarian (2):** plant-forward, with meat once or twice a week.
  - `flexi-global`;
  - `flexi-family`.

## Wave 3: goals (24)
- **Muscle gain (5):** 2400-4200, Standard, Big and XL. Protein ≥30%, spread over 4 or 5 meals of 30 to 50 g, with a pre- and post-training snack.
  - `muscle-global`;
  - `muscle-middle-east`;
  - `muscle-asia`;
  - `muscle-latin`;
  - `muscle-vegan`, built on tofu, tempeh, seitan only if it's in the list, legumes and soy milk.
- **Fat loss (3):** 1200-2200, Light and Standard. Big volume and protein ≥30%, so people feel full.
  - `lean-med`;
  - `lean-asia`;
  - `lean-latin`.
- **Endurance (2):** 2400-4200. Carbs ≥50%, built around training days.
  - `endurance-global`;
  - `endurance-med`.
- **Low-GI and diabetes-friendly (4):** 1200-2800. GL ≤70 per 2000 kcal, fibre ≥30 g, and carbs spread evenly.
  - `lowgi-med`;
  - `lowgi-south-asia` (high priority: South Asians carry a high diabetes risk);
  - `lowgi-middle-east`;
  - `lowgi-latin`.
- **Keto (2):** net carbs ≤40 g. Mediterranean-style, built on olive oil, avocado, nuts, fish, eggs and greens, so saturated fat stays under 10%.
  - `keto-med`;
  - `keto-global`.
- **Low-carb (2):** ≤100 g carbs.
  - `lowcarb-med`;
  - `lowcarb-global`.
- **Heart-healthy (2):** DASH-style, sodium ≤2000 mg, saturated fat <7%.
  - `heart-dash`;
  - `heart-med`.
- **Gut health (2):** 30 plants a week, fermented foods on 5 days, fibre ≥35 g.
  - `gut-30-plants`;
  - `gut-fermented`.
- **Anti-inflammatory (2):** omega ≤3:1, fish 3 times a week, colourful plants.
  - `anti-inflam-med`;
  - `anti-inflam-asia`.

## Wave 4: life stage and lifestyle (22)
- **Prenatal (2):** pregnancy DRIs (iron 27 mg, folate 600 µg, iodine 220 µg, choline 450 mg); no high-mercury, raw or smoked fish; no liver; eggs fully cooked; pasteurised cheeses only.
  - `prenatal-med`;
  - `prenatal-global`.
- **Postpartum and breastfeeding (1):** `postpartum`. Lactation DRIs, one-hand snacks, batch-friendly.
- **60+ healthy ageing (2):** 25 g of protein at each main meal, B12, D and calcium, softer textures, smaller portions.
  - `aging-med`;
  - `aging-global`.
- **Family-friendly (2):** mild, kid-approved, adult-sized.
  - `family-weeknights`;
  - `family-world`.
- **20-minute meals (3):**
  - `quick-med`;
  - `quick-asia`;
  - `quick-global`.
- **Sunday batch-cook (2):** 2 cook sessions cover the week.
  - `batch-sunday`;
  - `batch-veg`.
- **Budget (2):** legumes, eggs, canned fish, frozen veg, oats.
  - `budget-global`;
  - `budget-veg`.
- **Ramadan (2):** a suhoor that keeps you full and an iftar that starts with dates and water, then soup, then the main, plus a late snack.
  - `ramadan-arabian`;
  - `ramadan-south-asia`.
- **16:8 intermittent fasting (1):** `if-16-8`. Two meals and a snack, in a noon to 8 pm window.
- **Gluten-free (1):** `gluten-free-world`.
- **Dairy-free (1):** `dairy-free-world`.
- **Iron focus (1):** `iron-focus`. For menstruating women: iron at 100% every day, vitamin C pairings, and tea away from meals.
- **Grain-free paleo-style (1):** `paleo`.

## Not offered, and why
- **Carnivore:** it can't reach vitamin C, folate or fibre, and contradicts the framework.
- **Low-FODMAP:** a clinical diet that needs a dietitian's review. Planned for later, with professional input.
- **Plans under 1,200 kcal:** they can't meet the micronutrient floor, and they aren't safe without medical supervision.
