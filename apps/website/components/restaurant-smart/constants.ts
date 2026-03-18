import type { DietaryKey, NormalizedDay, UserLocation } from "./types";

export const dayLookup: Record<string, NormalizedDay> = {
  monday: "mon",
  tuesday: "tue",
  wednesday: "wed",
  thursday: "thu",
  friday: "fri",
  saturday: "sat",
  sunday: "sun",
};

export const EXCLUDED_CUISINES = new Set(["vegan", "vegetarian"]);

export const VEGAN_KEYWORDS = ["vegan", "falafel", "veggie", "vegetable", "plant", "tofu", "salad"];
export const VEGETARIAN_KEYWORDS = ["vegetarian", "veggie", "cheese", "egg", "falafel", "salad"];
export const GLUTEN_FREE_KEYWORDS = ["gluten free", "gluten-free", "gf", "salad", "bowl"];

export const allDietary: DietaryKey[] = [
  "vegan",
  "vegetarian",
  "glutenFree",
  "halal",
  "kosher",
  "dairyFree",
  "nutFree",
];

export const dietaryLabels: Record<DietaryKey, string> = {
  vegan: "Vegan",
  vegetarian: "Vegetarian",
  glutenFree: "Gluten-Free",
  halal: "Halal",
  kosher: "Kosher",
  dairyFree: "Dairy-Free",
  nutFree: "Nut-Free",
};

export const DEFAULT_LOCATION: UserLocation = {
  lat: 33.64995,
  lng: -117.83895,
  label: "Campus default",
  source: "default",
};

export const KM_PER_MILE = 1.60934;
export const METERS_PER_MILE = 1609.34;
export const DEFAULT_MAX_DISTANCE_MILES = 5;
