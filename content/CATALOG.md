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

## Not offered, and why
- **Carnivore:** it can't reach vitamin C, folate or fibre, and contradicts the framework.
- **Raw vegan:** can't reliably reach B12, vitamin D, iodine or zinc.
- **Kidney (renal), low-residue and other medical diets:** they need individual clinical limits (potassium, phosphorus, fibre) that conflict with the 80% targets. These need a clinician.
- **Plans under 1,200 kcal:** they can't meet the micronutrient floor, and they aren't safe without medical supervision.
