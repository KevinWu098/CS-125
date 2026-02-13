export { buildSearchIndex } from "./search/index-builder";
export { buildIndexMeta, getIndexFilePaths, writeSearchIndexFiles } from "./search/index-files";
export { normalizeText } from "./search/normalize";
export { search } from "./search/search";
export { tokenize } from "./search/tokenize";
export type {
  DietarySupport,
  IndexFilePaths,
  IndexMeta,
  MenuItemSnapshot,
  NumericRange,
  NutritionKey,
  NutritionRange,
  PreferenceBoosts,
  PriceTier,
  RankingWeights,
  RestaurantRating,
  SearchDocument,
  SearchFacetIndex,
  SearchFilters,
  SearchIndex,
  SearchOptions,
  SearchResult,
  SearchScoreBreakdown,
  TokenPosting,
} from "./search/types";
export { SEARCH_FIELD_WEIGHTS } from "./search/weights";
