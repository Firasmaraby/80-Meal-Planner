"""Display names, head, form, category, tags and aliases for the consumer layer.

Rules first, no model. Input is a foodpipe `name_en` (USDA / CNF comma-inverted English, CoFID, CIQUAL and friends already
translated) plus its food_group / state; output is a natural display name ("Chicken breast, roasted"), the `head`
(what a person types: "chicken breast"), a `form` (raw | cooked | dried | canned | frozen | juice | product | dish),
a FoodCategory, FoodTags and a few aliases.

Everything language-specific lives in the tables at the top of this file; `Lexicon` carries the curated everyday heads
(config/everyday_heads.txt) that the head resolver uses to prefer "brown rice" / "romaine lettuce" / "kidney beans".
"""
from __future__ import annotations

import json
import re
import sys
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any

_HERE = Path(__file__).resolve().parent
_PIPE = _HERE.parent
if str(_PIPE) not in sys.path:
    sys.path.insert(0, str(_PIPE))

from stages.textutil import clean_ws, fold, singular as _base_singular  # noqa: E402

CONFIG = _PIPE / "config"

# --------------------------------------------------------------------------------------------- lexicon (everyday heads)


@dataclass
class HeadEntry:
    head: str
    form: str = ""               # preferred form ('' = any)
    servings: list[dict[str, Any]] = field(default_factory=list)
    prefer: list[str] = field(default_factory=list)     # words that make a record the preferred variant ("whole", "2%")


FORMS = ["raw", "cooked", "dried", "canned", "frozen", "juice", "product", "dish"]
_FORM_ALIAS = {"dry": "dried", "boiled": "cooked", "baked": "cooked", "roasted": "cooked", "fresh": "raw", "": ""}


def parse_servings(s: str) -> list[dict[str, Any]]:
    out = []
    for piece in s.split(";"):
        piece = piece.strip()
        if "=" in piece:
            label, g = piece.rsplit("=", 1)
            try:
                out.append({"label": label.strip(), "g": float(g)})
            except ValueError:
                pass
    return out


def load_heads(path: str | Path | None = None) -> list[HeadEntry]:
    """everyday_heads.txt: `head|form|label=grams;label=grams`, `#` comments. Order = importance (earlier = more common)."""
    p = Path(path) if path else CONFIG / "everyday_heads.txt"
    out: list[HeadEntry] = []
    if not p.exists():
        return out
    for line in p.read_text(encoding="utf-8").splitlines():
        line = line.split("#", 1)[0].strip() if not line.strip().startswith("#") else ""
        if not line:
            continue
        bits = [b.strip() for b in line.split("|")]
        head = singular_phrase(bits[0].lower())
        form = _FORM_ALIAS.get(bits[1].lower(), bits[1].lower()) if len(bits) > 1 else ""
        if form and form not in FORMS:
            raise ValueError(f"everyday_heads.txt: bad form {form!r} in {line!r}")
        prefer = [p.strip().lower() for p in bits[3].split("/") if p.strip()] if len(bits) > 3 else []
        out.append(HeadEntry(head, form, parse_servings(bits[2]) if len(bits) > 2 else [], prefer))
    return out


class Lexicon:
    def __init__(self, heads: list[HeadEntry] | None = None):
        self.entries = heads if heads is not None else load_heads()
        self.known = {e.head for e in self.entries}
        syn = json.loads((CONFIG / "name_rules.json").read_text(encoding="utf-8")).get("synonyms", [])
        self.syn_groups = [g for g in syn]
        self.term_groups: dict[str, list[dict]] = {}
        for g in syn:
            for t in g["terms"]:
                self.term_groups.setdefault(t.lower(), []).append(g)


_LEX: Lexicon | None = None


def default_lexicon() -> Lexicon:
    global _LEX
    if _LEX is None:
        _LEX = Lexicon()
    return _LEX


# ------------------------------------------------------------------------------------------------- tables

# spelling / dialect folding, applied to whole words in display names (British/other -> North American)
SPELL = {
    "yoghurt": "yogurt", "yoghourt": "yogurt", "flavour": "flavor", "flavoured": "flavored", "flavours": "flavors",
    "colour": "color", "coloured": "colored", "fibre": "fiber", "pasteurised": "pasteurized", "homogenised": "homogenized",
    "iodised": "iodized", "caramelised": "caramelized", "grey": "gray", "mould": "mold", "tinned": "canned",
    "skimmed": "skim", "aubergine": "eggplant", "aubergines": "eggplant", "courgette": "zucchini", "courgettes": "zucchini",
    "prawn": "shrimp", "prawns": "shrimp", "beetroot": "beet", "capsicum": "bell pepper", "rocket": "arugula",
    "swede": "rutabaga", "cornflour": "cornstarch", "mangetout": "snow peas", "sweetcorn": "sweet corn",
    "wholemeal": "whole wheat", "mince": "ground", "minced": "ground", "semi-skimmed": "low-fat", "maize": "corn",
    "sultanas": "golden raisins", "lowfat": "low-fat", "nonfat": "nonfat", "non-fat": "nonfat", "fat-free": "nonfat",
    "whole-wheat": "whole wheat", "whole-grain": "whole grain", "jam": "jam", "colourless": "colorless", "savoury": "savory", "porridge": "porridge", "pulses": "legumes",
}

# whole boilerplate sub-strings removed from the raw name (before splitting)
BOILER_SUB: list[tuple[re.Pattern, str]] = [(re.compile(p, re.I), r) for p, r in [
    (r"\s*\((?:includes?|incl\.?)\b[^)]*\)", ""),
    (r"\s*\(?\s*includes? USDA commodity[^),]*\)?", ""),
    (r",?\s*UPC:\s*\w+", ""),
    (r"\bNFS\b", ""),
    (r",?\s*NS as to [^,()]*", ""),
    (r",?\s*year[- ]round average", ""),
    (r"\bUSDA commodity\b[^,]*", ""),
    (r"\b(?:broilers? or fryers?|broilers?[- ]fryers?|broilers?|fryers?)\b", ""),
    (r"\b(greek)[- ]style\b", r"\1"),
    (r"\s*\((?=[^()]*,)[^()]*\)", ""),
    (r"\bwhole ?meal wheat flour\b", "whole wheat"),
    (r"\bwhole ?meal wheat\b", "whole wheat"),
    (r"\bYogourt \(yogurt\)", "Yogurt"),
    (r"\bYogourt\b", "Yogurt"),
    (r"\bBiscuits? \(cookies?\)", "Cookie"),
    (r"\bIcing \(frosting\)", "Frosting"),
    (r"\bpotato crisps\b", "potato chips"),
    (r"\bcrisps\b", "chips"),
    (r"(\d+(?:\.\d+)?)\s*%\s*(?:milkfat|milk fat|M\.?\s?F\.?|M\.?\s?G\.?|fat)\b\.?", r"\1% fat"),
    (r"\bcooked,? (?:dry|moist) heat\b", "COOKEDHEAT"),     # fixed up in parts stage
    (r"\btrimmed to [\d/\.\s]*(?:\"|''|inch)?\s*fat\b", ""),
    (r"\b\d+\s*mm\s*\([^)]*\)\s*trim\b", ""),
    (r"\bUSDA (?:choice|select|prime)\b", ""),
    (r"(\d+)%\s*lean meat\s*/\s*\d+%\s*fat", r"\1% lean"),
    (r"\.\s*$", ""),
]]

# whole comma-parts that are boilerplate
NOISE_PARTS = {
    "meat only", "meat only with added solution", "nfs", "commercial", "commercially prepared", "commercial, regular",
    "all grades", "all types", "all varieties", "all commercial varieties", "all classes", "all areas", "all cuts",
    "choice", "select", "prime", "mature seeds", "regular", "enriched", "not fortified", "fresh", "fluid",
    "year round average", "usda commodity", "retail", "single brand", "generic", "salad or cooking", "all purpose",
    "composite of trimmed retail cuts", "separable lean and fat and bone", "without salt", "no salt added",
    "without added salt", "with added vitamin a and vitamin d", "with added vitamin d", "with added vitamin a",
    "without added vitamin a and vitamin d", "without added vitamin d", "without added vitamin a", "unprepared"
    if False else "", "raw or cooked", "mixed species", "as purchased", "composite", "no added fat", "unspecified",
    "includes foods for usda's food distribution program", "ready-to-serve" if False else "",
    "fresh or frozen", "fresh or frozen, unspecified", "reduced fat, not fortified", "roasting", "stewing",
    "without added vitamin a and d", "with added vitamin a and d", "dry heat", "moist heat", "market average",
    "meat", "flesh", "all commercial varieties", "domestic", "prepacked", "pre-packed", "packed", "natural", "averaged",
}
NOISE_PARTS.discard("")
NOISE_RX = re.compile(
    r"^(?:trimmed to .*|\d+ ?mm .*|separable (?:lean|fat)? ?(?:only)?$|with added (?:vitamin|ascorbic|calcium|iron).*|"
    r"without added (?:vitamin|ascorbic).*|average|averaged?.*|usda .*|all grades.*|grade [a-z].*|"
    r"(?:large|small|medium|jumbo|extra large) ?(?:end)?$|bone-?in.*|bone and skin removed|"
    r"yield from.*|weighed with.*|\d+% trim.*)$", re.I)

STATE_WORDS = {
    "raw", "cooked", "boiled", "roasted", "baked", "fried", "pan-fried", "deep-fried", "grilled", "broiled", "pan-broiled",
    "steamed", "braised", "stewed", "simmered", "sauteed", "microwaved", "poached", "smoked", "canned", "frozen", "dried",
    "dehydrated", "dry", "stir-fried", "toasted", "rotisserie", "scrambled", "hard-boiled", "soft-boiled", "heated",
    "pickled", "cured", "fermented", "freeze-dried", "boiled/steamed", "cooked with water",
}
COOK_METHODS = {
    "roasted", "broiled", "braised", "boiled", "grilled", "fried", "baked", "stewed", "simmered", "steamed", "microwaved",
    "pan-fried", "pan-broiled", "sauteed", "poached", "stir-fried", "deep-fried", "scrambled", "hard-boiled", "soft-boiled",
    "toasted", "rotisserie", "pressure-cooked", "boiled/steamed",
}
# parts that merely describe/prepare a food: never treated as a "type" when inverting
DESCRIPTORS_EXACT = STATE_WORDS | {
    "plain", "whole", "enriched", "unenriched", "fortified", "unfortified", "low-fat", "nonfat", "reduced fat", "reduced-fat",
    "low fat", "full fat", "fat free", "skim", "lean", "extra lean", "regular", "light", "lite", "instant", "quick",
    "prepared", "homemade", "home-made", "ready-to-eat", "ready-to-serve", "ready to eat", "condensed", "concentrate",
    "undiluted", "diluted", "unsweetened", "sweetened", "salted", "unsalted", "fresh", "mature", "immature", "sprouted",
    "unprepared", "dry mix", "dry", "powder", "liquid", "frozen concentrate", "from concentrate", "shelf-stable",
    "flavored", "drained", "drained solids", "solids and liquids", "with skin", "without skin", "peeled", "unpeeled",
    "sliced", "chopped", "diced", "whole grain", "refined", "commercial", "boneless", "bone-in", "lean only",
    "lean and fat", "with salt", "washed", "unwashed", "pasteurized", "organic", "imitation", "low sodium", "reduced sodium",
    "no sugar added", "sugar added", "salt added", "added salt", "sodium added", "low calorie", "reduced calorie",
    "dietetic", "fluid", "uncooked", "cooked or raw", "crumbled", "ground", "mashed", "creamed", "dehulled", "hulled",
    "shelled", "unshelled", "pitted", "seedless", "whole kernel", "cream style", "cut", "large", "small", "medium",
    "average", "mixed", "assorted", "all", "extra", "split", "halves", "pieces", "wedge", "shredded", "grated",
    "trimmed", "untrimmed", "separable lean", "separable lean only", "separable lean and fat", "with fat", "without fat",
    "with added fat", "no added fat", "fat added", "not specified", "low-sodium", "reduced-sodium", "sugar-free",
    "plain or flavored", "decaffeinated", "caffeinated", "brewed", "infusion", "heated", "made with water",
}
DESCRIPTOR_RX = re.compile(
    r"^(?:\d|with(?:out)? |made (?:with|from|without)|prepared|cooked|canned|dry |dried|frozen|raw|unprepared|ready|"
    r"low[- ]|reduced[- ]|no |not |added|enriched|unenriched|fortified|lean|fat|sodium|salt|sugar|calorie|"
    r"drained|all |extra|regular|packed|in |as |from |includes?|unsweetened|sweetened|undiluted|diluted|bottled|"
    r"homemade|home-made|commercial|plain|whole|instant|quick|fresh|imported|domestic|retail|choice|select|prime)", re.I)

# first words that are only a category label in USDA / CNF naming: dropped, the next part becomes the head
DROP_LEAD = {
    "fish", "beverages", "beverage", "spices", "mollusks", "crustaceans", "game meat", "nuts", "alcoholic beverage",
    "alcoholic beverages", "sweets", "snacks", "vegetables", "fruits", "fruit", "legumes", "spices and herbs", "seeds",
    "alcohol", "indian", "mexican", "italian", "latino", "grain", "grains", "baked products", "breakfast cereals", "frozen novelties", "dessert", "desserts", "dairy", "meat", "poultry",
    "lunchmeat", "frozen entree", "entree", "plant-based beverage", "plant based beverage", "restaurant food",
}
# lead words dropped, but only when something follows and the new head isn't empty; 'dessert'/'lunchmeat' etc stay
DROP_LEAD_KEEP = {"lunchmeat", "dairy", "meat", "poultry", "frozen entree", "entree", "plant-based beverage",
                  "plant based beverage", "vegetables", "fruits", "fruit", "legumes"}
DROP_LEAD -= DROP_LEAD_KEEP

# generic nouns that take their type in front: "Cheese, cheddar" -> "Cheddar cheese"
TYPE_NOUNS = {
    "cheese": "cheese", "soup": "soup", "sauce": "sauce", "candies": "candy", "candy": "candy", "cookies": "cookies",
    "cookie": "cookie", "crackers": "crackers", "cracker": "cracker", "beans": "beans", "flour": "flour", "vinegar": "vinegar",
    "oil": "oil", "juice": "juice", "bread": "bread", "pasta": "pasta", "noodles": "noodles", "cake": "cake", "cakes": "cake",
    "pie": "pie", "pies": "pie", "pudding": "pudding", "puddings": "pudding", "syrup": "syrup", "syrups": "syrup",
    "sugars": "sugar", "sugar": "sugar", "yogurt": "yogurt", "milk": "milk", "cream": "cream", "butter": "butter",
    "sausage": "sausage", "muffin": "muffin", "muffins": "muffins", "tea": "tea", "coffee": "coffee", "gravy": "gravy",
    "dressing": "dressing", "salad dressing": "salad dressing", "pizza": "pizza", "rolls": "rolls", "roll": "roll",
    "tortillas": "tortillas", "tortilla": "tortilla", "pancakes": "pancakes", "waffles": "waffles", "crepes": "crepes",
    "chips": "chips", "peas": "peas", "lentils": "lentils", "tofu": "tofu", "mustard": "mustard", "spread": "spread",
    "jams and preserves": "jam", "jelly": "jelly", "jellies": "jelly", "cereal": "cereal", "cereals": "cereal",
    "granola bar": "granola bar", "bars": "bar", "bar": "bar", "wine": "wine", "beer": "beer", "liqueur": "liqueur",
    "ice cream": "ice cream", "frosting": "frosting", "icing": "icing", "pastry": "pastry", "doughnut": "doughnut",
    "biscuit": "biscuit", "biscuits": "biscuits", "rice": "rice", "noodle": "noodles", "extract": "extract",
}
# nouns where only a recognised "type" word may be pulled in front (the rest of the parts are descriptors)
INVERT_NEVER = {"milk": {"whole", "skim", "lowfat", "low-fat", "reduced fat", "nonfat", "fluid", "canned", "dry", "evaporated"},
                "rice": {"white", "brown", "wild", "black", "red", "glutinous", "long-grain", "medium-grain", "short-grain",
                         "parboiled", "instant"},
                "pasta": set(), "butter": {"salted", "unsalted", "whipped", "light", "clarified", "regular", "without salt"},
                "cream": set(), "tea": set(), "coffee": set(), "beer": set(), "wine": set()}

MEAT_SPECIES = {"beef", "pork", "lamb", "veal", "chicken", "turkey", "duck", "goose", "mutton", "goat", "rabbit", "ostrich",
                "bison", "venison", "elk", "deer", "horse", "emu", "quail", "pheasant", "guinea hen"}
CUT_WORDS = {
    "breast", "thigh", "thighs", "drumstick", "drumsticks", "wing", "wings", "leg", "legs", "back", "neck", "tender", "tenders",
    "tenderloin", "sirloin", "ribeye", "rib eye", "rib", "ribs", "short ribs", "brisket", "chuck", "round", "flank", "loin",
    "shoulder", "shank", "steak", "roast", "chop", "chops", "cutlet", "rump", "tri-tip", "t-bone", "porterhouse", "skirt",
    "oxtail", "belly", "ham", "bacon", "liver", "heart", "kidney", "tongue", "trotters", "hock", "leg quarter", "fillet",
    "top round", "bottom round", "eye of round", "top sirloin", "bottom sirloin", "strip", "plate", "blade", "cheek",
    "spareribs", "spare ribs", "ribeye steak", "rib eye steak", "tenderloin steak", "ground",
}
POULTRY_CUTS = {"breast", "thigh", "thighs", "drumstick", "drumsticks", "wing", "wings", "leg", "legs", "back", "neck",
                "tender", "tenders", "leg quarter", "breast tenders", "liver", "heart", "gizzard", "giblets", "skin"}

KEEP_PLURAL = {
    "oats", "lentils", "chickpeas", "beans", "peas", "noodles", "grits", "sprouts", "greens", "nuts", "seeds", "almonds",
    "walnuts", "cashews", "pecans", "pistachios", "peanuts", "hazelnuts", "macadamias", "strawberries", "blueberries",
    "raspberries", "blackberries", "cranberries", "grapes", "raisins", "dates", "prunes", "olives", "sardines", "anchovies",
    "oysters", "clams", "mussels", "scallops", "french fries", "chips", "crackers", "pretzels", "cookies", "tortillas",
    "pancakes", "waffles", "brussels sprouts", "mushrooms", "cherries", "currants", "gooseberries", "figs", "capers",
    "pickles", "cornflakes", "cheerios", "flakes", "spaghetti", "macaroni", "lasagna", "fries", "tomatoes" if False else "",
    "leaves", "herbs", "spices", "fish sticks", "meatballs", "nuggets", "chicken nuggets", "pearl onions", "sunflower seeds",
    "pumpkin seeds", "sesame seeds", "chia seeds", "flax seeds", "hemp seeds", "pine nuts", "chestnuts", "pumpkin seeds",
    "raisins", "dumplings", "tacos", "burritos", "enchiladas", "ribs", "wings", "bagels", "muffins", "scones", "crepes",
    "pies" if False else "", "gnocchi", "pierogi", "ravioli", "tortellini", "shrimps" if False else "", "prawns" if False else "",
}
KEEP_PLURAL.discard("")
_SING_EXC = {"leaves": "leaf", "loaves": "loaf", "cookies": "cookie", "brownies": "brownie", "smoothies": "smoothie",
             "veggies": "veggie", "pies": "pie", "calories": "calorie", "chilies": "chili", "chillies": "chili",
             "mice": "mouse", "geese": "goose", "anchovies": "anchovy", "sandwiches": "sandwich", "lollies": "lolly",
             "cakes": "cake", "foods": "food", "juices": "juice", "ices": "ice", "noodles": "noodle", "sauces": "sauce",
             "cheeses": "cheese", "teas": "tea", "waters": "water", "wines": "wine", "oils": "oil", "ciders": "cider",
             "baguettes": "baguette", "crepes": "crepe", "tomatoes": "tomato", "potatoes": "potato", "mangoes": "mango",
             "avocados": "avocado", "jalapenos": "jalapeno", "cherries": "cherry", "peaches": "peach", "radishes": "radish",
             "squashes": "squash", "dishes": "dish", "pastries": "pastry", "jellies": "jelly", "berries": "berry"}
_SING_KEEP = {"groats", "hummus", "molasses", "asparagus", "couscous", "swiss", "citrus", "watercress", "cress", "brussels", "grits",
              "oats", "lentils", "chickpeas", "greens", "sprouts", "series", "species", "bass", "lemongrass", "haggis",
              "mackerel", "salmon", "trout", "shrimp", "cod", "tuna", "squid", "octopus", "swordfish", "hatch", "bok choy",
              "pak choi", "anise", "chives", "hibiscus", "dulce", "gras", "foie gras", "pasta", "tofu", "tempeh", "miso",
              "kimchi", "sauerkraut", "yogurt", "kefir", "quinoa", "bulgur", "barley", "rice", "wheat", "flour", "sugar",
              "salt", "pepper", "garlic", "ginger", "kale", "spinach", "broccoli", "cauliflower", "lettuce", "celery", "corn"}


def singular_word(w: str) -> str:
    lw = w.lower()
    if lw in _SING_KEEP:
        return w
    if lw in _SING_EXC:
        r = _SING_EXC[lw]
        return r.capitalize() if w[:1].isupper() else r
    s = _base_singular(lw)
    return s.capitalize() if w[:1].isupper() and s != lw else (w if s == lw else s)


_KEY_STOP = {"style", "type"}


def head_key(s: str) -> str:
    """Normalised key for grouping / matching heads and names: folded, punctuation and hyphens dropped, every word singularised
    ('Blueberries' == 'Blueberry', 'Greek yogurt-style' == 'Greek yogurt style' == 'greek yogurt')."""
    t = re.sub(r"[^a-z0-9%]+", " ", fold(s))
    return " ".join(_base_singular(w) for w in t.split() if w not in _KEY_STOP)


def singular_phrase(p: str) -> str:
    """Singularise the last word of a phrase unless the phrase (or its tail) is a plural-natural food name."""
    low = p.lower()
    if low in KEEP_PLURAL or any(low.endswith(" " + k) for k in KEEP_PLURAL if " " not in k):
        return p
    words = p.split(" ")
    if not words or not words[-1].isalpha():
        return p
    words[-1] = singular_word(words[-1])
    return " ".join(words)


ACRONYMS = {"USDA", "UPC", "BBQ", "KFC", "MSG", "DHA", "ARA", "UHT", "IQF", "PUFA", "TV", "II", "III", "IV", "UK", "US", "USA",
            "BLT", "PB", "GMO", "RTD", "RTE", "OJ", "HFCS", "SR", "CNF", "DV", "LF", "NS", "NFS", "XL", "PH", "VLDL",
            "MCT", "EPA", "TVP", "PBJ", "RTF", "M.F.", "M.G."}
SPECIAL_CASE = {"mcdonald's": "McDonald's", "mcdonalds": "McDonald's", "mccormick": "McCormick", "mcvitie's": "McVitie's",
                "kfc": "KFC", "bbq": "BBQ", "pbj": "PB&J", "pb&j": "PB&J", "m&m's": "M&M's", "o'charley's": "O'Charley's"}

BRAND_RX = re.compile(
    r"[®™]|\bupc\b|"
    r"\b(kellogg|kraft|nabisco|general mills|quaker|campbell|pillsbury|mcdonald|burger king|wendy'?s|taco bell|kfc|pizza hut|"
    r"subway|domino'?s|starbucks|dunkin|little caesars|arby'?s|chick-?fil-?a|popeyes|applebee|denny'?s|olive garden|chili'?s|"
    r"red lobster|pepperidge|hershey|nestle|oscar mayer|hormel|tyson|heinz|lean cuisine|healthy choice|stouffer|banquet|"
    r"hot pockets|jimmy dean|ben & jerry|haagen|dannon|yoplait|chobani|gatorade|coca-?cola|pepsi|red bull|snickers|twix|"
    r"m&m|reese'?s|oreo|cheerios|pop-?tarts|lunchables|little debbie|entenmann|sara lee|rice-?a-?roni|uncle ben|knorr|"
    r"lipton|kikkoman|bush'?s|goya|progresso|swanson|digiorno|totino|kashi|cascadian|amy'?s|annie'?s|trader joe|"
    r"whole foods|walmart|great value|kirkland|archway|nature'?s path|malt-?o-?meal|ralston|post |ocean spray|"
    r"carnation|ovaltine|ensure|slim-?fast|boost|muscle milk|premier protein|nutri-?grain|special k|kix|chex|cap'?n crunch|"
    r"lucky charms|froot loops|frosted flakes|raisin bran|honey nut|wheaties|trix|cocoa puffs|fiber one|life cereal|"
    r"famous amos|keebler|wise|lay'?s|doritos|fritos|cheetos|pringles|ruffles|tostitos|ritz|triscuit|wheat thins|"
    r"jell-?o|kool-?aid|hawaiian punch|capri sun|arizona|snapple|nesquik|swiss miss|hostess|drake'?s|tastykake|"
    r"cracker barrel|ihop|waffle house|jack in the box|sonic|carl'?s jr|hardee'?s|dairy queen|culver'?s|panera|chipotle|"
    r"papa john'?s|long john silver|boston market|church'?s|bojangles|zaxby'?s|five guys|in-n-out|krispy kreme|"
    r"tim hortons|a&w|bob evans|cinnabon|auntie anne|orange julius|mcnugget|big mac|whopper|"
    r"gerber|beech-?nut|similac|enfamil|mead johnson|abbott|nutramigen|pediasure|"
    r"morningstar|boca|gardein|beyond meat|impossible|silk|so delicious|alpro|oatly|fage|siggi|stonyfield|"
    r"tofutti|daiya|earth balance|i can'?t believe|smart balance|promise|parkay|blue bonnet|country crock|imperial|"
    r"land o'?lakes|philadelphia|velveeta|cheez|babybel|laughing cow|sargento|"
    r"cinnamon toast|toasted oats|golden grahams|lite-?brite|apple jacks|corn pops|rice krispies|"
    r"nature valley|clif|larabar|kind bar|luna bar|power bar|powerbar|pure protein|atkins|zone perfect|balance bar|"
    r"herbalife|isagenix|shakeology|optimum nutrition|gnc|worthington|loma linda|"
    r"campbells?|heinz|hunt'?s|ragu|prego|bertolli|barilla|ronzoni|kraft|"
    r"hidden valley|wish-?bone|newman'?s own|ken'?s|marzetti|"
    r"mcCormick|old el paso|ortega|la choy|chun king|"
    r"rubio'?s|del taco|el pollo loco|qdoba|moe'?s|noodles & company|pret|greggs|nando'?s|wagamama)\b", re.I)
ALLCAPS_RX = re.compile(r"(?:^|[\s,(])([A-Z][A-Z&'’\-]{2,}(?:\s[A-Z&'’\-]{2,})*)(?=[\s,):]|$)")
CAPS_OK = {"USDA", "UPC", "BBQ", "MSG", "DHA", "ARA", "UHT", "IQF", "PUFA", "USA", "NFS", "RTE", "II", "III", "NZ", "TV",
           "EPA", "TVP", "LF", "HFCS", "MCT", "RTD", "XL", "BLT", "AA", "GMO", "NS", "US", "UK"}


def branded(raw: str) -> bool:
    """A brand / restaurant / manufactured-product name (ALL-CAPS brand token, known brand, or 'Product: Flavor, Brand')."""
    if BRAND_RX.search(raw):
        return True
    for m in ALLCAPS_RX.finditer(raw):
        toks = [t for t in re.split(r"[\s,]+", m.group(1)) if t]
        if any(t.strip("&'’-") not in CAPS_OK and len(t.strip("&'’-")) >= 3 for t in toks):
            return True
    if re.search(r"\w: \w", raw):  # "Special K: Almond Vanilla", "Cereal, ready to eat, Kashi: GoLean Crunch"
        return True
    return False


def _fix_caps(text: str) -> str:
    """ALL-CAPS tokens -> Title Case (brands keep a readable shape), known specials restored."""
    def tok(m: re.Match) -> str:
        w = m.group(0)
        lw = w.lower()
        if lw in SPECIAL_CASE:
            return SPECIAL_CASE[lw]
        if len(w) >= 3 and w.upper() == w and w.upper() not in ACRONYMS and any(c.isalpha() for c in w):
            if w.upper() in CAPS_OK:
                return w
            return "-".join(p.capitalize() for p in w.split("-")).replace("'S", "'s")
        return w
    return re.sub(r"[A-Za-z][A-Za-z'’&\-]*", tok, text)


# ------------------------------------------------------------------------------------------------- rewrites on the joined string
REWRITES: list[tuple[re.Pattern, str]] = [(re.compile(p, re.I), r) for p, r in [
    (r"^Beans, snap, yellow\b", "Yellow beans"),
    (r"^Beans, snap(?:, green)?\b", "Green beans"),
    (r"^Beans, string(?:, green)?\b", "Green beans"),
    (r"^Beans, green\b", "Green beans"),
    (r"^Beans, kidney, (?:all types|red|dark red|light red)\b", "Kidney beans"),
    (r"^Peas, green\b", "Green peas"),
    (r"^Peas, edible-podded\b", "Snow peas"),
    (r"^Peas, split\b", "Split peas"),
    (r"^Peas, sugar-?snap\b", "Sugar snap peas"),
    (r"^Peas and carrots\b", "Peas and carrots"),
    (r"^Corn, sweet, (yellow|white)\b", r"Sweet corn, \1"),
    (r"^Corn, sweet\b", "Sweet corn"),
    (r"^Peppers?, (?:sweet|bell)\b", "Bell pepper"),
    (r"^Peppers?, (?:hot )?(?:chili|chile|chilli)\b", "Chili pepper"),
    (r"^Peppers?, (jalape\w+|serrano|banana|ancho|cayenne|habanero|pasilla|poblano)\b", r"\1 pepper"),
    (r"^Squash, summer, zucchini\b", "Zucchini"),
    (r"^Squash, summer, (yellow|crookneck|straightneck|scallop)\b", r"\1 squash"),
    (r"^Squash, winter, (butternut|acorn|spaghetti|hubbard|kabocha)\b", r"\1 squash"),
    (r"^Squash, (zucchini)\b", "Zucchini"),
    (r"^Lettuce, cos or romaine\b", "Romaine lettuce"),
    (r"^Lettuce, (iceberg|butterhead|green leaf|red leaf|boston|bibb)\b[^,]*", r"\1 lettuce"),
    (r"^Cabbage, (chinese) \(pak-choi\)", r"Bok choy"),
    (r"^Cabbage, (chinese) \(pe-tsai\)", r"Napa cabbage"),
    (r"^Cabbage, chinese, pak-choi\b", "Bok choy"),
    (r"^Cabbage, chinese, pe-tsai\b", "Napa cabbage"),
    (r"^Cabbage, (red|savoy)\b", r"\1 cabbage"),
    (r"^Onions?, spring or scallions[^,]*", "Scallions"),
    (r"^Onions?, young green[^,]*", "Scallions"),
    (r"^Onions?, welsh\b", "Welsh onion"),
    (r"^Mushrooms?, (portabella|portobello)\b", "Portobello mushroom"),
    (r"^Mushrooms?, (crimini|shiitake|oyster|enoki|maitake|chanterelle|morel)\b", r"\1 mushroom"),
    (r"^Tomatoes?, red, ripe\b", "Tomato, red"),
    (r"^Tomatoes?, (cherry|grape|plum|roma)\b", r"\1 tomato"),
    (r"^Sweet potato\b", "Sweet potato"),
    (r"^Nuts, (\w+) nuts\b", r"\1 nuts"),
    (r"^Seeds, (\w+) seeds?\b", r"\1 seeds"),
    (r"^Egg, chicken, ", "Egg, "),
    (r"^Egg, whole, fresh or frozen, ", "Egg, whole, "),
    (r"^Egg, white\b", "Egg white"),
    (r"^Egg, yolk\b", "Egg yolk"),
    (r"^Eggs?, chicken\b", "Egg"),
    (r"^Beef, ground\b", "Ground beef"),
    (r"^Pork, ground\b", "Ground pork"),
    (r"^Turkey, ground\b", "Ground turkey"),
    (r"^Chicken, ground\b", "Ground chicken"),
    (r"^Lamb, ground\b", "Ground lamb"),
    (r"^Veal, ground\b", "Ground veal"),
    (r"^Pork, cured, bacon\b", "Bacon"),
    (r"^Pork, cured, ham\b", "Ham"),
    (r"^Pork, bacon\b", "Bacon"),
    (r"^Bacon, ", "Bacon, "),
    (r"^Cereals, oats\b", "Oats"),
    (r"^Cereals, (\w[\w ]*?), (instant|regular|quick|old fashioned)", r"\1, \2"),
    (r"^Oat bran\b", "Oat bran"),
    (r"^Wheat flour, whole-grain\b", "Whole wheat flour"),
    (r"^Flour, wheat, all-purpose\b", "All-purpose flour"),
    (r"^Flour, wheat, whole-grain\b", "Whole wheat flour"),
    (r"^Flour, whole wheat\b", "Whole wheat flour"),
    (r"^Flour, wheat, bread\b", "Bread flour"),
    (r"^Rice, brown, (long|medium|short)-grain\b", r"Brown rice, \1-grain"),
    (r"^Rice, brown\b", "Brown rice"),
    (r"^Rice, wild\b", "Wild rice"),
    (r"^Yogurt, greek\b", "Greek yogurt"),
    (r"^Yogurt, plain\b", "Yogurt, plain"),
    (r"^Milk, buttermilk\b", "Buttermilk"),
    (r"^Milk, canned, evaporated\b", "Evaporated milk"),
    (r"^Milk, canned, condensed\b", "Condensed milk"),
    (r"^Milk, chocolate\b", "Chocolate milk"),
    (r"^Soymilk\b", "Soy milk"),
    (r"^Tofu, raw, firm\b", "Tofu, firm, raw"),
    (r"^Oil, (olive|canola|coconut|avocado|sesame|peanut|sunflower|safflower|corn|soybean|soy|palm|flaxseed|walnut|almond)\b", r"\1 oil"),
    (r"^Oil, vegetable\b", "Vegetable oil"),
    (r"^Vegetable oil, (\w+)\b", r"\1 oil"),
    (r"^Salad dressing, ", "Salad dressing, "),
    (r"^Nuts, (almonds|walnuts|cashew nuts|pecans|pistachio nuts|hazelnuts|macadamia nuts|pine nuts|peanuts)\b", r"\1"),
    (r"^Peanuts, all types\b", "Peanuts"),
    (r"^Peanut butter, ", "Peanut butter, "),
    (r"^Seeds?, ([\w ]+?) seed kernels?\b", r"\1 seeds"),
    (r"^Seeds?, ([\w ]+?) seeds?\b", r"\1 seeds"),
    (r"^Seeds, flaxseed\b", "Flaxseed"),
    (r"^Nuts, brazil-?nuts\b", "Brazil nuts"),
    (r"^Soybeans?, green \(edamame\)", "Edamame"),
    (r"^Sauce, salsa\b", "Salsa"),
    (r"^Salsa sauce\b", "Salsa"),
    (r"^Spices, ", ""),
    (r"^Cheese, (parmesan|cheddar|mozzarella|feta|swiss|gouda|brie|blue|goat|cottage|cream|ricotta|provolone|monterey|colby|edam|gruyere|romano|camembert|muenster|havarti|pepper jack)\b",
     r"\1 cheese"),
    (r"^Beverages, coffee\b", "Coffee"),
    (r"^Beverages, tea\b", "Tea"),
    (r"^Beverages, almond milk\b", "Almond milk"),
    (r"^Beverages, water, tap\b", "Tap water"),
    (r"^Sugars?, granulated\b", "Granulated sugar"),
    (r"^Sugars?, brown\b", "Brown sugar"),
    (r"^Sugars?, powdered\b", "Powdered sugar"),
    (r"^Syrups?, maple\b", "Maple syrup"),
    (r"^Honey\b", "Honey"),
    (r"^Salt, table\b", "Salt, table"),
    (r"^Vinegar, (\w+)\b", r"\1 vinegar"),
    (r"^Chocolate, dark\b", "Dark chocolate"),
    (r"^Chocolate, (milk|white)\b", r"\1 chocolate"),
    (r"^Sweet potatoes?, ", "Sweet potato, "),
    (r"^Potatoes?, (russet|red|white|yellow|purple|gold)\b", r"Potato, \1"),
    (r"^Potatoes?, french-fried\b", "French fries"),
    (r"^Potato, french-fried\b", "French fries"),
    (r"^Potato chips\b", "Potato chips"),
    (r"^Tuna, light, canned\b", "Light tuna, canned"),
    (r"^Tuna, white, canned\b", "White tuna, canned"),
    (r"^Tuna, canned, light\b", "Light tuna, canned"),
    (r"^Tuna, canned, white\b", "White tuna, canned"),
    (r"^Salmon, (?:red \(sockeye\)|sockeye)\b", "Sockeye salmon"),
    (r"^Sardine, ", "Sardines, "),
    (r"^Sardines, atlantic, in oil\b", "Sardines, canned in oil"),
    (r"^Cereals?, hot, ", ""),
    (r"^Candies, chocolate, dark\b", "Dark chocolate"),
    (r"^Candies, chocolate, (milk|white)\b", r"\1 chocolate"),
    (r"^Candies, semisweet chocolate\b", "Semisweet chocolate"),
    (r"^Leavening agents?, (baking soda|baking powder[^,]*|yeast[^,]*)", r"\1"),
    (r"^Mollusks, ", ""),
    (r"^Crustaceans, ", ""),
]]


def _split_parts(s: str) -> list[str]:
    parts, depth, cur = [], 0, []
    for ch in s:
        if ch == "(":
            depth += 1
        elif ch == ")":
            depth = max(0, depth - 1)
        if ch == "," and depth == 0:
            parts.append("".join(cur).strip())
            cur = []
        else:
            cur.append(ch)
    parts.append("".join(cur).strip())
    return [p for p in parts if p]


_DESC_WORD_RX = re.compile(
    r"\b(?:removed|trimmed|untrimmed|lean|fat|skin|skinless|bone|boneless|cooked|raw|fried|baked|roasted|grilled|broiled|"
    r"braised|boiled|stewed|simmered|steamed|sauteed|stir-fried|pan-\w+|deep-\w+|smoked|microwaved|poached|toasted|heated|"
    r"dried|dehydrated|canned|frozen|rotisserie|scrambled|unprepared|prepared|added|salt|sodium|sugar|enriched|fortified|"
    r"drained|trim|waste|separable|visible|retail|batter|breaded|coated|marinated|seasoned|stuffed|cured|uncured)\b", re.I)


def _is_descriptor(p: str) -> bool:
    low = p.lower().strip()
    if not low:
        return True
    return (low in DESCRIPTORS_EXACT or bool(DESCRIPTOR_RX.match(low)) or low in NOISE_PARTS
            or bool(_DESC_WORD_RX.search(low)))


_SPELL_RX = re.compile(r"\b(" + "|".join(sorted(map(re.escape, SPELL), key=len, reverse=True)) + r")\b", re.I)


def _spell(s: str) -> str:
    def sub(m: re.Match) -> str:
        r = SPELL[m.group(1).lower()]
        return r.capitalize() if m.group(1)[:1].isupper() else r
    return _SPELL_RX.sub(sub, s)


def _strip_long_parens(s: str) -> str:
    def sub(m: re.Match) -> str:
        t = m.group(0)
        inner = t[1:-1].strip()
        if re.search(r"alaska native|indigenous|northern plains", inner, re.I):
            return t
        if len(inner) > 38 or re.search(r"^(?:includes?|incl|see|NS|NFS|=)", inner, re.I):
            return ""
        return t
    return re.sub(r"\s*\([^()]*\)", lambda m: (" " + sub(m).strip()) if sub(m) else "", s)


@dataclass
class NameResult:
    name: str
    head: str
    parts: list[str]
    branded: bool
    raw: str = ""


def _dedupe_adjacent(parts: list[str]) -> list[str]:
    out: list[str] = []
    seen: set[str] = set()
    for p in parts:
        k = p.lower()
        if k in seen:
            continue
        seen.add(k)
        out.append(p)
    return out


def _cook_states(parts: list[str]) -> list[str]:
    """'cooked, roasted' -> 'roasted'; 'cooked, dry heat' -> 'cooked'; 'cooked, moist heat' -> 'boiled/steamed';
    'boiled, drained' -> 'boiled'."""
    low = [p.lower() for p in parts]
    out: list[str] = []
    has_method = any(p in COOK_METHODS or p in {"pan-fried", "pan-broiled"} or p.startswith(("pan-", "deep-"))
                     for p in low if p != "cooked")
    for i, p in enumerate(parts):
        lp = p.lower()
        if lp == "cookedheat":
            continue
        if lp == "cooked" and has_method:
            continue
        if lp in {"drained", "drained solids", "drained and rinsed"} and any(
                x in COOK_METHODS or x == "cooked" for x in low if x != lp) and "canned" not in low:
            continue
        out.append(p)
    return out


def _heat_fix(s: str) -> str:
    # raw string carries the placeholder COOKEDHEAT for "cooked, dry heat" / "cooked, moist heat" -> decide by the original text
    return s


def tidy_parts(raw: str, source: str = "") -> list[str]:
    s = _fix_caps(clean_ws(raw))
    moist = bool(re.search(r"cooked,? moist heat", s, re.I))
    dry = bool(re.search(r"cooked,? dry heat", s, re.I))
    for rx, rep in BOILER_SUB:
        s = rx.sub(rep, s)
    s = _strip_long_parens(s)
    s = _spell(s)
    s = s.replace("COOKEDHEAT", "boiled/steamed" if moist else "cooked")
    s = re.sub(r"\bseparable lean and fat\b", "lean and fat", s, flags=re.I)
    s = re.sub(r"\bseparable lean only\b", "lean", s, flags=re.I)
    s = re.sub(r"\bseparable fat\b", "fat only", s, flags=re.I)
    s = re.sub(r"\blean only\b", "lean", s, flags=re.I)
    s = re.sub(r"\bmeat and skin\b", "with skin", s, flags=re.I)
    s = re.sub(r"\bmeat only\b", "", s, flags=re.I)
    s = re.sub(r"\bincludes skin\b", "with skin", s, flags=re.I)
    s = re.sub(r"\bcooked with water\b", "cooked", s, flags=re.I) if False else s
    s = re.sub(r"\s+,", ",", re.sub(r",\s*,+", ",", s)).strip(" ,")
    parts = _split_parts(s)
    kept = []
    for p in parts:
        lp = p.lower().strip(" .")
        if lp in NOISE_PARTS or (NOISE_RX.match(lp) and lp not in {"large", "small", "medium"}):
            continue
        kept.append(p.strip(" ."))
    kept = _cook_states(kept)
    return kept


def _word_count(p: str) -> int:
    return len(p.split())


def _title_first(s: str) -> str:
    return s[:1].upper() + s[1:] if s else s


def _lower_first_unless_proper(s: str) -> str:
    if not s:
        return s
    w = s.split(" ")[0]
    if w.isupper() or (len(w) > 1 and w[1:].lower() != w[1:]) or w in {"Brussels", "Swiss", "Greek", "Chinese", "Italian",
                                                                      "French", "Mexican", "Japanese", "Indian", "Thai"}:
        return s
    return s[0].lower() + s[1:]


QUALIFIERS_DROP = {"fresh", "domestic", "retail", "all classes", "imported", "composite", "dairy-steer", "large-breed",
                   "young", "mature", "all grades", "variety meats and by-products", "separable", "intermuscular"}
QUALIFIERS_KEEP = {"new zealand", "australian", "canadian", "grass-fed", "grain-fed", "wagyu", "organic", "tom", "hen",
                   "stewing", "roasting", "cured", "kobe"}
GENERIC_CUT_NOUN = {"steak", "roast", "chop", "chops", "cutlet", "cutlets", "blade", "trim", "strip", "slices", "pieces"}
PRIMALS = {"chuck", "round", "rib", "loin", "shoulder", "plate", "flank", "leg", "sirloin", "short loin", "hindshank",
           "foreshank", "rump", "shank", "brisket", "neck", "belly", "back", "arm", "blade"}


def _cut_join(parts: list[str]) -> list[str]:
    """Meat/poultry: 'Chicken, breast, ...' -> 'Chicken breast, ...'; red-meat cut runs -> one specific cut phrase."""
    sp = parts[0].lower()
    if sp not in MEAT_SPECIES or len(parts) < 2:
        return parts
    rest = parts[1:]
    kept_q: list[str] = []
    body: list[str] = []
    for r in rest:
        lr = r.lower()
        if not body and lr in QUALIFIERS_DROP:
            continue
        if not body and lr in QUALIFIERS_KEEP and sp not in {"chicken", "turkey", "duck", "goose"}:
            kept_q.append(r)
            continue
        body.append(r)
    if not body:
        return parts[:1] + kept_q
    if sp in {"chicken", "turkey", "duck", "goose", "quail", "pheasant", "guinea hen"}:
        for i in range(min(3, len(body))):
            lb = body[i].lower()
            if lb in POULTRY_CUTS:
                return [f"{parts[0]} {body[i]}"] + body[:i] + body[i + 1:]
            if lb in QUALIFIERS_KEEP or lb in QUALIFIERS_DROP:
                continue
            if _is_descriptor(body[i]):
                break
        return [parts[0]] + [b for b in body if b.lower() not in QUALIFIERS_DROP]
    run: list[str] = []
    for r in body:
        lr = r.lower()
        if lr == "ground":
            break
        if _is_descriptor(r) or lr in QUALIFIERS_DROP:
            break
        run.append(r)
        if len(run) >= 3:
            break
    if not run:
        return [parts[0]] + kept_q + body
    specific = run[-1]
    if specific.lower() in GENERIC_CUT_NOUN and len(run) >= 2:
        specific = f"{run[-2]} {specific}"
    elif len(run) >= 2 and _word_count(specific) == 1 and specific.lower() not in {
            "tenderloin", "sirloin", "ribeye", "brisket", "tri-tip", "t-bone", "porterhouse", "flank", "skirt", "liver"} \
            and run[0].lower() in PRIMALS and run[0].lower() not in specific.lower():
        specific = f"{run[0]} {specific}"
    return [f"{parts[0]} {specific}"] + kept_q + body[len(run):]


def build_name(raw: str, source: str = "", lex: Lexicon | None = None, group: str = "") -> NameResult:
    lex = lex or default_lexicon()
    parts0 = tidy_parts(raw, source)
    is_brand = branded(raw)
    if not parts0:
        return NameResult(clean_ws(raw), clean_ws(raw).lower(), [clean_ws(raw)], is_brand, raw)
    s = ", ".join(parts0)
    for _pass in range(3):
        for rx, rep in REWRITES:
            s2 = rx.sub(rep, s, count=1)
            if s2 != s:
                s = s2.lstrip(", ").strip()
                break
        else:
            break
    parts = _split_parts(s) or parts0
    # drop category lead words
    while len(parts) > 1 and parts[0].lower() in DROP_LEAD:
        parts = parts[1:]
    if len(parts) > 1 and re.match(r"^cereals? ready[- ]to[- ]eat$", parts[0], re.I):
        parts = parts[1:] + ["cereal"] if not any("cereal" in p.lower() for p in parts[1:]) else parts[1:]
    if len(parts) > 2 and re.match(r"^cereals?$", parts[0], re.I) and parts[1].lower() in {"ready to eat", "ready-to-eat"}:
        parts = parts[2:] + ["cereal"] if not any("cereal" in p.lower() for p in parts[2:]) else parts[2:]
    # eggs: drop the species
    if parts and parts[0].lower() in {"egg", "eggs"} and len(parts) > 1 and parts[1].lower() in {"chicken", "hen"}:
        parts = [parts[0]] + parts[2:]
    # meat cuts
    parts = _cut_join(parts)
    # generic type nouns -> "Type noun"
    p0l = parts[0].lower()
    if p0l in TYPE_NOUNS and len(parts) > 1:
        noun = TYPE_NOUNS[p0l]
        skip = INVERT_NEVER.get(p0l)
        idx = None
        for i in range(1, min(4, len(parts))):
            cand = parts[i]
            lc = cand.lower()
            if skip is not None and lc in skip:
                if p0l in {"rice", "milk", "pasta", "butter"}:
                    continue
            if cand.startswith("(") or _is_descriptor(cand) or _word_count(cand) > (5 if p0l == "soup" else 3):
                continue
            if lc.endswith(noun) or lc.endswith(noun.rstrip("s")) or (p0l == "soup" and re.search(r"\b(broth|stock|bouillon|chowder|stew|consomme|bisque)$", lc)):
                idx = i
                break
            if p0l in {"rice", "milk", "butter", "cream", "tea", "coffee", "pasta", "tofu", "yogurt", "wine", "beer", "bread"} and i > 1:
                break
            idx = i
            break
        if idx is not None:
            t = re.sub(r"\s+style$", "", parts[idx], flags=re.I)
            t = re.sub(r"^style\s+", "", t, flags=re.I)
            lt = t.lower()
            if p0l == "beans" and re.search(r"\b(peas?|beans?|lentils?)$", lt):
                noun = ""
            new0 = t if (not noun or lt.endswith(noun) or lt.endswith(noun.rstrip("s")) or noun in lt.split()
                         or (p0l == "soup" and re.search(r"\b(broth|stock|bouillon|chowder|stew|consomme|bisque)$", lt))) else f"{t} {noun}"
            new0 = _title_first(new0)
            parts = [new0] + parts[1:idx] + parts[idx + 1:]
    # head join with the lexicon of known heads: "Squash, butternut" / "Lettuce, romaine" ...
    parts = _known_join(_known_join(parts, lex), lex)
    # singularise the head noun phrase, tidy
    parts[0] = _title_first(parts[0]) if is_brand else singular_phrase(_title_first(parts[0]))
    parts = [parts[0]] + [p for p in parts[1:] if p.lower() != parts[0].lower()]
    parts = _dedupe_adjacent(parts)
    name = ", ".join(parts)
    name = re.sub(r"\s+", " ", name).strip(" ,")
    name = _title_first(name)
    head = head_of(parts, lex)
    if is_brand and BRAND_RX.fullmatch(parts[0].strip()) and len(parts) > 1:
        head = re.sub(r"\s+", " ", " ".join(" ".join(parts[:2]).lower().split()[:3]))
    return NameResult(name, head, parts, is_brand, raw)


GENERIC_P0 = {"melon", "squash", "lettuce", "bean", "pea", "cabbage", "pepper", "onion", "nut", "seed", "berry", "grain",
              "fruit", "vegetable", "green", "sprout", "herb", "spice", "mushroom", "flatfish", "citrus", "tuber", "root",
              "pickle", "pumpkin", "gourd", "yambean", "leaf", "bread", "cereal", "flour", "oil", "sugar", "tea", "salt"}


def _known_join(parts: list[str], lex: Lexicon) -> list[str]:
    """Use the curated everyday heads to pick the head noun phrase:
      * '<p[i]> <p0>' (i = 1..2) is a known head ('butternut squash', 'whole wheat bread', 'skim milk') -> join;
      * p0 is a generic word ('Melon, cantaloupe') and p[i] is itself a known head -> promote p[i]."""
    if len(parts) < 2:
        return parts
    p0 = parts[0].lower()
    p0s = singular_phrase(p0)
    for i in range(1, min(3, len(parts))):
        mod = parts[i]
        alts = [a.strip() for a in re.split(r"\s+or\s+|/", mod)] if len(mod.split()) <= 5 else [mod]
        for alt in alts:
            la = re.sub(r"\s*\([^)]*\)", "", alt.lower()).strip()
            if not la or _word_count(la) > 3:
                continue
            for cand in (f"{la} {p0s}", f"{la} {p0}"):
                if cand in lex.known or singular_phrase(cand) in lex.known:
                    c = singular_phrase(cand) if singular_phrase(cand) in lex.known else cand
                    return [_title_first(c)] + parts[1:i] + parts[i + 1:]
    if p0s in GENERIC_P0 or p0 in GENERIC_P0:
        for i in range(1, min(3, len(parts))):
            la = re.sub(r"\s*\([^)]*\)", "", parts[i].lower()).strip()
            for alt in [a.strip() for a in re.split(r"\s+or\s+|/", la)]:
                if alt and (alt in lex.known or singular_phrase(alt) in lex.known):
                    c = singular_phrase(alt) if singular_phrase(alt) in lex.known else alt
                    return [_title_first(c)] + parts[1:i] + parts[i + 1:]
    return parts


CUT_CANON: dict[str, list[tuple[re.Pattern, str]]] = {sp: [(re.compile(p, re.I), h) for p, h in lst] for sp, lst in {
    "beef": [(r"tenderloin|filet mignon|fillet steak|fillet or tenderloin", "beef tenderloin"),
             (r"ribeye|rib eye|rib-eye", "beef ribeye"), (r"short ribs?", "beef short ribs"),
             (r"sirloin", "beef sirloin"), (r"brisket", "beef brisket"), (r"flank", "flank steak"), (r"skirt", "skirt steak"),
             (r"t-bone|porterhouse", "t-bone steak"), (r"top loin|strip|new york|short loin", "beef strip steak"),
             (r"chuck|pot roast|arm roast|blade", "beef chuck"), (r"round", "beef round"), (r"\bribs?\b|rib roast|prime rib", "beef rib"),
             (r"shank", "beef shank"), (r"stew|cubed|diced", "beef stew meat"), (r"liver", "beef liver"), (r"tri-?tip", "tri-tip"),
             (r"\bsteak\b", "beef steak"), (r"\broast\b", "beef roast")],
    "pork": [(r"tenderloin", "pork tenderloin"), (r"\bchops?\b|loin chop|rib chop", "pork chop"), (r"backribs?|spare ?ribs?|\bribs\b|country-style", "pork ribs"),
             (r"shoulder|boston|butt|collar", "pork shoulder"), (r"belly", "pork belly"), (r"\bloin\b", "pork loin"),
             (r"\bleg\b|\bham\b", "pork leg"), (r"liver", "pork liver")],
    "lamb": [(r"\bchops?\b|loin chop|rib chop", "lamb chop"), (r"\bleg\b", "lamb leg"), (r"shoulder", "lamb shoulder"),
             (r"rack", "lamb rack"), (r"shank", "lamb shank"), (r"liver", "lamb liver")],
}.items()}


CHEESE_WORDS = {"feta", "brie", "camembert", "parmesan", "cheddar", "mozzarella", "gouda", "edam", "emmental", "emmentaler", "gruyere",
                "provolone", "ricotta", "mascarpone", "halloumi", "roquefort", "gorgonzola", "stilton", "havarti", "muenster",
                "colby", "romano", "asiago", "fontina", "manchego", "paneer", "pecorino", "burrata", "cotija", "monterey"}
HEAD_CANON = {
    "kiwifruit": "kiwi", "kiwi fruit": "kiwi", "cashew nuts": "cashews", "cashew nut": "cashews", "cashew": "cashews",
    "pistachio nuts": "pistachios", "pistachio": "pistachios", "pistachio nut": "pistachios", "hazelnut": "hazelnuts",
    "filberts": "hazelnuts", "hazelnuts or filberts": "hazelnuts", "brazilnuts": "brazil nuts", "brazil nut": "brazil nuts",
    "pecan": "pecans", "walnut": "walnuts", "almond": "almonds", "peanut": "peanuts", "currant": "currants",
    "garbanzo beans": "chickpeas", "chickpea": "chickpeas", "garbanzo": "chickpeas", "white rice": "rice",
    "coriander": "cilantro", "coriander leaf": "cilantro", "coriander leaves": "cilantro", "oat": "oats", "lentil": "lentils",
    "macadamia": "macadamia nuts", "macadamia nut": "macadamia nuts", "pine nut": "pine nuts", "pinenuts": "pine nuts",
    "sunflower seed": "sunflower seeds", "pumpkin seed": "pumpkin seeds", "sesame seed": "sesame seeds", "chia seed": "chia seeds",
    "flaxseeds": "flaxseed", "linseed": "flaxseed", "flax seeds": "flaxseed", "hemp seed": "hemp seeds",
    "cheddar": "cheddar cheese", "mozzarella": "mozzarella cheese", "parmesan": "parmesan cheese", "feta": "feta cheese",
    "yoghurt": "yogurt", "greek-style yogurt": "greek yogurt", "greek style yogurt": "greek yogurt",
    "green onion": "scallion", "green onions": "scallion", "spring onion": "scallion", "spring onions": "scallion",
    "collard": "collard greens", "collards": "collard greens", "oatmeal": "oats", "rolled oats": "oats", "porridge oats": "oats",
    "pearl barley": "barley", "pearled barley": "barley", "whole milk": "milk", "skim milk": "milk", "skimmed milk": "milk",
    "low-fat milk": "milk", "cow milk": "milk", "cow's milk": "milk", "semi-skimmed milk": "milk", "light tuna": "tuna",
    "white tuna": "tuna", "albacore tuna": "tuna", "skipjack tuna": "tuna", "yellowfin tuna": "tuna", "bluefin tuna": "tuna",
    "bicarbonate of soda": "baking soda", "naan bread": "naan", "kiwi fruit": "kiwi",
    "atlantic salmon": "salmon", "sockeye salmon": "salmon", "coho salmon": "salmon", "pink salmon": "salmon",
    "chinook salmon": "salmon", "chum salmon": "salmon", "king salmon": "salmon", "red salmon": "salmon", "plant-based beverage": "plant-based milk",
    "nopales": "nopales", "egg white": "egg white", "eggs": "egg", "sweet corn": "sweet corn", "corn": "sweet corn",
    "peppers": "bell pepper", "tomatoes": "tomato", "potatoes": "potato", "bananas": "banana", "apples": "apple",
}


def canon_head(first: str) -> str | None:
    low = first.lower()
    sp = low.split(" ", 1)[0]
    if sp in CUT_CANON and " " in low:
        for rx, h in CUT_CANON[sp]:
            if rx.search(low[len(sp):]):
                return h
    return None


def head_of(parts: list[str], lex: Lexicon | None = None) -> str:
    """The base food a person types: lower-case, singular (except plural-natural), 1-3 words."""
    lex = lex or default_lexicon()
    c = canon_head(parts[0])
    if c:
        return c
    c = HEAD_CANON.get(re.sub(r"\([^)]*\)", "", parts[0]).strip().lower())
    if c:
        return c
    h = re.sub(r"\([^)]*\)", "", parts[0]).strip().lower()
    h = re.sub(r"\s+", " ", h)
    # known head contained as a prefix of the first part ("kidney beans canned" -> "kidney beans")
    cut = re.split(r"\s+(?:from|with|without|made|in|for|on)\s+", h)[0].strip()
    if cut:
        h = cut
        h = HEAD_CANON.get(h, h)
    if h in CHEESE_WORDS:
        return h + " cheese"
    words = h.split(" ")
    if len(words) > 3:
        stop = {"with", "and", "of", "in", "the", "a", "from", "style", "type", "or", "on", "for", "&"}
        w2 = [w for w in words if w not in stop]
        if len(w2) <= 3 and w2:
            return " ".join(w2)
        for n in (3, 2, 1):                       # longest known head at the END of the phrase ("... sirloin steak")
            cand = " ".join(w2[-n:])
            if cand in lex.known or singular_phrase(cand) in lex.known:
                return cand
        for n in (3, 2, 1):                       # ... or at the start
            cand = " ".join(w2[:n])
            if cand in lex.known or singular_phrase(cand) in lex.known:
                return cand
        h = " ".join(w2[:3])
    else:
        h = " ".join(words)
    return h


# ------------------------------------------------------------------------------------------------- form / category / tags
STATE_FORM = {"raw": "raw", "cooked_moist": "cooked", "roasted_baked": "cooked", "grilled": "cooked", "fried": "cooked",
              "sauteed": "cooked", "dried": "dried", "canned": "canned", "frozen": "frozen"}

CATEGORY_MAP = {
    "vegetables": "vegetable", "fruits": "fruit", "legumes": "legume", "grains_cereals": "grain", "nuts_seeds": "nut_seed",
    "dairy": "dairy", "eggs": "egg", "fats_oils": "oil_fat", "beverages": "beverage", "herbs_spices_condiments": "condiment",
    "sweets_sugars": "sweet", "mixed_dishes": "prepared", "soups_sauces": "prepared", "snacks": "sweet",
    "fish_seafood": "fish", "other": "other",
}
POULTRY_RX = re.compile(r"chicken|turkey|duck|goose|\bhens?\b|poultry|quail", re.I)
FATTY_FISH_RX = re.compile(r"salmon|sardine|mackerel|herring|trout|anchov|kipper|pilchard|sprat|arctic char", re.I)
LEAFY_RX = re.compile(r"spinach|kale|chard|collard|lettuce|arugula|rocket|watercress|bok choy|mustard greens|beet greens|turnip greens", re.I)
WHOLE_GRAIN_RX = re.compile(r"whole wheat|wholemeal|whole grain|\boat|barley|quinoa|brown rice|buckwheat|bulgur|\brye\b|millet|spelt", re.I)
FERMENTED_RX = re.compile(r"yogurt|kefir|kimchi|sauerkraut|\bmiso\b|tempeh|natto|kombucha", re.I)
PROCESSED_CATS = {"prepared", "sweet"}


def category_of(food_group: str, name: str) -> str | None:
    """FoodCategory, or None for baby_foods (hidden)."""
    if food_group == "baby_foods":
        return None
    if food_group == "meat_poultry":
        return "poultry" if POULTRY_RX.search(name) else "meat"
    cat = CATEGORY_MAP.get(food_group, "other")
    if cat in {"legume", "nut_seed", "other", "dairy"} and re.search(r"\b(soy ?milk|almond milk|oat milk|rice milk|coconut milk beverage|"
                                                                      r"plant-based beverage|nut milk|cashew milk|soy beverage)\b", name, re.I):
        return "beverage"
    return cat


def form_of(state: str, name: str, category: str, parts: list[str] | None = None) -> str:
    low = name.lower()
    if category == "prepared":
        if re.search(r"\b(sauce|gravy|dressing|broth|stock|bouillon|salsa|dip|spread|paste|puree)\b", low) and not re.search(r"soup|stew", low):
            return "product"
        return "dish"
    first = low.split(",")[0]
    if category == "fruit" and re.search(r"\b(raisins?|prunes?|sultanas?)\b", first) and not re.search(r"juice|bread|bun|cake|cookie|pie", first):
        return "dried"
    if re.search(r"\bjuices?\b", first) and category in {"fruit", "vegetable", "beverage"} and not re.search(r"\b(in|with) [\w ]*juice", first):
        return "juice"
    f = STATE_FORM.get(state)
    if category == "nut_seed" and f == "cooked":
        f = "product"
    if category == "nut_seed" and f in (None, "dried") and re.search(r"\b(dried|dry)\b", low) \
            and not re.search(r"roast|oil|salt|season|flavo|butter|paste|candied|coated|glazed|sweetened|smoked|boiled|cooked|"
                              r"milk|flour|meal|sauce|spread|powder|canned|frozen|juice|syrup|toasted|fried", low):
        return "raw"
    toks = set(re.split(r"[^a-z\-/]+", low))
    if re.search(r"\b(canned|tinned)\b", low):
        return "canned"
    if re.search(r"\b(frozen)\b", low) and f in (None, "raw", "cooked"):
        if not re.search(r"\bfrozen (?:concentrate|yogurt|dessert)", low):
            f = "frozen"
    if f is None or state == "unknown":
        if re.search(r"\b(dried|dehydrated|freeze-dried|dry)\b", low):
            return "dried"
        if toks & {"cooked", "boiled", "roasted", "baked", "fried", "grilled", "steamed", "braised", "stewed", "broiled",
                   "sauteed", "poached", "microwaved", "scrambled", "toasted", "simmered", "rotisserie", "pan-fried"} \
                or "boiled/steamed" in low:
            return "cooked"
        if "raw" in toks or ("fresh" in toks and category in {"fruit", "vegetable", "fish", "meat", "poultry", "egg"}):
            return "raw"
        if category == "nut_seed" and re.search(r"roast", low):
            return "product"
        if category == "nut_seed" and not re.search(
                r"roast|oil|salt|season|flavo|butter|paste|candied|coated|glazed|sweetened|dried|dry|smoked|boiled|cooked|"
                r"milk|flour|meal|sauce|spread|bar\b|mix|cream|chips|toasted|fried|pickled|powder|canned|frozen|juice|syrup", low):
            return "raw"
        if category in {"fruit", "vegetable"} and not re.search(
                r"pickled|preserved|jam|jelly|sauce|puree|paste|spread|candied|glazed|chips|pie|syrup|marmalade|cocktail|"
                r"dehydrated|leather|butter|sauerkraut|kimchi|canned|dried|powder|flour|fries|hash|mashed|stewed|"
                r"cooked|ketchup|salsa|relish|pulp|concentrate|nectar|drink|punch|smoothie|juice|salad|soup|mix|bar\b", low):
            return "raw"
        return "product"
    if f == "cooked" and re.search(r"\b(dried|dehydrated)\b", low) and "cooked" not in toks:
        return "dried"
    if f == "raw" and category in {"fruit", "vegetable"} and re.search(r"\b(dried|dehydrated|canned|frozen)\b", low):
        return "dried" if re.search(r"dried|dehydrated", low) else f
    return f


def tags_of(name: str, category: str, iron: float | None, is_branded: bool, ultra: bool = False) -> list[str]:
    tags: list[str] = []
    if category == "fish" and FATTY_FISH_RX.search(name):
        tags.append("fatty_fish")
    leafy = category == "vegetable" and bool(LEAFY_RX.search(name))
    if leafy:
        tags.append("leafy_green")
    if category == "grain" and WHOLE_GRAIN_RX.search(name):
        tags.append("whole_grain")
    if (category == "legume" or leafy) and iron is not None and iron >= 2:
        tags.append("plant_iron")
    if FERMENTED_RX.search(name) and category in {"dairy", "legume", "vegetable", "beverage", "condiment"}:
        tags.append("fermented")
    if is_branded or ultra:
        tags.append("processed")
    return tags


# ------------------------------------------------------------------------------------------------- aliases
EXTRA_ALIASES = {
    "chickpeas": ["garbanzo", "garbanzo beans"], "zucchini": ["courgette"], "eggplant": ["aubergine"],
    "cilantro": ["coriander leaves"], "shrimp": ["prawns"], "arugula": ["rocket"], "rutabaga": ["swede"],
    "snow peas": ["mangetout"], "bell pepper": ["capsicum", "sweet pepper"], "beet": ["beetroot"],
    "scallions": ["green onion", "spring onion"], "sweet corn": ["sweetcorn", "corn"], "cornstarch": ["cornflour"],
    "oats": ["porridge oats", "rolled oats", "oatmeal"], "peanuts": ["groundnuts"], "canola oil": ["rapeseed oil"],
    "bok choy": ["pak choi"], "green beans": ["string beans", "snap beans", "french beans"],
    "fava beans": ["broad beans"], "lima beans": ["butter beans"], "kiwi": ["kiwifruit", "kiwi fruit"],
    "kiwifruit": ["kiwi"], "romaine lettuce": ["cos lettuce", "romaine"], "papaya": ["pawpaw"], "ketchup": ["catsup"],
    "cantaloupe": ["rockmelon", "muskmelon"], "hot dog": ["frankfurter", "wiener"], "mayonnaise": ["mayo"],
    "swiss chard": ["chard", "silverbeet"], "yogurt": ["yoghurt"], "greek yogurt": ["strained yogurt"],
    "potato chips": ["crisps"], "cookie": ["biscuit"], "tomato paste": ["tomato puree"], "heavy cream": ["double cream", "whipping cream"],
    "skim milk": ["skimmed milk", "nonfat milk"], "doughnut": ["donut"], "donut": ["doughnut"], "cassava": ["yuca", "manioc"],
    "ground beef": ["beef mince", "minced beef", "hamburger meat"], "all-purpose flour": ["plain flour"],
    "powdered sugar": ["icing sugar", "confectioners sugar"], "brown rice": ["wholegrain rice"], "tofu": ["bean curd"],
    "squid": ["calamari"], "crayfish": ["crawfish"], "lemongrass": ["lemon grass"], "rapini": ["broccoli rabe", "broccolini"],
    "okra": ["lady's finger", "gumbo"], "molasses": ["treacle"], "baking soda": ["bicarbonate of soda"],
    "chili pepper": ["chilli", "chile pepper"], "tahini": ["sesame paste"], "edamame": ["soybeans in pod"],
    "nutritional yeast": ["nooch"], "cottage cheese": ["curd cheese"], "sour cream": ["soured cream"],
    "whole wheat bread": ["wholemeal bread", "brown bread"], "white bread": ["sandwich bread"],
    "pita bread": ["pitta", "pita"], "pasta": ["spaghetti", "macaroni"], "cottonseed oil": [], "mackerel": ["scomber"],
    "cider vinegar": ["apple cider vinegar"], "chicken breast": ["chicken"], "turkey breast": ["turkey"], "pork tenderloin": ["pork loin"],
    "salmon": ["salmon fillet"], "cod": ["codfish"], "tuna": ["tunafish"], "avocado": ["avo"], "blueberries": ["blueberry"],
    "peanut butter": ["pb"], "almond milk": ["almond beverage"], "soy milk": ["soymilk", "soya milk"],
    "coconut milk": ["coconut cream"], "butter": ["salted butter"], "egg": ["eggs"], "milk": ["whole milk"],
    "ghee": ["clarified butter"], "kefir": ["fermented milk"], "granola": ["muesli"], "muesli": ["granola"],
    "couscous": ["cous cous"], "polenta": ["cornmeal porridge"], "grits": ["hominy grits"], "tempeh": [],
    "seitan": ["wheat gluten", "wheat meat"], "miso": ["miso paste"], "kimchi": ["kimchee"], "sauerkraut": ["sour cabbage"],
    "hummus": ["houmous", "hommus"], "falafel": [], "naan": ["naan bread"], "chapati": ["roti", "flatbread"],
    "dal": ["dhal", "daal"], "paneer": ["indian cottage cheese"], "tortilla": ["wrap"], "bagel": [],
    "pumpkin": ["squash"], "butternut squash": ["butternut"], "sweet potato": ["yam", "kumara"], "yam": ["true yam"],
    "collard greens": ["collards"], "mustard greens": [], "dandelion greens": [], "watercress": [],
    "brussels sprouts": ["sprouts"], "cabbage": [], "napa cabbage": ["chinese cabbage"], "daikon": ["mooli", "white radish"],
    "mushroom": ["mushrooms"], "portobello mushroom": ["portabella"], "seaweed": ["sea vegetable"], "nori": ["laver"],
    "goji berries": ["wolfberries"], "acai": ["acai berry"], "dragon fruit": ["pitaya", "pitahaya"], "lychee": ["litchi"],
    "persimmon": ["kaki", "sharon fruit"], "guava": [], "plantain": ["cooking banana"], "jackfruit": ["jack fruit"],
    "honeydew": ["honeydew melon"], "clementine": ["mandarin", "tangerine"], "mandarin": ["clementine", "tangerine", "satsuma"],
    "tangerine": ["mandarin"], "currants": ["currant"], "blackcurrants": ["black currant", "cassis"],
    "redcurrants": ["red currant"], "gooseberry": ["gooseberries"], "rhubarb": [], "pomegranate": ["pomegranate seeds"],
}


def aliases_for(head: str, name: str, extra_names: list[str] | None = None, lex: Lexicon | None = None) -> list[str]:
    lex = lex or default_lexicon()
    out: list[str] = []
    nlow = name.lower()

    def add(a: str) -> None:
        a = a.strip().lower()
        if a and a != nlow and a not in out and a != head and len(a) <= 40:
            out.append(a)
    for a in EXTRA_ALIASES.get(head, []):
        add(a)
    hs = singular_phrase(head)
    if hs != head:
        add(hs)
    for g in lex.term_groups.get(head, []) + lex.term_groups.get(hs, []):
        if any(u in nlow for u in g.get("unless", [])):
            continue
        for t in g["terms"]:
            add(t)
    for a in extra_names or []:
        add(a)
    return out[:5]


_GENERIC_PAREN = CUT_WORDS | POULTRY_CUTS | {"steaks", "fillets", "fillet", "slices", "pieces", "strips", "cubes", "flakes", "whole", "mixed", "assorted"}


def paren_names(raw: str) -> list[str]:
    """Alternative names given in parentheses: 'Kiwifruit (Chinese gooseberry)' -> ['chinese gooseberry'] (short only)."""
    out = []
    for m in re.finditer(r"\(([^()]{3,30})\)", raw):
        t = m.group(1).strip()
        if re.search(r"\d|includes|alaska|indigenous|%|approx|cooked|raw|salted|dry|canned|boiled", t, re.I):
            continue
        if len(t.split()) <= 3 and t.lower() not in _GENERIC_PAREN:
            out.append(t.lower())
    return out
