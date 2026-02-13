export type PriceTier = "$" | "$$" | "$$$" | "$$$$";

export type DietarySupport = {
  vegan?: boolean;
  vegetarian?: boolean;
  glutenFree?: boolean;
  dairyFree?: boolean;
  halal?: boolean;
  kosher?: boolean;
  nutFree?: boolean;
};

export type NutritionKey =
  | "calories"
  | "proteinG"
  | "carbsG"
  | "fatG"
  | "fiberG"
  | "sugarG"
  | "sodiumMg";

export type NumericRange = {
  min?: number;
  max?: number;
};

export type NutritionRange = {
  min: number;
  max: number;
  avg: number;
};

export type RestaurantRating = {
  average: number;
  count: number;
  source?: string;
};

export type MenuItemSnapshot = {
  id: string;
  name: string;
  category?: string;
  priceUSD?: number;
  tags: string[];
  allergens: string[];
  nutrition: Partial<Record<NutritionKey, number>>;
};

export type SearchDocument = {
  id: string;
  name: string;
  description?: string;
  cuisine: string[];
  priceTier?: PriceTier;
  location: {
    address: string;
    city: string;
    state: string;
    postalCode: string;
    lat: number;
    lng: number;
  };
  hours: Array<{
    day: "mon" | "tue" | "wed" | "thu" | "fri" | "sat" | "sun";
    open: string;
    close: string;
  }>;
  menuItems: MenuItemSnapshot[];
  menuItemNames: string[];
  facets: {
    cuisines: string[];
    categories: string[];
    tags: string[];
    allergens: string[];
    dietarySupport: Record<keyof DietarySupport, boolean>;
  };
  menuPriceRangeUSD?: {
    min: number;
    max: number;
    avg: number;
  };
  nutritionStats: Partial<Record<NutritionKey, NutritionRange>>;
  rating?: RestaurantRating;
};

export type TokenPosting = {
  id: string;
  weight: number;
};

export type SearchFacetIndex = {
  byPriceTier: Partial<Record<PriceTier, string[]>>;
  byCuisine: Record<string, string[]>;
  byCategory: Record<string, string[]>;
  byTag: Record<string, string[]>;
  byAllergen: Record<string, string[]>;
  byDietarySupport: Record<keyof DietarySupport, string[]>;
};

export type SearchIndex = {
  version: number;
  generatedAtISO: string;
  documents: Record<string, SearchDocument>;
  tokenIndex: Record<string, TokenPosting[]>;
  facetIndex: SearchFacetIndex;
};

export type SearchFilters = {
  priceTiers?: PriceTier[];
  cuisines?: string[];
  categories?: string[];
  requiredTags?: string[];
  excludedTags?: string[];
  excludedAllergens?: string[];
  requiredDietarySupport?: Array<keyof DietarySupport>;
  nutrition?: Partial<Record<NutritionKey, NumericRange>>;
  minPriceUSD?: number;
  maxPriceUSD?: number;
  minRating?: number;
  maxRating?: number;
  minRatingCount?: number;
  origin?: {
    lat: number;
    lng: number;
  };
  minDistanceKm?: number;
  maxDistanceKm?: number;
  openAtISO?: string;
};

export type RankingWeights = {
  text: number;
  distance: number;
  price: number;
  nutrition: number;
  preference: number;
  rating: number;
};

export type PreferenceBoosts = {
  cuisineBoosts?: Record<string, number>;
  tagBoosts?: Record<string, number>;
  restaurantBoosts?: Record<string, number>;
};

export type SearchOptions = {
  limit?: number;
  minScore?: number;
  requireAllTokens?: boolean;
  filters?: SearchFilters;
  sort?:
    | "relevance"
    | "distance"
    | "priceLowToHigh"
    | "priceHighToLow"
    | "ratingHighToLow"
    | "name";
  rankingWeights?: Partial<RankingWeights>;
  nutritionTarget?: Partial<Record<NutritionKey, number>>;
  targetPriceUSD?: number;
  preferenceBoosts?: PreferenceBoosts;
};

export type SearchScoreBreakdown = {
  total: number;
  text: number;
  distance: number;
  price: number;
  nutrition: number;
  preference: number;
  rating: number;
  distanceKm?: number;
};

export type SearchResult = {
  id: string;
  score: number;
  document: SearchDocument;
  matchedTokens: string[];
  breakdown: SearchScoreBreakdown;
};

export type IndexMeta = {
  version: number;
  generatedAtISO: string;
  documentCount: number;
  tokenCount: number;
  facetCounts: {
    cuisines: number;
    categories: number;
    tags: number;
    allergens: number;
  };
};

export type IndexFilePaths = {
  documentsPath: string;
  tokenIndexPath: string;
  facetIndexPath: string;
  metaPath: string;
};
