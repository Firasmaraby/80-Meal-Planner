#!/usr/bin/env python3
"""Build the SYNTHETIC test workbook + matching source config (no real data is used anywhere).

  python3 pipeline/fixtures/make_fixture.py [outdir]     # writes synthetic.xlsx, sources_synthetic.json,
                                                         # search_queries_synthetic.json

Three fake sources with deliberately different layouts:
  fake_us  wide layout, USDA-like column names/long names, portion columns, text ids with leading zeros
  fake_ca  wide layout, title rows above the header (header_row=2), kJ + kcal, sodium in g, "Tr"/"N" markers
  fake_uk  LONG layout (foods sheet + values sheet), UK spellings/synonyms, energy as kJ only, vitamin A as RE
plus: duplicates across sources and inside a source, raw vs cooked pairs, junk rows (infant formula, industrial
shortening, lab sample, no kcal/protein), unit differences, negative and impossible values.
"""
from __future__ import annotations

import json
import sys
from pathlib import Path

import pandas as pd

HERE = Path(__file__).resolve().parent

US_COLS = ["NDB_No", "Long_Desc", "FdGrp_Desc", "Energ_Kcal", "Protein_g", "Lipid_Tot_g", "Carbohydrt_g", "Fiber_TD_g",
           "Sugar_Tot_g", "FA_Sat_g", "Calcium_mg", "Iron_mg", "Magnesium_mg", "Potassium_mg", "Sodium_mg", "Zinc_mg",
           "Vit_C_mg", "Vit_A_RAE", "Vit_A_IU", "Folate_DFE_ug", "Vit_D_ug", "Vit_D_IU", "Vit_E_mg", "Vit_K_ug",
           "Vit_B12_ug", "GmWt_1", "GmWt_Desc1", "GmWt_2", "GmWt_Desc2"]


def _us(id_, name, grp, **kw):
    row = {c: None for c in US_COLS}
    row.update({"NDB_No": id_, "Long_Desc": name, "FdGrp_Desc": grp})
    row.update(kw)
    return row


def us_rows():
    F, V, M, D, N, B, O, P, S = ("Fruits and Fruit Juices", "Vegetables and Vegetable Products", "Beef Products",
                                 "Dairy and Egg Products", "Nut and Seed Products", "Baby Foods", "Fats and Oils",
                                 "Poultry Products", "Finfish and Shellfish Products")
    r = [
        _us("09040", "Bananas, raw", F, Energ_Kcal=89, Protein_g=1.09, Lipid_Tot_g=0.33, Carbohydrt_g=22.84, Fiber_TD_g=2.6,
            Sugar_Tot_g=12.23, Calcium_mg=5, Iron_mg=0.26, Magnesium_mg=27, Potassium_mg=358, Sodium_mg=1, Vit_C_mg=8.7,
            Vit_A_RAE=3, Vit_A_IU=64, Folate_DFE_ug=20, GmWt_1=118, GmWt_Desc1="1 medium (7\" to 7-7/8\" long)",
            GmWt_2=225, GmWt_Desc2="1 cup, mashed"),
        _us("09148", "Kiwifruit, green, raw", F, Energ_Kcal=61, Protein_g=1.14, Lipid_Tot_g=0.52, Carbohydrt_g=14.66,
            Fiber_TD_g=3.0, Sugar_Tot_g=8.99, Calcium_mg=34, Iron_mg=0.31, Magnesium_mg=17, Potassium_mg=312, Sodium_mg=3,
            Vit_C_mg=92.7, Vit_A_RAE=4, Folate_DFE_ug=25, Vit_E_mg=1.46, Vit_K_ug=40.3, GmWt_1=69, GmWt_Desc1="1 fruit, without refuse"),
        _us("05062", "Chicken, broilers or fryers, breast, meat only, cooked, roasted", P, Energ_Kcal=165, Protein_g=31.02,
            Lipid_Tot_g=3.57, Carbohydrt_g=0, FA_Sat_g=1.01, Calcium_mg=15, Iron_mg=1.04, Magnesium_mg=28, Potassium_mg=256,
            Sodium_mg=74, Zinc_mg=1.0, Vit_B12_ug=0.34, Vit_D_ug=0.1, GmWt_1=86, GmWt_Desc1="1/2 breast, bone and skin removed"),
        _us("05064", "Chicken, broilers or fryers, breast, meat only, raw", P, Energ_Kcal=120, Protein_g=22.5, Lipid_Tot_g=2.62,
            Carbohydrt_g=0, FA_Sat_g=0.563, Calcium_mg=5, Iron_mg=0.37, Magnesium_mg=28, Potassium_mg=334, Sodium_mg=45),
        _us("05096", "Chicken, broilers or fryers, breast, meat and skin, cooked, roasted", P, Energ_Kcal=197, Protein_g=29.8,
            Lipid_Tot_g=7.78, Carbohydrt_g=0, Calcium_mg=14, Iron_mg=0.7, Potassium_mg=240, Sodium_mg=71),
        _us("11090", "Broccoli, raw", V, Energ_Kcal=34, Protein_g=2.82, Lipid_Tot_g=0.37, Carbohydrt_g=6.64, Fiber_TD_g=2.6,
            Sugar_Tot_g=1.7, Calcium_mg=47, Iron_mg=0.73, Magnesium_mg=21, Potassium_mg=316, Sodium_mg=33, Vit_C_mg=89.2,
            Vit_A_RAE=31, Vit_A_IU=623, Folate_DFE_ug=63, Vit_K_ug=101.6, Vit_E_mg=0.78, GmWt_1=91, GmWt_Desc1="1 cup chopped"),
        _us("11091", "Broccoli, cooked, boiled, drained, without salt", V, Energ_Kcal=35, Protein_g=2.38, Lipid_Tot_g=0.41,
            Carbohydrt_g=7.18, Fiber_TD_g=3.3, Calcium_mg=40, Iron_mg=0.67, Potassium_mg=293, Sodium_mg=41, Vit_C_mg=64.9,
            Vit_A_RAE=77, Folate_DFE_ug=108, Vit_K_ug=141.1, GmWt_1=156, GmWt_Desc1="1 cup chopped"),
        _us("15076", "Fish, salmon, Atlantic, farmed, raw", S, Energ_Kcal=208, Protein_g=20.42, Lipid_Tot_g=13.42,
            Carbohydrt_g=0, FA_Sat_g=3.05, Calcium_mg=9, Iron_mg=0.34, Magnesium_mg=27, Potassium_mg=363, Sodium_mg=59,
            Vit_D_ug=11.0, Vit_D_IU=440, Vit_B12_ug=3.18, Vit_A_RAE=12, Vit_A_IU=40),
        _us("16027", "Beans, kidney, all types, mature seeds, raw", V, Energ_Kcal=337, Protein_g=23.58, Lipid_Tot_g=0.83,
            Carbohydrt_g=61.29, Fiber_TD_g=15.2, Calcium_mg=143, Iron_mg=8.2, Magnesium_mg=140, Potassium_mg=1406,
            Sodium_mg=24, Zinc_mg=2.79, Folate_DFE_ug=394),
        _us("11457", "Spinach, raw", V, Energ_Kcal=23, Protein_g=2.86, Lipid_Tot_g=0.39, Carbohydrt_g=3.63, Fiber_TD_g=2.2,
            Sugar_Tot_g=0.42, Calcium_mg=99, Iron_mg=2.71, Magnesium_mg=79, Potassium_mg=558, Sodium_mg=79, Vit_C_mg=28.1,
            Vit_A_RAE=469, Vit_A_IU=9377, Folate_DFE_ug=194, Vit_K_ug=482.9, Vit_E_mg=2.03),
        _us("01077", "Milk, whole, 3.25% milkfat, with added vitamin D", D, Energ_Kcal=61, Protein_g=3.15, Lipid_Tot_g=3.25,
            Carbohydrt_g=4.8, Sugar_Tot_g=5.05, FA_Sat_g=1.86, Calcium_mg=113, Iron_mg=0.03, Magnesium_mg=10, Potassium_mg=132,
            Sodium_mg=43, Vit_D_ug=1.3, Vit_B12_ug=0.45, GmWt_1=244, GmWt_Desc1="1 cup"),
        _us("01009", "Cheese, cheddar", D, Energ_Kcal=403, Protein_g=22.87, Lipid_Tot_g=33.31, Carbohydrt_g=3.09,
            FA_Sat_g=18.87, Calcium_mg=710, Iron_mg=0.14, Sodium_mg=653, Zinc_mg=3.64, Vit_A_RAE=330, Vit_B12_ug=1.1,
            GmWt_1=132, GmWt_Desc1="1 cup, diced", GmWt_2=28.35, GmWt_Desc2="1 oz"),
        _us("01009", "Cheese, cheddar (duplicate id row)", D, Energ_Kcal=403),  # duplicate id -> dropped at ingest
        _us("01999", "Cheese, cheddar", D, Energ_Kcal=403, Protein_g=22.87, Lipid_Tot_g=33.31, Carbohydrt_g=3.09,
            Calcium_mg=710),  # same food listed twice in one source -> merged
        _us("04053", "Oil, olive, salad or cooking", O, Energ_Kcal=884, Protein_g=0, Lipid_Tot_g=100, Carbohydrt_g=0,
            FA_Sat_g=13.8, Vit_E_mg=14.35, Vit_K_ug=60.2),
        _us("01123", "Egg, whole, raw, fresh", D, Energ_Kcal=143, Protein_g=12.56, Lipid_Tot_g=9.51, Carbohydrt_g=0.72,
            Calcium_mg=56, Iron_mg=1.75, Potassium_mg=138, Sodium_mg=142, Vit_D_ug=2.0, Vit_B12_ug=0.89, Vit_E_mg=1.05,
            GmWt_1=50, GmWt_Desc1="1 large"),
        _us("12061", "Nuts, almonds", N, Energ_Kcal=579, Protein_g=21.15, Lipid_Tot_g=49.93, Carbohydrt_g=21.55, Fiber_TD_g=12.5,
            Sugar_Tot_g=4.35, Calcium_mg=269, Iron_mg=3.71, Magnesium_mg=270, Potassium_mg=733, Sodium_mg=1, Zinc_mg=3.12,
            Vit_E_mg=25.63, GmWt_1=28.35, GmWt_Desc1="1 oz (23 whole kernels)"),
        _us("08120", "Cereals, oats, regular and quick, not fortified, dry", "Breakfast Cereals", Energ_Kcal=379, Protein_g=13.15,
            Lipid_Tot_g=6.52, Carbohydrt_g=67.7, Fiber_TD_g=10.1, Calcium_mg=52, Iron_mg=4.25, Magnesium_mg=138, Potassium_mg=362,
            Sodium_mg=6, Zinc_mg=3.64, GmWt_1=81, GmWt_Desc1="1 cup"),
        _us("20054", "Rice, white, long-grain, regular, enriched, cooked", "Cereal Grains and Pasta", Energ_Kcal=130, Protein_g=2.69,
            Lipid_Tot_g=0.28, Carbohydrt_g=28.17, Fiber_TD_g=0.4, Calcium_mg=10, Iron_mg=1.2, Sodium_mg=1),
        _us("11477", "Squash, summer, zucchini, includes skin, raw", V, Energ_Kcal=17, Protein_g=1.21, Lipid_Tot_g=0.32,
            Carbohydrt_g=3.11, Fiber_TD_g=1.0, Calcium_mg=16, Iron_mg=0.37, Potassium_mg=261, Vit_C_mg=17.9, Vit_A_RAE=10,
            Folate_DFE_ug=24),
        _us("11209", "Eggplant, raw", V, Energ_Kcal=25, Protein_g=0.98, Lipid_Tot_g=0.18, Carbohydrt_g=5.88, Fiber_TD_g=3.0,
            Calcium_mg=9, Iron_mg=0.23, Potassium_mg=229, Vit_K_ug=3.5),
        _us("16057", "Chickpeas (garbanzo beans, bengal gram), mature seeds, raw", V, Energ_Kcal=378, Protein_g=20.47,
            Lipid_Tot_g=6.04, Carbohydrt_g=62.95, Fiber_TD_g=12.2, Calcium_mg=57, Iron_mg=4.31, Magnesium_mg=79, Potassium_mg=718,
            Folate_DFE_ug=557),
        _us("15270", "Crustaceans, shrimp, mixed species, raw", S, Energ_Kcal=85, Protein_g=20.1, Lipid_Tot_g=0.51, Carbohydrt_g=0.2,
            Calcium_mg=64, Iron_mg=0.52, Sodium_mg=119, Vit_B12_ug=1.11),
        _us("09003", "Apples, raw, with skin", F, Energ_Kcal=52, Protein_g=0.26, Lipid_Tot_g=0.17, Carbohydrt_g=13.81, Fiber_TD_g=2.4,
            Sugar_Tot_g=10.39, Vit_C_mg=4.6, Potassium_mg=107, GmWt_1=182, GmWt_Desc1="1 medium (3\" dia)"),
        _us("11529", "Tomatoes, red, ripe, raw, year round average", V, Energ_Kcal=18, Protein_g=0.88, Lipid_Tot_g=0.2,
            Carbohydrt_g=3.92, Fiber_TD_g=1.2, Vit_C_mg=13.7, Potassium_mg=237, Vit_A_RAE=42, Vit_K_ug=7.9),
        _us("18069", "Bread, whole-wheat, commercially prepared", "Baked Products", Energ_Kcal=252, Protein_g=12.45, Lipid_Tot_g=3.5,
            Carbohydrt_g=42.7, Fiber_TD_g=6.0, Calcium_mg=161, Iron_mg=2.5, Sodium_mg=450),
        _us("18070", "Bread, white, commercially prepared", "Baked Products", Energ_Kcal=266, Protein_g=8.85, Lipid_Tot_g=3.33,
            Carbohydrt_g=50.61, Fiber_TD_g=-2.0, Sodium_mg=491),  # negative fibre -> dropped value
        _us("99001", "Protein blend, mystery powder", "Sweets", Energ_Kcal=400, Protein_g=150, Lipid_Tot_g=2, Carbohydrt_g=10),
        _us("99002", "Beef, variety meats and by-products, heart, raw", M, Energ_Kcal=112, Protein_g=17.7, Lipid_Tot_g=3.9,
            Carbohydrt_g=0.1, Iron_mg=4.3, Vit_B12_ug=8.5),
        _us("99003", "Game meat, bison, ground, raw", M, Energ_Kcal=146, Protein_g=19.4, Lipid_Tot_g=7.2, Carbohydrt_g=0,
            Iron_mg=3.4, Zinc_mg=4.4),
        _us("99004", "CEREALS RTE, KELLOGG'S, RICE KRISPIES", "Breakfast Cereals", Energ_Kcal=381, Protein_g=6, Lipid_Tot_g=1,
            Carbohydrt_g=85, Fiber_TD_g=1, Iron_mg=11.0, Calcium_mg=20, Sodium_mg=700),
        _us("99005", "Whale, beluga, meat, dried (Alaska Native)", "American Indian/Alaska Native Foods", Energ_Kcal=290,
            Protein_g=71.7, Lipid_Tot_g=2.7, Carbohydrt_g=0, Iron_mg=17.0, Vit_C_mg=2.0),
        _us("99006", "Infant formula, MEAD JOHNSON, ENFAMIL, ready-to-feed", B, Energ_Kcal=68, Protein_g=1.4, Lipid_Tot_g=3.7,
            Carbohydrt_g=7.5, Iron_mg=1.2),
        _us("99007", "Shortening, industrial, soy (partially hydrogenated), pourable", O, Energ_Kcal=884, Protein_g=0,
            Lipid_Tot_g=100, Carbohydrt_g=0),
        _us("99008", "Sample 12 - lab test", "Sweets", Energ_Kcal=100, Protein_g=1, Lipid_Tot_g=1, Carbohydrt_g=20),
        _us("99009", "Spices, mystery blend", "Spices and Herbs", Sodium_mg=500, Calcium_mg=20),  # no kcal, no protein
        _us("99010", "", F, Energ_Kcal=50),  # blank name
        _us("99011", "Baby food, apples, strained", B, Energ_Kcal=45, Protein_g=0.2, Lipid_Tot_g=0.1, Carbohydrt_g=11),
    ]
    return pd.DataFrame(r, columns=US_COLS)


CA_COLS = ["FoodID", "FoodDescription", "Energy (kJ)", "Energy (kcal)", "Protein (g)", "Total Fat (g)", "Carbohydrate (g)",
           "Dietary Fibre (g)", "Calcium (mg)", "Iron (mg)", "Potassium (mg)", "Sodium (g)", "Vitamin C (mg)",
           "Vitamin A (RAE µg)", "Vitamin D (IU)", "Folate DFE (mcg)", "Vitamin E (mg)"]


def _ca(id_, name, kj, kcal, p, f, c, fib, ca, fe, k, na_g, vc, va, vd_iu, fol, ve):
    return [id_, name, kj, kcal, p, f, c, fib, ca, fe, k, na_g, vc, va, vd_iu, fol, ve]


def ca_rows():
    return pd.DataFrame([
        _ca(1001, "Banana, raw", 375, 89.5, 1.1, 0.3, 22.8, None, 5, 0.3, 358, 0.001, 8.7, 3, None, 20, 0.1),
        _ca(1002, "Kiwifruit, green, raw", 255, 60.9, 1.1, 0.5, 14.7, 3.0, 34, 0.3, 312, 0.003, 92.7, "Tr", None, 25, 1.46),
        _ca(1003, "Chicken, broiler, breast, meat only, roasted", 690, 165, 31.0, 3.6, 0, 0, 15, 1.0, 256, 0.074, 0, 5, None, 4, 0.2),
        _ca(1004, "Broccoli, raw", 142, 34, 2.8, 0.4, 6.6, 2.6, 47, 0.7, 316, 0.033, 89.2, 31, None, 63, "N"),
        _ca(1005, "Salmon, Atlantic, farmed, raw", 870, 208, 20.4, 13.4, 0, 0, 9, 0.3, 363, 0.059, 3.9, 12, 440, 25, 3.55),
        _ca(1006, "Cheese, cheddar", 1686, 403, 22.9, 33.3, 3.1, 0, 710, 0.1, 98, 0.653, 0, 330, None, 27, 0.7),
        _ca(1007, "Egg, whole, raw", 598, 143, 12.6, 9.5, 0.7, 0, 56, 1.75, 138, 0.142, 0, 160, 82, 47, 1.05),
        _ca(1008, "Almonds, dry roasted", 2430, 581, 21.0, 50.6, 20.5, 11.8, 263, 3.7, 746, 0.003, 0, 0, None, 44, 25.6),
        _ca(1009, "Pomegranate, raw", 346, 83, 1.7, 1.2, 18.7, 4.0, 10, 0.3, 236, 0.003, 10.2, 0, None, 38, 0.6),
        _ca(1010, "Turkey, breast, meat only, roasted", 650, 155, 29.9, 3.2, 0, 0, 12, 0.8, 280, 0.06, 0, 0, None, 7, 0.1),
        _ca(1011, "Lentils, boiled", 485, 116, 9.0, 0.4, 20.1, 7.9, 19, 3.3, 369, 0.002, 1.5, 0, None, 181, 0.1),
        _ca(1012, "Yogurt, plain, whole milk", 255, 61, 3.5, 3.3, 4.7, 0, 121, 0.05, 155, 0.046, 0.5, 27, None, 7, 0.1),
        _ca(1013, "Honey", 1272, 304, 0.3, 0, 82.4, 0.2, 6, 0.4, 52, 0.004, 0.5, 0, None, 2, 0),
        _ca(1014, "Tuna, light, canned in water", 490, 116, 25.5, 0.8, 0, 0, 11, 1.0, 237, 0.247, 0, 16, 68, 4, 0.3),
        _ca(1015, "Spinach, raw", 100, 23, 2.9, 0.4, 3.6, 2.2, 99, 2.7, 558, 0.079, 28.1, 469, None, 194, 2.03),
        _ca(1016, "Pasta, cooked, enriched", 650, 158, 5.8, 0.9, 30.9, 1.8, 7, 1.3, 44, 0.001, 0, 0, None, 7, 0.1),
        _ca(1017, "Pasta, cooked, enriched", 650, 158, 5.8, 0.9, 30.9, 1.8, 7, 1.3, 44, 0.001, 0, 0, None, 7, 0.1),  # exact copy, other id
        _ca(1018, "Wine, red", 355, 85, 0.1, 0, 2.6, 0, 8, 0.5, 127, 0.004, 0, 0, None, 0, 0),
        _ca(1019, "Mystery bar, 5000 kJ error", 5000, 5000, 5, 5, 5, 1, 1, 1, 1, 0.001, 0, 0, None, 0, 0),  # kcal 5000 -> dropped
        _ca(1020, "Soup, tomato, canned, condensed", 300, 72, 1.8, 1.1, 14.4, 1.0, 20, 0.6, 400, 0.9, 0.5, 20, None, 5, 0.2),
    ], columns=CA_COLS)


UK_FOODS = [
    ("F001", "Bananas, raw", "Fruit"), ("F002", "Courgette, raw", "Vegetables"), ("F003", "Aubergine, raw", "Vegetables"),
    ("F004", "Prawns, raw", "Fish and fish products"), ("F005", "Chicken, breast, roasted, skinless", "Poultry"),
    ("F006", "Yoghurt, plain, whole milk", "Milk products"), ("F007", "Broccoli, boiled in unsalted water", "Vegetables"),
    ("F008", "Porridge oats, dry", "Cereals"), ("F009", "Crisps, potato, plain", "Savoury snacks"),
    ("F010", "Chickpeas, dried, boiled", "Pulses"), ("F011", "Baby rusks, infant", "Infant foods"),
    ("F012", "Beetroot, raw", "Vegetables"), ("F013", "Cheddar cheese", "Cheese"), ("F014", "Mixed herbs, dried", "Herbs"),
    ("F015", "Rapeseed oil", "Fats and oils"),
]
UK_VALUES = [
    # code, component, value, unit
    ("F001", "Energy", 380, "kJ"), ("F001", "Protein", 1.2, "g"), ("F001", "Fat", 0.3, "g"), ("F001", "Carbohydrate", 23.2, "g"),
    ("F001", "Fibre", 1.1, "g"), ("F001", "Sodium", 1, "mg"), ("F001", "Vitamin C", 11, "mg"), ("F001", "Folate", 14, "µg"),
    ("F001", "Vitamin A", 5, "µg RE"), ("F001", "Potassium", 400, "mg"), ("F001", "Iron", 0.3, "mg"), ("F001", "Magnesium", 34, "mg"),
    ("F002", "Energy", 80, "kJ"), ("F002", "Protein", 1.8, "g"), ("F002", "Fat", 0.4, "g"), ("F002", "Carbohydrate", 1.8, "g"),
    ("F002", "Vitamin C", 21, "mg"), ("F002", "Folate", 24, "µg"), ("F002", "Potassium", 261, "mg"), ("F002", "Vitamin A", 66, "µg RE"),
    ("F003", "Energy", 105, "kJ"), ("F003", "Protein", 1.0, "g"), ("F003", "Fat", 0.2, "g"), ("F003", "Carbohydrate", 5.7, "g"),
    ("F003", "Potassium", 230, "mg"), ("F003", "Vitamin C", 2.2, "mg"), ("F003", "Iron", 0.3, "mg"),
    ("F004", "Energy", 360, "kJ"), ("F004", "Protein", 20.1, "g"), ("F004", "Fat", 0.5, "g"), ("F004", "Carbohydrate", 0.2, "g"),
    ("F004", "Sodium", 119, "mg"), ("F004", "Selenium", 38, "µg"), ("F004", "Iodine", 35, "µg"),
    ("F005", "Energy", 690, "kJ"), ("F005", "Protein", 32.0, "g"), ("F005", "Fat", 2.5, "g"), ("F005", "Carbohydrate", 0, "g"),
    ("F005", "Selenium", 18, "µg"),
    ("F006", "Energy", 250, "kJ"), ("F006", "Protein", 3.6, "g"), ("F006", "Fat", 3.2, "g"), ("F006", "Carbohydrate", 4.5, "g"),
    ("F006", "Calcium", 124, "mg"), ("F006", "Iodine", 38, "µg"), ("F006", "Vitamin D", 40, "IU"),
    ("F007", "Energy", 150, "kJ"), ("F007", "Protein", 3.1, "g"), ("F007", "Fat", 0.8, "g"), ("F007", "Carbohydrate", 1.8, "g"),
    ("F007", "Fibre", 2.3, "g"), ("F007", "Vitamin C", 44, "mg"), ("F007", "Vitamin K", 115, "µg"),
    ("F008", "Energy", 1590, "kJ"), ("F008", "Protein", 11.0, "g"), ("F008", "Fat", 8.1, "g"), ("F008", "Carbohydrate", 72.8, "g"),
    ("F008", "Fibre", 7.0, "g"), ("F008", "Manganese", 4.9, "mg"),
    ("F009", "Energy", 2200, "kJ"), ("F009", "Protein", 6.1, "g"), ("F009", "Fat", 34.0, "g"), ("F009", "Carbohydrate", 49.3, "g"),
    ("F009", "Sodium", 0.5, "g NaCl"),
    ("F010", "Energy", 520, "kJ"), ("F010", "Protein", 8.4, "g"), ("F010", "Fat", 2.1, "g"), ("F010", "Carbohydrate", 18.2, "g"),
    ("F010", "Fibre", 4.8, "g"), ("F010", "Folate", 172, "µg"), ("F010", "Iron", 2.1, "mg"),
    ("F011", "Energy", 1600, "kJ"), ("F011", "Protein", 8, "g"), ("F011", "Fat", 7, "g"), ("F011", "Carbohydrate", 75, "g"),
    ("F012", "Energy", 150, "kJ"), ("F012", "Protein", 1.7, "g"), ("F012", "Fat", 0.1, "g"), ("F012", "Carbohydrate", 7.6, "g"),
    ("F012", "Folate", 80, "µg"),
    ("F013", "Energy", 1690, "kJ"), ("F013", "Protein", 25.4, "g"), ("F013", "Fat", 34.9, "g"), ("F013", "Carbohydrate", 0.1, "g"),
    ("F013", "Calcium", 739, "mg"), ("F013", "Vitamin B12", 2.4, "µg"),
    ("F014", "Energy", 1200, "kJ"), ("F014", "Protein", 12.0, "g"), ("F014", "Fat", 4.0, "g"), ("F014", "Carbohydrate", 40.0, "g"),
    ("F014", "Iron", 100.0, "mg"), ("F014", "Calcium", 1500, "mg"),
    ("F015", "Energy", 3700, "kJ"), ("F015", "Protein", 0, "g"), ("F015", "Fat", 99.9, "g"), ("F015", "Carbohydrate", 0, "g"),
    ("F015", "Vitamin E", 18.4, "mg α-TE"), ("F015", "Vitamin K", 71, "µg"),
]


def build_workbook(path: Path) -> None:
    with pd.ExcelWriter(path, engine="openpyxl") as xw:
        us_rows().to_excel(xw, sheet_name="FakeUSDA", index=False)
        ca = ca_rows()
        title = pd.DataFrame([["FAKE CANADIAN TABLE - synthetic test data"] + [None] * (len(CA_COLS) - 1),
                              [None] * len(CA_COLS)])
        title.to_excel(xw, sheet_name="FakeCNF", index=False, header=False, startrow=0)
        ca.to_excel(xw, sheet_name="FakeCNF", index=False, header=True, startrow=2)
        pd.DataFrame(UK_FOODS, columns=["Code", "Food Name", "Group"]).to_excel(xw, sheet_name="UK_Foods", index=False)
        pd.DataFrame(UK_VALUES, columns=["Code", "Component", "Value", "Unit"]).to_excel(xw, sheet_name="UK_Values", index=False)
        pd.DataFrame({"note": ["Synthetic workbook for pipeline tests. Not real food data."]}).to_excel(
            xw, sheet_name="README", index=False)


def build_config() -> dict:
    def s(col, unit=None, **kw):
        d = {"column": col}
        if unit:
            d["unit"] = unit
        d.update(kw)
        return d

    us_nut = {
        "kcal": s("Energ_Kcal", "kcal"), "protein": s("Protein_g", "g"), "fat": s("Lipid_Tot_g", "g"),
        "carbs": s("Carbohydrt_g", "g"), "fiber": s("Fiber_TD_g", "g"), "sugar": s("Sugar_Tot_g", "g"),
        "satFat": s("FA_Sat_g", "g"), "calcium": s("Calcium_mg", "mg"), "iron": s("Iron_mg", "mg"),
        "magnesium": s("Magnesium_mg", "mg"), "potassium": s("Potassium_mg", "mg"), "sodium": s("Sodium_mg", "mg"),
        "zinc": s("Zinc_mg", "mg"), "vitC": s("Vit_C_mg", "mg"),
        "vitA": [s("Vit_A_RAE", "µg RAE"), s("Vit_A_IU", "IU")],      # IU alone is NOT convertible -> never used
        "folate": s("Folate_DFE_ug", "µg DFE"),
        "vitD": [s("Vit_D_ug", "µg"), s("Vit_D_IU", "IU")],          # IU / 40 fallback
        "vitE": s("Vit_E_mg", "mg"), "vitK": s("Vit_K_ug", "µg"), "b12": s("Vit_B12_ug", "µg"),
    }
    ca_nut = {
        "kcal": [s("Energy (kcal)", "kcal"), s("Energy (kJ)", "kJ")], "protein": s("Protein (g)", "g"),
        "fat": s("Total Fat (g)", "g"), "carbs": s("Carbohydrate (g)", "g"), "fiber": s("Dietary Fibre (g)", "g"),
        "calcium": s("Calcium (mg)", "mg"), "iron": s("Iron (mg)", "mg"), "potassium": s("Potassium (mg)", "mg"),
        "sodium": s("Sodium (g)", "g"), "vitC": s("Vitamin C (mg)", "mg"), "vitA": s("Vitamin A (RAE µg)", "µg RAE"),
        "vitD": s("Vitamin D (IU)", "IU"), "folate": s("Folate DFE (mcg)", "µg DFE"), "vitE": s("Vitamin E (mg)", "mg"),
    }
    uk_nut = {
        "kcal": {"match": ["Energy"], "unit": "kJ"}, "protein": {"match": ["Protein"]}, "fat": {"match": ["Fat"]},
        "carbs": {"match": ["Carbohydrate"]}, "fiber": {"match": ["Fibre"]}, "sodium": {"match": ["Sodium"]},
        "calcium": {"match": ["Calcium"]}, "iron": {"match": ["Iron"]}, "potassium": {"match": ["Potassium"]},
        "magnesium": {"match": ["Magnesium"]}, "manganese": {"match": ["Manganese"]}, "selenium": {"match": ["Selenium"]},
        "iodine": {"match": ["Iodine"]}, "vitC": {"match": ["Vitamin C"]}, "vitA": {"match": ["Vitamin A"]},
        "vitD": {"match": ["Vitamin D"]}, "vitE": {"match": ["Vitamin E"]}, "vitK": {"match": ["Vitamin K"]},
        "folate": {"match": ["Folate"]}, "b12": {"match": ["Vitamin B12"]},
    }
    return {
        "settings": {
            "name_rules": "../config/name_rules.json", "name_overrides": "none.jsonl",
            "curate_rules": "../config/curate_rules.json", "common_foods": "../config/common_foods.txt",
            "servings_defaults": "../config/servings_defaults.json",
            "dedupe": {"name_threshold": 0.88, "cosine_min": 0.98, "kcal_rel_tol": 0.10, "kcal_abs_tol": 5.0},
            "servings": {"max_per_food": 6},
        },
        "source_priority": ["fake_us", "fake_ca", "fake_uk"],
        "sources": [
            {"key": "fake_us", "db": "Synthetic US Table (test)", "citation": "SYNTHETIC test data A, not real.",
             "status": "synthetic", "sheet": "FakeUSDA", "layout": "wide", "header_row": 0, "id_column": "NDB_No",
             "id_pad": 5, "name_column": "Long_Desc", "group_column": "FdGrp_Desc", "nutrients": us_nut,
             "portions": {"layout": "wide_pairs", "pairs": [{"grams": "GmWt_1", "desc": "GmWt_Desc1"},
                                                              {"grams": "GmWt_2", "desc": "GmWt_Desc2"}]}},
            {"key": "fake_ca", "db": "Synthetic CA Table (test)", "citation": "SYNTHETIC test data B, not real.",
             "status": "synthetic", "sheet": "FakeCNF", "layout": "wide", "header_row": 2, "id_column": "FoodID",
             "name_column": "FoodDescription", "nutrients": ca_nut},
            {"key": "fake_uk", "db": "Synthetic UK Table (test)", "citation": "SYNTHETIC test data C, not real.",
             "status": "synthetic", "sheet": "UK_Values", "layout": "long", "id_column": "Code",
             "long": {"nutrient_column": "Component", "value_column": "Value", "unit_column": "Unit", "match_on": "raw"},
             "names": {"sheet": "UK_Foods", "id_column": "Code", "name_column": "Food Name", "group_column": "Group"},
             "nutrients": uk_nut},
        ],
    }


def build_queries() -> list[dict]:
    q = [("banana", ["banana"]), ("kiwi", ["kiwi"]), ("chicken breast", ["chicken breast"]), ("broccoli", ["broccoli"]),
         ("salmon", ["salmon"]), ("zucchini", ["zucchini", "courgette"]), ("courgette", ["zucchini", "courgette"]),
         ("aubergine", ["eggplant", "aubergine"]), ("eggplant", ["eggplant", "aubergine"]), ("prawns", ["shrimp", "prawn"]),
         ("shrimp", ["shrimp", "prawn"]), ("chickpeas", ["chickpea", "garbanzo"]), ("garbanzo", ["chickpea", "garbanzo"]),
         ("yoghurt", ["yogurt"]), ("cheddar", ["cheddar"]), ("kidney beans", ["kidney bean"]), ("spinach", ["spinach"]),
         ("olive oil", ["olive oil"]), ("egg", ["egg"]), ("almonds", ["almond"]), ("milk", ["milk"]), ("apple", ["apple"]),
         ("tomato", ["tomato"]), ("whole wheat bread", ["whole-wheat bread", "whole wheat bread"]),
         ("potato crisps", ["potato chips", "crisps"]), ("beetroot", ["beet"])]
    return [{"q": a, "expect_any": b} for a, b in q]


def main(outdir: str | None = None) -> Path:
    out = Path(outdir) if outdir else HERE
    out.mkdir(parents=True, exist_ok=True)
    build_workbook(out / "synthetic.xlsx")
    (out / "sources_synthetic.json").write_text(json.dumps(build_config(), indent=1, ensure_ascii=False), encoding="utf-8")
    (out / "search_queries_synthetic.json").write_text(json.dumps(build_queries(), indent=0), encoding="utf-8")
    return out / "synthetic.xlsx"


if __name__ == "__main__":
    p = main(sys.argv[1] if len(sys.argv) > 1 else None)
    print(f"wrote {p}")
