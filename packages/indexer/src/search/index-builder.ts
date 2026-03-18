import type { RestaurantSchema } from "@packages/types";

import { normalizeText } from "./normalize";
import { tokenize } from "./tokenize";
import type {
  DietarySupport,
  NutritionKey,
  SearchDocument,
  SearchFacetIndex,
  SearchIndex,
  TokenPosting,
} from "./types";
import { SEARCH_FIELD_WEIGHTS } from "./weights";

const INDEX_VERSION = 2;
const DIETARY_KEYS: Array<keyof DietarySupport> = [
  "vegan",
  "vegetarian",
  "glutenFree",
  "dairyFree",
  "halal",
  "kosher",
  "nutFree",
];
const NUTRITION_KEYS: NutritionKey[] = [
  "calories",
  "proteinG",
  "carbsG",
  "fatG",
  "fiberG",
  "sugarG",
  "sodiumMg",
];

export const buildSearchIndex = (restaurants: RestaurantSchema[]): SearchIndex => {
  const documents: Record<string, SearchDocument> = {};
  const tokenIndex: Record<string, TokenPosting[]> = {};
  const facetIndex = createEmptyFacetIndex();

  for (const restaurant of restaurants) {
    if (!hasValidLocation(restaurant.location)) {
      continue;
    }

    const document = buildSearchDocument(restaurant);
    documents[document.id] = document;

    addTokens(tokenIndex, document.id, tokenize(document.name), SEARCH_FIELD_WEIGHTS.name);

    if (document.description) {
      addTokens(
        tokenIndex,
        document.id,
        tokenize(document.description),
        SEARCH_FIELD_WEIGHTS.description,
      );
    }

    addTokens(
      tokenIndex,
      document.id,
      tokenize(document.cuisine.join(" ")),
      SEARCH_FIELD_WEIGHTS.cuisine,
    );

    addTokens(
      tokenIndex,
      document.id,
      tokenize(document.menuItemNames.join(" ")),
      SEARCH_FIELD_WEIGHTS.menuItem,
    );

    addTokens(
      tokenIndex,
      document.id,
      tokenize([document.location.address, document.location.postalCode].join(" ")),
      SEARCH_FIELD_WEIGHTS.location,
    );

    addTokens(
      tokenIndex,
      document.id,
      tokenize(document.facets.categories.join(" ")),
      SEARCH_FIELD_WEIGHTS.category,
    );

    addTokens(
      tokenIndex,
      document.id,
      tokenize(document.facets.tags.join(" ")),
      SEARCH_FIELD_WEIGHTS.tag,
    );

    addTokens(
      tokenIndex,
      document.id,
      tokenize(document.facets.allergens.join(" ")),
      SEARCH_FIELD_WEIGHTS.allergen,
    );

    indexFacets(facetIndex, document);
  }

  return {
    version: INDEX_VERSION,
    generatedAtISO: new Date().toISOString(),
    documents,
    tokenIndex,
    facetIndex,
  };
};

const hasValidLocation = (location: RestaurantSchema["location"]): boolean => {
  const { lat, lng } = location;
  const inRange = Math.abs(lat) <= 90 && Math.abs(lng) <= 180;
  const notZeroOrigin = Math.abs(lat) > 1e-9 || Math.abs(lng) > 1e-9;
  return Number.isFinite(lat) && Number.isFinite(lng) && inRange && notZeroOrigin;
};

const buildSearchDocument = (restaurant: RestaurantSchema): SearchDocument => {
  const menuItems = restaurant.menu.map((item) => ({
    id: item.id,
    name: item.name,
    category: item.category,
    priceUSD: item.priceUSD,
    tags: normalizeValues(item.tags),
    allergens: normalizeValues(item.allergens),
    nutrition: {
      calories: item.nutrition?.calories,
      proteinG: item.nutrition?.proteinG,
      carbsG: item.nutrition?.carbsG,
      fatG: item.nutrition?.fatG,
      fiberG: item.nutrition?.fiberG,
      sugarG: item.nutrition?.sugarG,
      sodiumMg: item.nutrition?.sodiumMg,
    },
  }));

  return {
    id: restaurant.id,
    name: restaurant.name,
    description: restaurant.description,
    cuisine: restaurant.cuisine,
    priceTier: restaurant.priceTier,
    location: {
      address: restaurant.location.address,
      city: restaurant.location.city,
      state: restaurant.location.state,
      postalCode: restaurant.location.postalCode,
      lat: restaurant.location.lat,
      lng: restaurant.location.lng,
    },
    hours: restaurant.hours ?? [],
    menuItems,
    menuItemNames: menuItems.map((item) => item.name),
    facets: {
      cuisines: normalizeValues(restaurant.cuisine),
      categories: normalizeValues(menuItems.map((item) => item.category).filter(isDefined)),
      tags: normalizeValues(menuItems.flatMap((item) => item.tags)),
      allergens: normalizeValues(menuItems.flatMap((item) => item.allergens)),
      dietarySupport: buildDietarySupport(restaurant),
    },
    menuPriceRangeUSD: buildPriceRange(menuItems.map((item) => item.priceUSD)),
    nutritionStats: buildNutritionStats(menuItems),
    rating: restaurant.rating,
  };
};

const buildDietarySupport = (
  restaurant: RestaurantSchema,
): Record<keyof DietarySupport, boolean> => {
  const source = restaurant.dietarySupport ?? {};

  return {
    vegan: source.vegan ?? false,
    vegetarian: source.vegetarian ?? false,
    glutenFree: source.glutenFree ?? false,
    dairyFree: source.dairyFree ?? false,
    halal: source.halal ?? false,
    kosher: source.kosher ?? false,
    nutFree: source.nutFree ?? false,
  };
};

const buildPriceRange = (values: Array<number | undefined>) => {
  const prices = values.filter(isDefined);
  if (prices.length === 0) {
    return undefined;
  }

  const min = Math.min(...prices);
  const max = Math.max(...prices);
  const sum = prices.reduce((total, current) => total + current, 0);

  return {
    min,
    max,
    avg: sum / prices.length,
  };
};

const buildNutritionStats = (
  menuItems: SearchDocument["menuItems"],
): SearchDocument["nutritionStats"] => {
  const stats: SearchDocument["nutritionStats"] = {};

  for (const key of NUTRITION_KEYS) {
    const values = menuItems
      .map((item) => item.nutrition[key])
      .filter((value): value is number => typeof value === "number");

    if (values.length === 0) {
      continue;
    }

    const min = Math.min(...values);
    const max = Math.max(...values);
    const sum = values.reduce((total, current) => total + current, 0);
    stats[key] = {
      min,
      max,
      avg: sum / values.length,
    };
  }

  return stats;
};

const indexFacets = (facetIndex: SearchFacetIndex, document: SearchDocument): void => {
  for (const cuisine of document.facets.cuisines) {
    addFacetValue(facetIndex.byCuisine, cuisine, document.id);
  }

  if (document.priceTier) {
    const list =
      facetIndex.byPriceTier[document.priceTier] ??
      (facetIndex.byPriceTier[document.priceTier] = []);
    if (!list.includes(document.id)) {
      list.push(document.id);
    }
  }

  for (const category of document.facets.categories) {
    addFacetValue(facetIndex.byCategory, category, document.id);
  }

  for (const tag of document.facets.tags) {
    addFacetValue(facetIndex.byTag, tag, document.id);
  }

  for (const allergen of document.facets.allergens) {
    addFacetValue(facetIndex.byAllergen, allergen, document.id);
  }

  for (const key of DIETARY_KEYS) {
    if (document.facets.dietarySupport[key]) {
      addFacetValue(facetIndex.byDietarySupport, key, document.id);
    }
  }
};

const createEmptyFacetIndex = (): SearchFacetIndex => ({
  byPriceTier: {},
  byCuisine: {},
  byCategory: {},
  byTag: {},
  byAllergen: {},
  byDietarySupport: {
    vegan: [],
    vegetarian: [],
    glutenFree: [],
    dairyFree: [],
    halal: [],
    kosher: [],
    nutFree: [],
  },
});

const addFacetValue = (index: Record<string, string[]>, key: string, documentId: string): void => {
  if (!key) {
    return;
  }

  const list = index[key] ?? (index[key] = []);
  if (!list.includes(documentId)) {
    list.push(documentId);
  }
};

const addTokens = (
  tokenIndex: Record<string, TokenPosting[]>,
  documentId: string,
  tokens: string[],
  weight: number,
): void => {
  for (const token of tokens) {
    if (!token) {
      continue;
    }

    const postings = tokenIndex[token] ?? (tokenIndex[token] = []);
    const existing = postings.find((posting) => posting.id === documentId);

    if (existing) {
      existing.weight += weight;
      continue;
    }

    postings.push({ id: documentId, weight });
  }
};

const normalizeValues = (values: string[] | undefined): string[] => {
  if (!values || values.length === 0) {
    return [];
  }

  const seen = new Set<string>();
  const result: string[] = [];

  for (const value of values) {
    const normalized = normalizeSingle(value);
    if (!normalized || seen.has(normalized)) {
      continue;
    }

    seen.add(normalized);
    result.push(normalized);
  }

  return result;
};

const normalizeSingle = (value: string): string => normalizeText(value);

const isDefined = <T>(value: T | undefined): value is T => value !== undefined;
