/**
 * Plan styles: the identity of a plan family and the extra checks it has to pass on top of the framework defaults
 * (planReport RULES: protein >= 20% of kcal, sat fat < 10%, omega 6:3 <= 4:1, GL <= 100 a day, fatty fish twice a week).
 *
 * `PLAN_STYLES[style].gates` is plain config. scripts/plan-lab.mjs reads it through:
 *   gradeOptionsFor     who to grade against and which RULES change (protein floor, sat fat, GL, fish...)
 *   styleStructureGates what the week is made of (banned foods, slots, spicy recipes, grocery count...), once per size
 *   styleNutrientGates  what a sized day delivers (fibre, carbs, sodium, iron, protein per meal...), at each band edge
 */
import { dayPlanTotal, getFood, type FoodIndex } from './calc';
import { carbStyleOfFood } from './carbStyle';
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
  if (/\bwheat\b/.test(t) && !/gluten[- ]free|wheat[- ]free/.test(t)) return 'wheat';
  if (GLUTEN_GRAINS.test(t) && !GLUTEN_SAFE.test(t)) return t.match(GLUTEN_GRAINS)![1];
  if (['grain', 'prepared', 'sweet', 'other'].includes(f.category) && GLUTEN_PRODUCTS.test(t) && !GLUTEN_SAFE.test(t) && !/^(\w+ ){0,2}sauce/.test(t))
    return t.match(GLUTEN_PRODUCTS)![1];
  return undefined;
}

const MERCURY_FISH = /\b(shark|swordfish|king mackerel|tilefish|marlin|bigeye tuna|orange roughy)\b/;
const RAW_OR_SMOKED_FISH = /\b(smoked|lox|gravlax|sashimi|ceviche|tartare|carpaccio|sushi|kippered|nigiri)\b/;
const SOFT_CHEESE = /\b(brie|camembert|blue cheese|gorgonzola|roquefort|stilton|danish blue)\b|unpasteuri[sz]ed|raw milk/;

function prenatalReason(f: Food): string | undefined {
  const t = lower(f);
  if (MERCURY_FISH.test(t)) return 'high-mercury fish';
  if (RAW_OR_SMOKED_FISH.test(t)) return 'raw or smoked fish';
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

export type BanId = 'animal' | 'flesh' | 'meat-poultry' | 'dairy' | 'gluten' | 'nuts' | 'prenatal' | 'paleo';

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
  gluten: glutenReason,
  nuts: (f) => (NUT_WORDS.test(lower(f).replace(/without nuts?|water chestnuts?/g, ' ')) ? 'nuts' : undefined),
  prenatal: prenatalReason,
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
}

export interface PlanStyleInfo {
  label: string;
  blurb: string;
  gates: StyleGates;
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
  'fat-loss': {
    label: 'Fat loss',
    blurb: 'High protein and high fibre to stay full on fewer calories.',
    gates: { rules: { proteinMinPctKcal: 30 }, fibreMinG: 30 },
  },
  endurance: {
    label: 'Endurance',
    blurb: 'Carbs first to fuel long training days, with enough protein to recover.',
    gates: { carbsMinPct: 50, rules: { proteinMinPctKcal: 18, glycemicLoadMax: Infinity } },
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
  },
  gut: {
    label: 'Gut health',
    blurb: 'Fibre, plant variety and fermented foods for the microbiome.',
    gates: { fibreMinG: 35, fibreMinGBelow1800: 30, plantFoodsPerWeek: 30, fermentedDaysPerWeek: 5 },
  },
  'anti-inflammatory': {
    label: 'Anti-inflammatory',
    blurb: 'Oily fish, olive oil, colour and spices, with a tight omega balance.',
    gates: { rules: { omegaMaxRatio: 3, fattyFishPerWeek: 3 } },
  },
  // life stage
  prenatal: {
    label: 'Pregnancy',
    blurb: 'Graded on pregnancy needs, with the foods to avoid left out.',
    gates: { lifeStage: 'pregnant', bans: ['prenatal'] },
  },
  postpartum: { label: 'Postpartum and nursing', blurb: 'Graded on breastfeeding needs.', gates: { lifeStage: 'lactating' } },
  'healthy-aging': {
    label: 'Healthy aging',
    blurb: 'At least 25 g of protein at every main meal to protect muscle.',
    gates: { proteinPerMainMealG: 25 },
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
  },
  'intermittent-fasting': { label: 'Intermittent fasting', blurb: 'Two meals and a snack, with no breakfast.', gates: { noSlots: ['breakfast'] } },
  'gluten-free': { label: 'Gluten free', blurb: 'No wheat, barley or rye, and no hidden gluten.', gates: { bans: ['gluten'] } },
  'dairy-free': { label: 'Dairy free', blurb: 'No milk, cheese, yogurt, butter or ghee.', gates: { bans: ['dairy'] } },
  'iron-focus': {
    label: 'Iron focus',
    blurb: 'Iron at 100% of the adult woman target every day.',
    gates: { ironFemaleRda: 1 },
  },
  paleo: { label: 'Paleo', blurb: 'No grains, legumes, dairy or added sugar.', gates: { bans: ['paleo'] } },
};

export const isPlanStyle = (s: unknown): s is PlanStyle => typeof s === 'string' && Object.prototype.hasOwnProperty.call(PLAN_STYLES, s);

// ── Grading options ────────────────────────────────────────────────────────

/** Who a plan at `kcal` is graded against, and the RULES it overrides. Female only below 1600 kcal; life-stage styles grade the female reference only. */
export function gradeOptionsFor(style: PlanStyle, kcal: number): { panel: ReferencePerson[]; rules: Partial<Rules> } {
  const g = PLAN_STYLES[style].gates;
  const rules: Partial<Rules> = { ...g.rules };
  if (g.glPer2000Kcal) rules.glycemicLoadMax = (g.glPer2000Kcal * kcal) / 2000;
  const panel = g.lifeStage ? [{ ...FEMALE, lifeStage: g.lifeStage }] : kcal < 1600 ? [FEMALE] : REFERENCE_PANEL;
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
export function distinctGroceries(plan: Pick<MealPlan, 'days'>, foods: FoodIndex): string[] {
  const seen = new Set<string>();
  for (const d of plan.days)
    for (const m of d.meals)
      for (const i of m.ingredients) {
        const f = getFood(foods, i.foodId);
        if (f) seen.add(groceryKey(f));
      }
  return [...seen];
}

const daysIn = (plan: MealPlan, test: (f: Food) => boolean, foods: FoodIndex) =>
  plan.days.filter((d) => d.meals.some((m) => m.ingredients.some((i) => { const f = getFood(foods, i.foodId); return !!f && test(f); }))).length;

/** Scale a per-7-days limit to a plan that has fewer days (the lab fixture has two). */
const perDays = (limit: number, plan: MealPlan) => Math.ceil((limit * Math.min(plan.days.length, 7)) / 7);

/** Checks on what the week is made of. They do not change with portion size, so the lab runs them once per size. */
export function styleStructureGates(style: PlanStyle, plan: MealPlan, foods: FoodIndex): GateFailure[] {
  const g = PLAN_STYLES[style].gates;
  const out: GateFailure[] = [];
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
          const hit = text.match(/soft[- ]boiled|runny|raw egg|sunny[- ]side|over[- ]easy|sashimi|ceviche|tartare|carpaccio|undercooked/);
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
