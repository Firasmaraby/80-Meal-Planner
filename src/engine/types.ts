/**
 * Core data model shared by the app, the Excel importer and the data pipeline.
 * All nutrient amounts on a Food are per 100 g edible portion.
 * A missing value is `undefined` / `null` ("no data"), never 0.
 */

export type NutrientKey =
  // energy & macros
  | 'kcal'
  | 'protein'
  | 'carbs'
  | 'fiber'
  | 'sugar'
  | 'fat'
  | 'satFat'
  | 'mufa'
  | 'pufa'
  // fatty acids (g)
  | 'ala'
  | 'epa'
  | 'dha'
  | 'la'
  // vitamins
  | 'vitA' // µg RAE
  | 'vitC' // mg
  | 'vitD' // µg
  | 'vitE' // mg alpha-tocopherol
  | 'vitK' // µg
  | 'b1' // mg thiamin
  | 'b2' // mg riboflavin
  | 'b3' // mg niacin
  | 'b5' // mg pantothenic acid
  | 'b6' // mg
  | 'b7' // µg biotin
  | 'folate' // µg DFE
  | 'b12' // µg
  | 'choline' // mg
  // minerals
  | 'calcium' // mg
  | 'iron' // mg
  | 'magnesium' // mg
  | 'phosphorus' // mg
  | 'potassium' // mg
  | 'zinc' // mg
  | 'copper' // mg
  | 'manganese' // mg
  | 'selenium' // µg
  | 'iodine' // µg
  | 'sodium'; // mg

export type NutrientVector = Partial<Record<NutrientKey, number | null>>;

export interface Serving {
  label: string; // "1 medium", "1 cup, cooked"
  g: number;
}

export interface FoodSource {
  db: string; // e.g. "USDA FDC SR Legacy"
  ref: string; // id inside that database, e.g. "09148"
}

export interface Food {
  id: string;
  name: string; // clean display name: "Kiwifruit, green, raw"
  category: FoodCategory;
  aliases?: string[];
  tags?: FoodTag[];
  gi?: number | null; // glycemic index (glucose = 100)
  servings?: Serving[];
  n: NutrientVector; // per 100 g
  src: FoodSource[];
  rare?: boolean; // hidden from search unless "include rare items"
  rank?: number; // commonness 0–100, higher = shown first
  /** the base food a person types ("chicken breast"); search groups results by it */
  head?: string;
  /** how it is prepared/sold: raw | cooked | dried | canned | frozen | juice | product | dish */
  form?: string;
  /** everyday = shown first (and all the plan-writing AI sees); extended = searchable, ranked lower */
  tier?: FoodTier;
  /** nutrients whose value is estimated or borrowed from another record (e.g. 'la' is always estimated) */
  estimated?: NutrientKey[];
  /** ids this food answered to before the food library was rebuilt (see src/data/legacyIdMap.json) */
  legacyIds?: string[];
}

export type FoodTier = 'everyday' | 'extended';

export type FoodCategory =
  | 'fruit'
  | 'vegetable'
  | 'legume'
  | 'grain'
  | 'nut_seed'
  | 'dairy'
  | 'egg'
  | 'meat'
  | 'poultry'
  | 'fish'
  | 'oil_fat'
  | 'beverage'
  | 'condiment'
  | 'sweet'
  | 'prepared'
  | 'other';

export type FoodTag = 'fatty_fish' | 'leafy_green' | 'whole_grain' | 'plant_iron' | 'fermented' | 'processed';

// ── Meal plans ─────────────────────────────────────────────────────────────

export type MealSlot = 'breakfast' | 'lunch' | 'dinner' | 'snack';

export interface Ingredient {
  foodId: string;
  grams: number;
  /** swap group key, e.g. "leafy_greens" → user may swap within the group */
  swapGroup?: string;
  note?: string; // "chopped", "drained"
}

export interface Meal {
  id: string;
  slot: MealSlot;
  name: string;
  prepMinutes?: number;
  instructions?: string;
  photoUrl?: string;
  ingredients: Ingredient[];
  // Library recipes (see content/GUIDE.md); the Excel and AI importers leave these empty.
  /** the recipe this meal is cooked from; one recipe can appear in many plans */
  recipeId?: string;
  /** two or three sentences for someone browsing the meal library */
  about?: string;
  steps?: string[];
  cookMinutes?: number;
  /** spice level, audience, keeping and weekday shape: "mild", "freezer-friendly", "15-minute"... */
  tags?: string[];
  /** one "make it your own" line */
  tip?: string;
  inspiredBy?: string;
  /** portions the steps make; 2 = the second becomes tomorrow's lunch */
  servings?: number;
  /** this slot eats the previous night's second portion */
  leftover?: boolean;
}

export interface PlanDay {
  day: number; // 1-based
  meals: Meal[];
}

export interface MealPlan {
  id: string;
  version: number;
  name: string;
  band: CalorieBand;
  cuisine: string;
  tags: string[]; // "vegetarian", "pescatarian", "dairy-free", "high-protein"...
  description?: string;
  author?: string;
  days: PlanDay[];
  // Library plans: one size of a plan family (see content/GUIDE.md).
  /** the family this plan is a size of */
  familyId?: string;
  size?: PlanSize;
  /** the calorie bands the family's gate verified for this size */
  covers?: CalorieBand[];
  style?: PlanStyle;
  /** the lowest carb setting this plan fits */
  carbStyle?: CarbStyle;
  summary?: string;
  howItWorks?: string;
  /** recipe ids of the dishes that define the family */
  signature?: string[];
  regions?: string[];
  lifeStage?: LifeStage;
  /** display names for slots that are not breakfast, lunch, dinner or snack (Ramadan: Suhoor, Iftar) */
  slotNames?: Partial<Record<MealSlot, string>>;
}

export type PlanSize = 'light' | 'standard' | 'big' | 'xl';

/** Whole-food carbs (intact grains, legumes, potatoes), whole grains too, or everything in moderation. Ordered strictest first. */
export type CarbStyle = 'whole' | 'wholegrain' | 'any';

export type PlanStyle =
  // eating patterns
  | 'balanced'
  | 'vegan'
  | 'vegetarian'
  | 'pescatarian'
  | 'flexitarian'
  // goals
  | 'muscle'
  | 'fat-loss'
  | 'endurance'
  | 'low-gi'
  | 'keto'
  | 'low-carb'
  | 'heart'
  | 'gut'
  | 'anti-inflammatory'
  // life stage
  | 'prenatal'
  | 'postpartum'
  | 'healthy-aging'
  // lifestyle
  | 'family'
  | 'quick'
  | 'batch'
  | 'budget'
  | 'ramadan'
  | 'intermittent-fasting'
  | 'gluten-free'
  | 'dairy-free'
  | 'iron-focus'
  | 'paleo';

export interface CalorieBand {
  min: number;
  max: number;
}

export interface SwapGroup {
  key: string;
  label: string; // "Leafy greens"
  foodIds: string[];
}

// ── People & logs ──────────────────────────────────────────────────────────

export type Sex = 'male' | 'female';
export type LifeStage = 'none' | 'pregnant' | 'lactating';
export type Goal = 'lose' | 'maintain' | 'gain';
export type Activity = 'sedentary' | 'light' | 'moderate' | 'very' | 'athlete';

export interface Profile {
  name?: string;
  sex: Sex;
  age: number;
  heightCm: number;
  weightKg: number;
  activity: Activity;
  goal: Goal;
  lifeStage: LifeStage;
  /** protein target in g per kg bodyweight; framework default is high-protein */
  proteinPerKg: number;
  /** saturated-fat ceiling as % of calories */
  satFatPct: number;
  /** scale plan portions to this person's calorie target (micros-first) */
  sizeToMe: boolean;
  /** foods (ids) or whole categories ("cat:fish") the person won't eat; auto-swapped */
  dislikes: string[];
  diet: string[]; // filters: vegetarian, pescatarian, dairy-free, gluten-free...
  /** the strictest carb sources this person wants in their plans; library plans above it are hidden */
  carbStyle?: CarbStyle;
}

export interface LogItem {
  id: string;
  date: string; // YYYY-MM-DD local
  at: string; // ISO timestamp
  foodId: string;
  grams: number;
  /** set when the item came from a plan meal */
  planId?: string;
  mealId?: string;
  slot?: MealSlot;
}
