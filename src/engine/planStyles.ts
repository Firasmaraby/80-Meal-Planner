/**
 * Plan styles: the identity of a plan family and the extra checks it has to pass on top of the framework defaults
 * (planReport RULES: protein >= 20% of kcal, sat fat < 10%, omega 6:3 <= 6:1 over the week (4:1 earns a badge) and <= 9:1 on any day, GL <= 100 a day, fatty fish twice a week).
 *
 * `PLAN_STYLES[style].gates` is plain config. scripts/plan-lab.mjs reads it through:
 *   gradeOptionsFor     who to grade against and which RULES change (protein floor, sat fat, GL, fish...)
 *   styleStructureGates what the week is made of (banned foods, slots, spicy recipes, grocery count...), once per size
 *   styleNutrientGates  what a sized day delivers (fibre, carbs, sodium, iron, protein per meal...), at each band edge
 */
import { dayPlanTotal, getFood, type FoodIndex } from './calc';
import { carbStyleOfFood } from './carbStyle';
import { caffeineMgPer100g, isPlantDairy } from './foodRoles';
import { requirement } from './dri';
import { REFERENCE_PANEL, type ReferencePerson, type Rules } from './planReport';
import type { Food, FoodCategory, LifeStage, MealPlan, MealSlot, PlanStyle } from './types';

// ── Foods a style rules out ────────────────────────────────────────────────

const FEMALE: ReferencePerson = { sex: 'female', age: 40, lifeStage: 'none' };

// The name only: a food's head can be misleading (butter beans have the head "butter").
const lower = (f: Pick<Food, 'name'>) => f.name.toLowerCase();

// Categories whose odd names (soybean curd cheese, peanut butter, honeydew, crab apple) are never animal products.
const PLANT_CATEGORIES = new Set<FoodCategory>(['fruit', 'legume', 'nut_seed']);
// Dairy and egg foods are animal products by category; their names must not trip the meat words (goat cheese).
const ANIMAL_CATEGORIES = new Set<FoodCategory>(['dairy', 'egg', 'meat', 'poultry', 'fish']);

// names that say "plant" even though they contain a dairy or egg word
const PLANT_LOOKALIKES =
  /\b(coconut|almond|soy|soya|oat|rice|cashew|hemp|pea|nut|plant-based|cocoa|shea|peanut|sunflower|seed)\b[ -]*(milk|butter|cream|beverage)|butter (bean|lettuce)|cream (of (tartar|wheat|rice)|style)|egg[- ]free|(without|no) (fish|meat|egg|dairy|milk|butter|cream|cheese)|lamb'?s lettuce|cocoa oil butter|oyster mushrooms?|scallop squash/g;
const DAIRY_WORDS = /\b(milk|cream|cheese|custard|yogh?urt|kefir|whey|casein|ghee|butter|buttermilk|paneer|skyr|labneh)\b/;
const EGG_WORDS = /\b(eggs?|mayonnaise|mayo)\b/;
const ANIMAL_FAT_WORDS = /\b(lard|tallow|suet|schmaltz|dripping|animal fat|bone broth)\b/;
const MEAT_WORDS =
  /\b(chicken|beef|pork|ham|bacon|turkey|duck|goose|lamb|veal|venison|bison|goat|rabbit|sausages?|salami|pepperoni|prosciutto|meatballs?|meat|jerky|hot ?dog|kebab)\b/;
const FISH_WORDS =
  /\b(fish|tuna|salmon|cod|haddock|trout|shrimps?|prawns?|anchov\w*|sardines?|mackerel|herring|crab|lobster|clams?|oysters?|mussels?|squid|calamari|scallops?|bonito|katsuobushi|surimi)\b/;

/** The reason a food is an animal product by name or category, if it is. `dairy`/`egg` control which families count. */
function animalReason(f: Food, opts: { dairy: boolean; egg: boolean; flesh: boolean; other: boolean }): string | undefined {
  if (opts.flesh && ['meat', 'poultry', 'fish'].includes(f.category)) return f.category === 'fish' ? 'fish' : 'meat';
  if (isPlantDairy(f)) return undefined;
  if (opts.dairy && f.category === 'dairy') return 'dairy';
  if (opts.egg && f.category === 'egg') return 'egg';
  if (PLANT_CATEGORIES.has(f.category)) return undefined;
  const t = lower(f).replace(PLANT_LOOKALIKES, ' ');
  if (opts.other && ANIMAL_FAT_WORDS.test(t)) return 'animal fat';
  if (opts.other && /\b(honey|gelatin|gelatine)\b/.test(t)) return /honey/.test(t) ? 'honey' : 'gelatin';
  if (opts.dairy && DAIRY_WORDS.test(t)) return 'dairy';
  if (opts.egg && EGG_WORDS.test(t)) return 'egg';
  if (opts.flesh && !ANIMAL_CATEGORIES.has(f.category)) {
    if (MEAT_WORDS.test(t)) return 'meat';
    if (FISH_WORDS.test(t) || /\b(fish|oyster) sauce\b/.test(t)) return 'fish';
  }
  return undefined;
}

const GLUTEN_GRAINS = /\b(wheat|barley|rye|spelt|bulgur|couscous|freekeh|farro|kamut|khorasan|semolina|seitan|malt|orzo|durum|udon|somen)\b/;
const GLUTEN_PRODUCTS =
  /\b(breads?|pasta|noodles?|spaghetti|macaroni|lasagna|crackers?|bagels?|pit+a|naan|chapati|roti|tortillas?|flour|rolls?|buns?|croutons?|breadcrumbs?|pancakes?|waffles?|muffins?|cakes?|cookies?|pies?|biscuits?|croissants?|wraps?|sandwich|pizza|baguette|ciabatta|dumplings?|brioche|cr[eê]pes?|scones?|pastry|doughnuts?|donuts?|pretzels?|baklava|eclair|cream puff|tarts?|gingerbread|shortbread|crumpets?|phyllo|focaccia|ravioli|gnocchi|lasagna|burgers?|hamburger|stuffing|paratha|breadsticks?|wontons?|samosas?|cheesecake|dosa)\b|cheesecake/;
const GLUTEN_SAFE = /gluten[- ]free|\b(corn|rice|buckwheat|quinoa|tapioca|cassava|potato|chickpea|lentil|mung|konjac|shirataki|almond|coconut)\b|potato (flour|starch)|without wheat/;
const NUT_WORDS = /\b(almonds?|walnuts?|pecans?|cashews?|pistachios?|hazelnuts?|filberts?|macadamias?|brazil nuts?|pine nuts?|peanuts?|chestnuts?|nuts?|marzipan|praline|nougat|trail mix)\b/;

function glutenReason(f: Food): string | undefined {
  const t = lower(f);
  if (/\bsoy sauce\b|shoyu/.test(t)) return /tamari|gluten[- ]free/.test(t) ? undefined : 'soy sauce (use tamari)';
  // Asian pastes and sauces that are usually made with wheat flour or barley
  const paste = t.match(/\b(doubanjiang|chili bean paste|gochujang|ssamjang|doenjang|hoisin|teriyaki|oyster sauce|black bean sauce)\b/);
  if (paste && !/gluten[- ]free/.test(t)) return `${paste[1]} (usually has wheat)`;
  if (/\bwheat\b/.test(t) && !/gluten[- ]free|wheat[- ]free/.test(t)) return 'wheat';
  // oats are usually cross-contaminated with wheat; only oats sold as gluten-free are safe for celiac disease
  if (/\boats?\b|\boatmeal\b/.test(t) && !/gluten[- ]free/.test(t)) return 'oats (not certified gluten-free)';
  if (GLUTEN_GRAINS.test(t) && !GLUTEN_SAFE.test(t)) return t.match(GLUTEN_GRAINS)![1];
  if (['grain', 'prepared', 'sweet', 'other'].includes(f.category) && GLUTEN_PRODUCTS.test(t) && !GLUTEN_SAFE.test(t) && !/^(\w+ ){0,2}sauce/.test(t))
    return t.match(GLUTEN_PRODUCTS)![1];
  return undefined;
}

const MERCURY_FISH = /\b(shark|swordfish|king mackerel|tilefish|marlin|bigeye tuna|orange roughy)\b/;
const RAW_OR_SMOKED_FISH = /\b(smoked|lox|gravlax|sashimi|ceviche|tartare|carpaccio|sushi|kippered|nigiri)\b/;
const SOFT_CHEESE = /\b(brie|camembert|blue cheese|gorgonzola|roquefort|stilton|danish blue)\b|unpasteuri[sz]ed|raw milk/;

// Health Canada, pregnancy: deli and dry-cured meats, refrigerated pate and hot dogs carry listeria unless heated until steaming
const DELI_MEAT = /\b(salami|pepperoni|prosciutto|mortadella|bologna|pastrami|hot dogs?|frankfurters?|wieners?|luncheon meat|lunch meat|deli|cold cuts|p[âa]t[ée]|liverwurst|dry[- ]cured|summer sausage)\b/;
const RAW_SPROUTS = /\b(alfalfa|clover|radish|broccoli|mung bean|bean)\b.*\bsprouts?\b|\bsprouts?\b.*\braw\b|sprouted.*\braw\b/;
// herbal teas Health Canada asks pregnant women to avoid
const AVOID_TEAS = /\b(chamomile|aloe|coltsfoot|juniper|pennyroyal|buckthorn|comfrey|labrador tea|sassafras|duck root|lobelia|senna)\b/;
// alcohol in any form (no safe amount in pregnancy or while breastfeeding); vinegars, ginger ale and alcohol-free products are fine
const ALCOHOL = /\b(wine|beer|lager|stout|sake|mirin|rum|brandy|cognac|vodka|gin|whiske?y|bourbon|liqueur|shaoxing|marsala|vermouth|sherry|hard cider|alcoholic)\b/;
const NOT_ALCOHOL = /vinegar|ginger ale|non-?alcoholic|alcohol[- ]free|de-?alcoholi[sz]ed|root beer|wine grape|winged/;

function alcoholReason(f: Food): string | undefined {
  const t = lower(f);
  return ALCOHOL.test(t) && !NOT_ALCOHOL.test(t) ? 'alcohol' : undefined;
}

function prenatalReason(f: Food): string | undefined {
  const t = lower(f);
  if (MERCURY_FISH.test(t)) return 'high-mercury fish';
  if (DELI_MEAT.test(t)) return 'deli or cured meat (listeria)';
  if (RAW_SPROUTS.test(t)) return 'raw sprouts';
  if (AVOID_TEAS.test(t)) return 'herbal tea to avoid in pregnancy';
  if (/\b(green|unripe)\b.*\bpapaya\b|\bpapaya\b.*\b(green|unripe)\b/.test(t)) return 'unripe papaya';
  if (alcoholReason(f)) return 'alcohol';
  // smoked paprika, smoked tofu or smoked chicken cooked in a hot dish are fine: only fish and seafood count here
  if (f.category === 'fish' && RAW_OR_SMOKED_FISH.test(t)) return 'raw or smoked fish';
  if (/\bliver\b/.test(t)) return 'liver';
  // "Egg, whole, raw" is how the library names an egg you cook, so only poached and soft eggs are caught here; raw egg in the method is caught by styleStructureGates
  if (f.category === 'egg' && /\b(poached|soft)\b/.test(t)) return 'raw or soft egg';
  if (SOFT_CHEESE.test(t)) return 'unpasteurised or soft-ripened cheese';
  return undefined;
}

// Foods that look like grains or legumes by category but are leavening, chia or fresh green pods.
const PALEO_OK = /chia|yeast|baking (soda|powder)|green beans?|string beans?|snow peas?|snap peas?|sugar snap|wax beans?|pea pods?/;
const PALEO_SWEET_OK = /honey|maple|cocoa|baking chocolate|no added sugar|70-85|stevia|fruit leather|banana chips|plantain chips|trail mix|jerky|vegetable chips/;

function paleoReason(f: Food): string | undefined {
  const t = lower(f);
  if (PALEO_OK.test(t)) return undefined;
  if (f.category === 'grain' || carbStyleOfFood(f) !== 'whole') return 'grain';
  if (f.category === 'legume') return 'legume';
  if (f.category === 'dairy' || (!PLANT_CATEGORIES.has(f.category) && DAIRY_WORDS.test(t.replace(PLANT_LOOKALIKES, ' ')))) return 'dairy';
  if (f.category === 'sweet') return PALEO_SWEET_OK.test(t) ? undefined : 'added sugar';
  if (/added sugar|sweetened|syrup/.test(t) && !/no added sugar|unsweetened|maple/.test(t)) return 'added sugar';
  return undefined;
}

// pork in any form; beef, turkey or chicken versions of a sausage are fine
const PORK = /\b(pork|ham|bacon|lard|prosciutto|pancetta|guanciale|pepperoni|chorizo|salami|mortadella|hot dogs?|wieners?|frankfurters?|chicharr[oó]n|spareribs?|baby back)\b/;
const NOT_PORK = /\b(beef|turkey|chicken|veggie|vegetarian|plant-based|soy|tofu|mushroom|eggplant)\b/;
const SHELLFISH = /\b(shrimps?|prawns?|crabs?|lobsters?|crayfish|crawfish|langoustines?|clams?|mussels?|oysters?|scallops?|squid|calamari|octopus|cuttlefish|sea urchin|abalone|whelks?|cockles?|shellfish)\b/;
const SESAME = /\b(sesame|tahini|tahina|halva|halwa|gomasio|za'?atar|dukkah)\b/;

export type BanId = 'animal' | 'flesh' | 'meat-poultry' | 'dairy' | 'egg' | 'gluten' | 'nuts' | 'prenatal' | 'alcohol' | 'mercury' | 'pork' | 'shellfish' | 'sesame' | 'paleo';

/** Each ban answers with the reason a food is out, or undefined when it is fine. */
export const FOOD_BANS: Record<BanId, (f: Food) => string | undefined> = {
  animal: (f) => animalReason(f, { dairy: true, egg: true, flesh: true, other: true }),
  flesh: (f) => animalReason(f, { dairy: false, egg: false, flesh: true, other: false }) ?? (ANIMAL_FAT_WORDS.test(lower(f)) ? 'animal fat' : undefined),
  'meat-poultry': (f) => {
    if (f.category === 'meat' || f.category === 'poultry') return 'meat or poultry';
    return !ANIMAL_CATEGORIES.has(f.category) && !PLANT_CATEGORIES.has(f.category) && MEAT_WORDS.test(lower(f).replace(PLANT_LOOKALIKES, ' '))
      ? 'meat or poultry'
      : undefined;
  },
  dairy: (f) => animalReason(f, { dairy: true, egg: false, flesh: false, other: false }),
  egg: (f) => animalReason(f, { dairy: false, egg: true, flesh: false, other: false }),
  gluten: glutenReason,
  nuts: (f) => (NUT_WORDS.test(lower(f).replace(/without nuts?|water chestnuts?/g, ' ')) ? 'nuts' : undefined),
  prenatal: prenatalReason,
  alcohol: alcoholReason,
  mercury: (f) => (MERCURY_FISH.test(lower(f)) ? 'high-mercury fish' : undefined),
  pork: (f) => (!PLANT_CATEGORIES.has(f.category) && PORK.test(lower(f)) && !NOT_PORK.test(lower(f)) ? 'pork' : undefined),
  shellfish: (f) => (SHELLFISH.test(lower(f)) && !PLANT_CATEGORIES.has(f.category) ? 'shellfish' : undefined),
  sesame: (f) => (SESAME.test(lower(f)) ? 'sesame' : undefined),
  paleo: paleoReason,
};

// ── The styles ─────────────────────────────────────────────────────────────

export interface StyleGates {
  /** overrides for planReport RULES (protein floor, sat fat ceiling, omega, fatty fish...) */
  rules?: Partial<Rules>;
  /** glycemic load ceiling per 2000 kcal; scales with the day's calories */
  glPer2000Kcal?: number;
  /** the day's fibre floor in g; `below1800` replaces it under 1800 kcal */
  fibreMinG?: number;
  fibreMinGBelow1800?: number;
  /** carbs as % of kcal */
  carbsMinPct?: number;
  carbsMaxG?: number;
  /** carbs minus fibre */
  netCarbsMaxG?: number;
  sodiumMaxMg?: number;
  /** iron as a fraction of the adult woman's RDA, every day */
  ironFemaleRda?: number;
  /** protein in g at each of breakfast, lunch and dinner */
  proteinPerMainMealG?: number;
  bans?: BanId[];
  /** red meat (category meat) and poultry or fish days allowed in 7 */
  maxRedMeatDays?: number;
  maxPoultryFishDays?: number;
  plantFoodsPerWeek?: number;
  fermentedDaysPerWeek?: number;
  /** recipe tags that rule a recipe out */
  noTags?: string[];
  /** prepMin + cookMin ceiling on days 1 to 5 (leftovers count as 0) */
  quickMinutes?: number;
  maxGroceries?: number;
  premium?: { re: RegExp; label: string; maxDays: number };
  noSlots?: MealSlot[];
  slotNames?: Partial<Record<MealSlot, string>>;
  /** grade against this person only (female) with this life stage */
  lifeStage?: Exclude<LifeStage, 'none'>;
  /** grade against an adult woman of this age only (PCOS, menopause) */
  femalePanelAge?: number;
  /** grade against the usual woman and man, both at this age (healthy ageing: the 51-70 DRIs) */
  panelAge?: number;
  /** no band may start below this (no dieting in pregnancy, no deep deficit while breastfeeding) */
  minKcal?: number;
  /** caffeine per day, mg (Health Canada: 300 mg in pregnancy and while breastfeeding) */
  caffeineMaxMg?: number;
  /** canned white (albacore) tuna per week, g (Health Canada, pregnancy: 300 g) */
  albacoreMaxGWeek?: number;
  /** iron from food, mg a day: leaves room under the 45 mg upper limit for the iron in a prenatal vitamin (Health Canada: 16 to 20 mg) */
  ironMaxMg?: number;
}

export interface PlanStyleInfo {
  label: string;
  blurb: string;
  gates: StyleGates;
  /** shown on the plan: what the plan does and doesn't cover, and when to follow a care provider instead */
  note?: string;
}

export const FERMENTED_NAMES = /\b(yogh?urt|kefir|kimchi|sauerkraut|miso|tempeh)\b/i;
export const isFermented = (f: Food) => !!f.tags?.includes('fermented') || FERMENTED_NAMES.test(f.name);
export const PREMIUM_FOODS = /\bsalmon\b(?!.*canned)|tenderloin|\bscallops?\b|lamb,? rack|rack of lamb|pine nuts?|macadamia/i;

export const PLAN_STYLES: Record<PlanStyle, PlanStyleInfo> = {
  // eating patterns
  balanced: { label: 'Balanced', blurb: 'Everything in moderation, built on the framework defaults.', gates: {} },
  vegan: {
    label: 'Vegan',
    blurb: 'Plants only: legumes, whole grains, nuts and seeds, with fortified foods for B12.',
    gates: { bans: ['animal'], rules: { fattyFishPerWeek: 0 } },
  },
  vegetarian: {
    label: 'Vegetarian',
    blurb: 'No meat, poultry or fish. Eggs, dairy and legumes carry the protein.',
    gates: { bans: ['flesh'], rules: { fattyFishPerWeek: 0 } },
  },
  pescatarian: { label: 'Pescatarian', blurb: 'Fish and shellfish, no meat or poultry.', gates: { bans: ['meat-poultry'] } },
  flexitarian: {
    label: 'Flexitarian',
    blurb: 'Mostly plants, with a little meat, poultry and fish.',
    gates: { maxRedMeatDays: 1, maxPoultryFishDays: 4 },
  },
  // goals
  muscle: { label: 'Build muscle', blurb: 'A high-protein week for training and gaining lean mass.', gates: { rules: { proteinMinPctKcal: 30 } } },
  'muscle-plant': {
    label: 'Build muscle, plant-based',
    blurb: 'A high-protein vegan week from tofu, tempeh, seitan and legumes, no powders.',
    gates: { rules: { proteinMinPctKcal: 30, fattyFishPerWeek: 0 }, bans: ['animal'] },
    note: 'B12 comes from a fortified soy drink in this week; check the carton, and a B12 supplement is the safe bet on a vegan diet.',
  },
  'fat-loss': {
    label: 'Fat loss',
    blurb: 'High protein and high fibre to stay full on fewer calories.',
    gates: { rules: { proteinMinPctKcal: 30 }, fibreMinG: 30 },
  },
  endurance: {
    label: 'Endurance',
    blurb: 'Carbs first to fuel long training days, with enough protein to recover.',
    gates: { carbsMinPct: 50, rules: { proteinMinPctKcal: 18, glycemicLoadMax: Infinity } },
    note: "Training needs change a lot from week to week, so eat more on big days and when you're hungry. If you're losing weight without trying, your periods have stopped, or you keep getting injured or ill, see a doctor or a sports dietitian. If you take blood-pressure, heart or kidney medication, check the salty foods with your care team.",
  },
  'low-gi': {
    label: 'Low glycaemic',
    blurb: 'Slow carbs and lots of fibre for steady blood sugar.',
    gates: { glPer2000Kcal: 70, fibreMinG: 30 },
  },
  keto: {
    label: 'Keto',
    blurb: 'Very low carb, so fat does most of the work. Net carbs stay at 40 g or less.',
    gates: { netCarbsMaxG: 40 },
  },
  'low-carb': { label: 'Low carb', blurb: 'Carbs held to 100 g a day, with vegetables, protein and healthy fats.', gates: { carbsMaxG: 100 } },
  heart: {
    label: 'Heart healthy',
    blurb: 'Low sodium and low saturated fat, rich in fish, legumes and olive oil.',
    gates: { sodiumMaxMg: 2000, rules: { satFatMaxPct: 7 } },
    note: "If you take blood-pressure or heart medication, follow your care team's advice on salt and diet.",
  },
  gut: {
    label: 'Gut health',
    blurb: 'Plenty of fibre, plant variety and fermented foods.',
    gates: { fibreMinG: 35, fibreMinGBelow1800: 30, plantFoodsPerWeek: 30, fermentedDaysPerWeek: 5 },
    note: "This week is high in fibre: if you usually eat less, build up over a couple of weeks and drink water through the day. If you have IBS or inflammatory bowel disease, follow a low-FODMAP plan, or have been told to limit fibre, check with your care team first. If you're pregnant or have a weakened immune system, choose pasteurised yogurt and kefir, and heat kimchi and sauerkraut until steaming (or skip them) unless your care team says otherwise.",
  },
  'anti-inflammatory': {
    label: 'Anti-inflammatory',
    blurb: 'Oily fish, olive oil, colour and spices, with a tight omega balance.',
    gates: { rules: { omegaMaxRatio: 3, omegaDayMaxRatio: 5, fattyFishPerWeek: 3 } },
  },
  // life stage
  prenatal: {
    label: 'Pregnancy',
    blurb: 'Graded on pregnancy needs, with the foods to avoid left out.',
    gates: { lifeStage: 'pregnant', bans: ['prenatal'], minKcal: 1800, caffeineMaxMg: 300, albacoreMaxGWeek: 300, ironMaxMg: 29 },
    note: "Keep taking a prenatal vitamin with 0.4 mg of folic acid, as Health Canada advises. Vitamin D and iodine are hard to get from food, so check that yours has them, or ask your care provider. This week already brings a good amount of iron from food and leaves room for the iron in a prenatal vitamin, so don't add a separate iron pill unless your care provider tells you to. It leaves out the foods Health Canada asks you to avoid in pregnancy, keeps caffeine under 300 mg a day and uses only low-mercury fish. It isn't a plan for gestational diabetes or another condition: follow your care provider.",
  },
  postpartum: {
    label: 'Postpartum and nursing',
    blurb: 'Graded on breastfeeding needs, with no alcohol and only low-mercury fish.',
    gates: { lifeStage: 'lactating', bans: ['alcohol', 'mercury'], minKcal: 1800, caffeineMaxMg: 300, ironMaxMg: 29 },
    note: "Breastfeeding raises your need for several nutrients, so keep taking the vitamin your care provider recommends (and vitamin D drops for your baby). This week brings a good amount of iron from food and leaves room for the iron in a prenatal vitamin, so don't add a separate iron pill unless your care provider tells you to. No recipe uses alcohol, caffeine stays under 300 mg a day and the fish are low in mercury. Follow your care provider's advice.",
  },
  pcos: {
    label: 'PCOS-friendly',
    blurb: 'Lower-GI carbs, plenty of fibre and protein, regular meals.',
    gates: { femalePanelAge: 30, glPer2000Kcal: 70, fibreMinG: 30, rules: { proteinMinPctKcal: 25 } },
    note: 'No single diet is proven best for PCOS. This week follows what the international guideline supports: lower-GI carbs, plenty of fibre and protein and regular meals. Work with your care team, especially if you take metformin or are trying to conceive.',
  },
  menopause: {
    label: 'Menopause',
    blurb: 'Graded for women over 50: more calcium, and protein at every meal.',
    gates: { femalePanelAge: 55, proteinPerMainMealG: 25 },
    note: 'Built for women over 50: more calcium, protein at every meal and soy foods as food. Vitamin D is hard to get from food, and Health Canada advises adults over 50 to take 400 IU a day. If you take a calcium supplement, count the food first: food and pills together should stay under 2,000 mg a day, so ask your pharmacist how much you still need, and when to take thyroid or bone medicines apart from calcium-rich food. If you take warfarin, keep leafy greens and other vitamin K foods steady from week to week. It doesn\'t replace your care provider\'s advice on symptoms or bone health.',
  },
  'healthy-aging': {
    label: 'Healthy aging',
    blurb: 'At least 25 g of protein at every main meal to protect muscle.',
    gates: { proteinPerMainMealG: 25, panelAge: 65, ironMaxMg: 30 },
    note: "Health Canada advises everyone over 50 to take a daily vitamin D supplement of 400 IU, and B12 is absorbed less well with age, so fortified foods or a supplement help. If you have kidney disease, take a blood thinner such as warfarin (keep leafy greens steady from week to week), or take other medicines that interact with food, check this week with your care team.",
  },
  // lifestyle
  family: { label: 'Family friendly', blurb: 'Mild flavours the whole table will eat.', gates: { noTags: ['spicy'] } },
  quick: {
    label: 'Quick weeknights',
    blurb: 'Every weeknight recipe takes 20 minutes or less, start to finish.',
    gates: { quickMinutes: 20 },
  },
  batch: { label: 'Batch cooking', blurb: 'Cook once on the weekend, eat all week.', gates: {} },
  budget: {
    label: 'Budget',
    blurb: 'A short shopping list built on staples, with few premium ingredients.',
    gates: { maxGroceries: 35, premium: { re: PREMIUM_FOODS, label: 'premium food', maxDays: 2 } },
  },
  ramadan: {
    label: 'Ramadan',
    blurb: 'Suhoor before dawn and iftar at sunset, no lunch.',
    gates: { noSlots: ['lunch'], slotNames: { breakfast: 'Suhoor', dinner: 'Iftar' } },
    note: 'If you have diabetes, kidney disease or another long-term condition, are pregnant or breastfeeding, take medication, or have a history of an eating disorder, talk to your care team before fasting. Drink plenty of water between iftar and suhoor.',
  },
  'intermittent-fasting': { label: 'Intermittent fasting', blurb: 'Two meals and a snack, with no breakfast.', gates: { noSlots: ['breakfast'] } },
  'gluten-free': { label: 'Gluten free', blurb: 'No wheat, barley or rye, and no hidden gluten.', gates: { bans: ['gluten'] } },
  'dairy-free': { label: 'Dairy free', blurb: 'No milk, cheese, yogurt, butter or ghee.', gates: { bans: ['dairy'] } },
  'allergen-free': {
    label: 'Top-allergen free',
    blurb: 'No peanuts, tree nuts, eggs, dairy, shellfish or sesame.',
    gates: { bans: ['nuts', 'egg', 'dairy', 'shellfish', 'sesame'] },
    note: 'Recipes are made without these five allergens, but packaged foods can carry them or be made on shared lines. Read every label every time, and remember a missing "may contain" line is not a guarantee. This plan does not replace advice from your allergist, especially for a severe allergy.',
  },
  'iron-focus': {
    label: 'Iron focus',
    blurb: 'Iron at 100% of the adult woman target every day.',
    gates: { ironFemaleRda: 1 },
    note: "This week gets its iron from food, well over the daily target, so don't add an iron pill or a multivitamin with iron unless your care provider tells you to. If you've been told your iron is low, follow your care provider's advice on supplements and testing. Men and women past menopause need much less iron, so a regular plan suits them better, and if you have haemochromatosis (iron overload) this plan isn't for you. If you're pregnant or breastfeeding and taking a prenatal vitamin, choose a Pregnancy or Postpartum plan instead: they leave room for its iron.",
  },
  paleo: { label: 'Paleo', blurb: 'No grains, legumes, dairy or added sugar.', gates: { bans: ['paleo'] } },
};

export const isPlanStyle = (s: unknown): s is PlanStyle => typeof s === 'string' && Object.prototype.hasOwnProperty.call(PLAN_STYLES, s);

// ── Grading options ────────────────────────────────────────────────────────

/** Who a plan at `kcal` is graded against, and the RULES it overrides. Female only below 1600 kcal; life-stage styles grade the female reference only. */
export function gradeOptionsFor(style: PlanStyle, kcal: number): { panel: ReferencePerson[]; rules: Partial<Rules> } {
  const g = PLAN_STYLES[style].gates;
  const rules: Partial<Rules> = { ...g.rules };
  if (g.glPer2000Kcal) rules.glycemicLoadMax = g.glPer2000Kcal; // per 2000 kcal, scaled per day by gradePlan
  const panel = g.lifeStage
    ? [{ ...FEMALE, lifeStage: g.lifeStage }]
    : g.femalePanelAge
      ? [{ ...FEMALE, age: g.femalePanelAge }]
      : kcal < 1600
        ? [{ ...FEMALE, age: g.panelAge ?? FEMALE.age }]
        : g.panelAge
          ? REFERENCE_PANEL.map((p) => ({ ...p, age: g.panelAge! }))
          : REFERENCE_PANEL;
  return { panel, rules };
}

// ── Gates ──────────────────────────────────────────────────────────────────

export interface GateFailure {
  code: string;
  message: string;
  fix?: string;
  day?: number;
  recipe?: string;
}

const MAIN_SLOTS: MealSlot[] = ['breakfast', 'lunch', 'dinner'];

const groceryKey = (f: Food) => f.head || f.id;

/** Distinct groceries in a plan: foods counted by what you would put in the basket (the food's head), not by cooked or raw form. */
/**
 * Spice-shelf items: dried spices, dried herbs, spice blends, salt and pepper. A jar lasts months, so they don't
 * count as weekly groceries (they have their own, roomier limit). Fresh herbs, pastes and sauces are groceries.
 */
export function isSpiceShelf(f: Food): boolean {
  if (f.category !== 'condiment' || /\b(?:coffee|tea|cocoa)\b/i.test(f.name)) return false;
  if (/^(?:paprika|cayenne|smoked paprika|chili flakes|red pepper flakes)\b/i.test(f.name)) return true;
  if (/\b(?:salt|pepper, (?:black|white)|black pepper|white pepper)\b/i.test(f.name) && !/\b(?:sauce|paste)\b/i.test(f.name)) return true;
  if (/\b(?:paste|sauce|molasses|vinegar|juice|fresh|raw|leaves, fresh|ketchup|mustard, prepared|mayonnaise|dressing|jam)\b/i.test(f.name)) return false;
  return f.form === 'dried' || /\b(?:ground|dried|seeds?|powder|masala|blend|spice|baharat|za'atar|sumac|berbere|ras el hanout|asafoetida|ajwain|amchur|methi|bay leaf|cinnamon|cloves?|cardamom|nutmeg|saffron|gochugaru|kala namak)\b/i.test(f.name);
}

export function distinctGroceries(plan: Pick<MealPlan, 'days'>, foods: FoodIndex, shelf = false): string[] {
  const seen = new Set<string>();
  for (const d of plan.days)
    for (const m of d.meals)
      for (const i of m.ingredients) {
        const f = getFood(foods, i.foodId);
        if (f && isSpiceShelf(f) === shelf) seen.add(groceryKey(f));
      }
  return [...seen];
}

const daysIn = (plan: MealPlan, test: (f: Food) => boolean, foods: FoodIndex) =>
  plan.days.filter((d) => d.meals.some((m) => m.ingredients.some((i) => { const f = getFood(foods, i.foodId); return !!f && test(f); }))).length;

/** Scale a per-7-days limit to a plan that has fewer days (the lab fixture has two). */
const perDays = (limit: number, plan: MealPlan) => Math.ceil((limit * Math.min(plan.days.length, 7)) / 7);

/** Checks on what the week is made of. They do not change with portion size, so the lab runs them once per size. */
/** Bans every plan carries whatever its style (Firas): no pork in any form, no alcohol in any recipe. */
export const HOUSE_BANS: BanId[] = ['pork', 'alcohol'];

// the same, in the words of a recipe: a step that deglazes with wine, a dish named for ham. Vinegars and the beef or turkey
// versions of cured meats are fine.
const HOUSE_WORDS =
  /\b(pork|bacon|ham|hams|lard|prosciutto|pancetta|guanciale|chorizo|salami|pepperoni|mortadella|wine|mirin|sake|beer|shaoxing|rum|brandy|cognac|sherry|vodka|bourbon|whiske?y|liqueur|marsala|vermouth)\b/;
const HOUSE_WORDS_OK =
  /\b(?:rice|red|white|sherry|wine|cider|malt)?\s*wine vinegar\b|\bsherry vinegar\b|\b(?:beef|turkey|chicken|plant-based|soy)\s+(?:bacon|ham|chorizo|salami|pepperoni|sausage)\b|\bpork-free\b|\bno pork\b|\bnon-?alcoholic\b|\balcohol-free\b|\bginger beer\b|\broot beer\b/g;

// eggs served with a soft yolk; "no runny egg left" and a jammy tomato sauce are fine
const SOFT_EGG = /soft[- ]boiled egg|soft[- ]cooked egg|jammy (?:egg|yolk)|yolks? (?:is |are )?(?:still |stays? |left )?(?:soft|runny)|runny yolk|sunny[- ]side|over[- ]easy|soft egg\b/;

/** Every style: no pork or alcohol among the foods (HOUSE_BANS) or in the words of the recipe. */
export function houseGates(plan: MealPlan, foods: FoodIndex): GateFailure[] {
  const out: GateFailure[] = [];
  const seen = new Set<string>();
  for (const d of plan.days)
    for (const m of d.meals) {
      for (const i of m.ingredients) {
        const f = getFood(foods, i.foodId);
        if (!f) continue;
        for (const ban of HOUSE_BANS) {
          const why = FOOD_BANS[ban](f);
          if (!why || seen.has(`${m.recipeId}:${f.id}`)) continue;
          seen.add(`${m.recipeId}:${f.id}`);
          out.push({
            code: 'house_food',
            day: d.day,
            recipe: m.recipeId ?? m.name,
            message: `Day ${d.day}, ${m.name}: ${f.name} is not allowed in any plan (${why}).`,
            fix: why === 'pork' ? 'Use the protein that fits the dish: chicken or turkey, beef, lamb or goat, fish or beans.' : 'Leave the alcohol out: stock with a little rice vinegar, or a little sugar or honey with vinegar.',
          });
        }
      }
      const key = `text:${m.recipeId ?? m.name}`;
      if (seen.has(key)) continue;
      const text = [m.name, m.about, m.tip, m.inspiredBy, ...(m.steps ?? []), ...m.ingredients.map((i) => i.note ?? '')]
        .filter(Boolean)
        .join(' ')
        .toLowerCase()
        .replace(HOUSE_WORDS_OK, ' ');
      const egg = text.match(SOFT_EGG);
      if (egg) {
        seen.add(key);
        out.push({
          code: 'house_egg',
          day: d.day,
          recipe: m.recipeId ?? m.name,
          message: `Day ${d.day}, ${m.name}: "${egg[0]}". Every plan cooks eggs until the yolk is firm (Health Canada's advice).`,
          fix: 'Cook the egg until the white and the yolk are firm: boil 10 minutes, fry or poach until set, and say so in the step.',
        });
      }
      const hit = text.match(HOUSE_WORDS);
      if (hit) {
        seen.add(key);
        out.push({
          code: 'house_words',
          day: d.day,
          recipe: m.recipeId ?? m.name,
          message: `Day ${d.day}, ${m.name}: the recipe text mentions "${hit[1]}". No plan has pork or alcohol, so the words can't either.`,
          fix: 'Reword the name, steps, about, tip or note to match the ingredients.',
        });
      }
    }
  return out;
}

export function styleStructureGates(style: PlanStyle, plan: MealPlan, foods: FoodIndex): GateFailure[] {
  const g = PLAN_STYLES[style].gates;
  const out: GateFailure[] = houseGates(plan, foods);
  const label = PLAN_STYLES[style].label;

  for (const ban of g.bans ?? []) {
    const seen = new Set<string>();
    for (const d of plan.days)
      for (const m of d.meals) {
        for (const i of m.ingredients) {
          const f = getFood(foods, i.foodId);
          const why = f && FOOD_BANS[ban](f);
          if (!f || !why || seen.has(`${m.recipeId}:${f.id}`)) continue;
          seen.add(`${m.recipeId}:${f.id}`);
          out.push({
            code: `${style}_food`,
            day: d.day,
            recipe: m.recipeId ?? m.name,
            message: `Day ${d.day}, ${m.name}: ${f.name} is not allowed in a ${label} plan (${why}).`,
            fix: `Replace ${f.id} with a food that fits (see the everyday list).`,
          });
        }
        // soft eggs and raw fish live in the method, not the food name
        if (ban === 'prenatal') {
          const text = [m.name, ...(m.steps ?? [])].join(' ').toLowerCase();
          const hit = text.match(/soft[- ]boiled|runny|raw egg|sunny[- ]side|over[- ]easy|sashimi|ceviche|tartare|carpaccio|undercooked|medium[- ]rare|\brare\b|pink in the (?:middle|centre|center)/);
          if (hit)
            out.push({
              code: 'prenatal_method',
              day: d.day,
              recipe: m.recipeId ?? m.name,
              message: `Day ${d.day}, ${m.name}: "${hit[0]}" is not safe in pregnancy.`,
              fix: 'Cook eggs until the yolk is set and cook fish through.',
            });
        }
      }
  }

  if (g.albacoreMaxGWeek != null) {
    const g_ = plan.days.reduce((n, d) => n + d.meals.reduce((s, m) => s + m.ingredients.reduce((x, i) => { const f = getFood(foods, i.foodId); return x + (f && /albacore|white tuna|tuna, white/i.test(f.name) ? i.grams : 0); }, 0), 0), 0);
    if (g_ > g.albacoreMaxGWeek)
      out.push({ code: 'albacore', message: `${Math.round(g_)} g of canned white (albacore) tuna this week (Health Canada advises at most ${g.albacoreMaxGWeek} g a week in pregnancy).`, fix: 'Use canned light tuna, salmon, sardines or trout instead on some days.' });
  }

  for (const slot of g.noSlots ?? []) {
    for (const d of plan.days)
      if (d.meals.some((m) => m.slot === slot))
        out.push({ code: 'slot', day: d.day, message: `Day ${d.day}: a ${label} plan has no ${slot}.`, fix: `Remove the ${slot} from the week.` });
  }

  if (g.noTags?.length)
    for (const d of plan.days)
      for (const m of d.meals) {
        const tag = m.tags?.find((t) => g.noTags!.includes(t));
        if (tag)
          out.push({
            code: 'tag',
            day: d.day,
            recipe: m.recipeId ?? m.name,
            message: `Day ${d.day}, ${m.name}: tagged "${tag}", which a ${label} plan does not allow.`,
            fix: 'Make it mild and drop the tag, or choose another recipe.',
          });
      }

  if (g.quickMinutes)
    for (const d of plan.days.filter((x) => x.day <= 5))
      for (const m of d.meals) {
        const minutes = m.leftover ? 0 : (m.prepMinutes ?? 0) + (m.cookMinutes ?? 0);
        if (minutes > g.quickMinutes)
          out.push({
            code: 'quick_time',
            day: d.day,
            recipe: m.recipeId ?? m.name,
            message: `Day ${d.day}, ${m.name}: ${minutes} minutes of prep and cooking (a Quick plan allows ${g.quickMinutes} on days 1 to 5).`,
            fix: 'Shorten the recipe, cook it once on the weekend and mark it as a leftover, or move it to day 6 or 7.',
          });
      }

  if (g.maxRedMeatDays != null) {
    const n = daysIn(plan, (f) => f.category === 'meat', foods);
    if (n > perDays(g.maxRedMeatDays, plan))
      out.push({ code: 'red_meat', message: `Red meat on ${n} days (a ${label} plan allows ${g.maxRedMeatDays} a week).`, fix: 'Swap some red meat days for poultry, fish or legumes.' });
  }
  if (g.maxPoultryFishDays != null) {
    const n = daysIn(plan, (f) => f.category === 'poultry' || f.category === 'fish', foods);
    if (n > perDays(g.maxPoultryFishDays, plan))
      out.push({ code: 'poultry_fish', message: `Poultry or fish on ${n} days (a ${label} plan allows ${g.maxPoultryFishDays} a week).`, fix: 'Make more dinners vegetarian.' });
  }

  if (g.plantFoodsPerWeek != null) {
    const plants = new Set<string>();
    for (const d of plan.days)
      for (const m of d.meals)
        for (const i of m.ingredients) {
          const f = getFood(foods, i.foodId);
          if (!f) continue;
          const plant = ['fruit', 'vegetable', 'legume', 'nut_seed'].includes(f.category) || (f.category === 'grain' && carbStyleOfFood(f) !== 'any');
          if (plant) plants.add(groceryKey(f));
        }
    const need = perDays(g.plantFoodsPerWeek, plan);
    if (plants.size < need)
      out.push({ code: 'plant_variety', message: `${plants.size} distinct plant foods in the week (a ${label} plan needs ${need}).`, fix: 'Add different vegetables, fruit, legumes, nuts, seeds or whole grains.' });
  }
  if (g.fermentedDaysPerWeek != null) {
    const n = daysIn(plan, isFermented, foods);
    const need = perDays(g.fermentedDaysPerWeek, plan);
    if (n < need)
      out.push({ code: 'fermented', message: `A fermented food on ${n} days (a ${label} plan needs ${need}).`, fix: 'Add yogurt, kefir, kimchi, sauerkraut, miso or tempeh to more days.' });
  }

  if (g.premium) {
    const n = daysIn(plan, (f) => g.premium!.re.test(f.name), foods);
    if (n > g.premium.maxDays)
      out.push({
        code: 'premium',
        message: `Premium foods (${g.premium.label}) on ${n} days (a ${label} plan allows ${g.premium.maxDays}).`,
        fix: 'Swap salmon fillet, beef tenderloin, scallops, lamb rack, pine nuts or macadamias for budget staples on some days.',
      });
  }
  return out;
}

/** Checks on what a sized day delivers. `kcal` is the calorie level the plan was sized to. */
export function styleNutrientGates(style: PlanStyle, plan: MealPlan, foods: FoodIndex, kcal: number): GateFailure[] {
  const g = PLAN_STYLES[style].gates;
  const out: GateFailure[] = [];
  const label = PLAN_STYLES[style].label;
  const fibreMin = kcal < 1800 && g.fibreMinGBelow1800 != null ? g.fibreMinGBelow1800 : g.fibreMinG;
  const ironRda = g.ironFemaleRda != null ? (requirement('iron', FEMALE)?.rda ?? 18) : 0;
  for (const d of plan.days) {
    const t = dayPlanTotal(d, foods);
    const fail = (code: string, message: string, fix?: string) => out.push({ code, day: d.day, message: `Day ${d.day}: ${message}`, fix });
    const fibre = t.fiber ?? 0;
    const carbs = t.carbs ?? 0;
    if (fibreMin != null && fibre < fibreMin)
      fail('fibre', `fibre is ${Math.round(fibre)} g (a ${label} plan needs at least ${fibreMin} g).`, 'Add legumes, vegetables, berries, seeds or intact grains.');
    if (g.carbsMinPct != null && t.kcal && (carbs * 4 * 100) / t.kcal < g.carbsMinPct)
      fail('carbs_low', `carbs are ${Math.round((carbs * 400) / t.kcal)}% of calories (a ${label} plan needs at least ${g.carbsMinPct}%).`, 'Add rice, oats, potatoes, fruit or other carbs around training.');
    if (g.carbsMaxG != null && carbs > g.carbsMaxG)
      fail('carbs_high', `carbs are ${Math.round(carbs)} g (a ${label} plan allows ${g.carbsMaxG} g).`, 'Trim grains, fruit and starchy vegetables; keep the leafy greens.');
    if (g.netCarbsMaxG != null && carbs - fibre > g.netCarbsMaxG)
      fail('net_carbs', `net carbs are ${Math.round(carbs - fibre)} g (a ${label} plan allows ${g.netCarbsMaxG} g).`, 'Replace grains, fruit and starch with non-starchy vegetables, eggs, fish, nuts and olive oil.');
    if (g.sodiumMaxMg != null && (t.sodium ?? 0) > g.sodiumMaxMg)
      fail('sodium', `sodium is ${Math.round(t.sodium ?? 0)} mg (a ${label} plan allows ${g.sodiumMaxMg} mg).`, 'Cut salt, soy sauce, cured meat, cheese and canned foods; use herbs, citrus and spices.');
    if (g.caffeineMaxMg != null) {
      const caffeine = d.meals.reduce((n, m) => n + m.ingredients.reduce((s, i) => { const f = getFood(foods, i.foodId); return s + (f ? (caffeineMgPer100g(f) * i.grams) / 100 : 0); }, 0), 0);
      if (caffeine > g.caffeineMaxMg)
        fail('caffeine', `caffeine is about ${Math.round(caffeine)} mg (a ${label} plan allows ${g.caffeineMaxMg} mg).`, 'Use one cup of coffee at most, or decaf, half-caf or herbal tea from the safe list.');
    }
    if (g.ironMaxMg != null && (t.iron ?? 0) > g.ironMaxMg)
      fail('iron_high', `iron from food is ${(t.iron ?? 0).toFixed(1)} mg (a ${label} plan keeps it at or under ${g.ironMaxMg} mg${g.lifeStage ? ', so food plus a prenatal vitamin with 16 mg of iron stays under the 45 mg upper limit' : ''}).`, 'Spread the iron-rich foods (red meat, lentils, tofu, fortified cereal, seeds) across the week, or swap one for a lower-iron protein that day.');
    if (g.ironFemaleRda != null && (t.iron ?? 0) < ironRda * g.ironFemaleRda)
      fail('iron', `iron is ${(t.iron ?? 0).toFixed(1)} mg (a ${label} plan needs ${(ironRda * g.ironFemaleRda).toFixed(0)} mg).`, 'Add lentils, beans, tofu, pumpkin seeds, spinach or lean red meat, with a vitamin C food.');
    if (g.proteinPerMainMealG != null)
      for (const slot of MAIN_SLOTS) {
        const meals = d.meals.filter((m) => m.slot === slot);
        if (!meals.length) continue;
        const protein = meals.reduce((n, m) => n + m.ingredients.reduce((s, i) => s + ((getFood(foods, i.foodId)?.n.protein ?? 0) * i.grams) / 100, 0), 0);
        if (protein < g.proteinPerMainMealG)
          fail('meal_protein', `${slot} has ${Math.round(protein)} g of protein (a ${label} plan needs ${g.proteinPerMainMealG} g).`, 'Add eggs, Greek yogurt, fish, poultry, tofu or legumes to that meal.');
      }
  }
  return out;
}

/** Every style check at once (structure, then nutrients at `kcal`). */
export const runStyleGates = (style: PlanStyle, plan: MealPlan, foods: FoodIndex, kcal: number): GateFailure[] => [
  ...styleStructureGates(style, plan, foods),
  ...styleNutrientGates(style, plan, foods, kcal),
];
