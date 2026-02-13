import { normalizeText } from "./normalize";
import { tokenize } from "./tokenize";
import type {
  NutritionKey,
  RankingWeights,
  SearchDocument,
  SearchFilters,
  SearchIndex,
  SearchOptions,
  SearchResult,
} from "./types";

const DEFAULT_LIMIT = 20;
const DEFAULT_WEIGHTS: RankingWeights = {
  text: 1,
  distance: 0.2,
  price: 0.15,
  nutrition: 0.25,
  preference: 0.15,
  rating: 0.1,
};

const NUTRITION_KEYS: NutritionKey[] = [
  "calories",
  "proteinG",
  "carbsG",
  "fatG",
  "fiberG",
  "sugarG",
  "sodiumMg",
];

type SearchScore = {
  textScore: number;
  matchedTokens: Set<string>;
};

export const search = (
  index: SearchIndex,
  query: string,
  options: SearchOptions = {},
): SearchResult[] => {
  const tokens = tokenize(query);
  const minScore = options.minScore ?? 0;
  const limit = options.limit ?? DEFAULT_LIMIT;
  const weights = { ...DEFAULT_WEIGHTS, ...options.rankingWeights };

  const scores = seedCandidateScores(index, tokens);
  const results: SearchResult[] = [];

  for (const [id, scoreData] of scores) {
    const document = index.documents[id];
    // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
    if (!document) {
      continue;
    }

    if (
      options.requireAllTokens &&
      tokens.length > 0 &&
      scoreData.matchedTokens.size < tokens.length
    ) {
      continue;
    }

    const distanceKm = resolveDistanceKm(document, options);
    if (!matchesFilters(document, options, distanceKm)) {
      continue;
    }

    const textScore = tokens.length === 0 ? 0 : scoreData.textScore;
    const distanceScore = computeDistanceScore(distanceKm);
    const priceScore = computePriceScore(document, options.targetPriceUSD);
    const nutritionScore = computeNutritionScore(document, options.nutritionTarget);
    const preferenceScore = computePreferenceScore(document, options);
    const ratingScore = computeRatingScore(document);

    const total =
      textScore * weights.text +
      distanceScore * weights.distance +
      priceScore * weights.price +
      nutritionScore * weights.nutrition +
      preferenceScore * weights.preference +
      ratingScore * weights.rating;

    if (total < minScore) {
      continue;
    }

    results.push({
      id,
      score: total,
      document,
      matchedTokens: Array.from(scoreData.matchedTokens),
      breakdown: {
        total,
        text: textScore,
        distance: distanceScore,
        price: priceScore,
        nutrition: nutritionScore,
        preference: preferenceScore,
        rating: ratingScore,
        distanceKm,
      },
    });
  }

  return sortResults(results, options.sort).slice(0, limit);
};

const seedCandidateScores = (index: SearchIndex, tokens: string[]): Map<string, SearchScore> => {
  const scores = new Map<string, SearchScore>();

  if (tokens.length === 0) {
    for (const id of Object.keys(index.documents)) {
      scores.set(id, { textScore: 0, matchedTokens: new Set<string>() });
    }

    return scores;
  }

  for (const token of tokens) {
    const postings = index.tokenIndex[token];
    // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
    if (!postings) {
      continue;
    }

    for (const posting of postings) {
      const current = scores.get(posting.id) ?? { textScore: 0, matchedTokens: new Set<string>() };
      current.textScore += posting.weight;
      current.matchedTokens.add(token);
      scores.set(posting.id, current);
    }
  }

  return scores;
};

const matchesFilters = (
  document: SearchDocument,
  options: SearchOptions,
  distanceKm: number | undefined,
): boolean => {
  const filters = options.filters;
  if (!filters) {
    return true;
  }

  const cuisines = normalizeFilterValues(filters.cuisines);
  if (cuisines.length > 0 && !hasAny(document.facets.cuisines, cuisines)) {
    return false;
  }

  if (filters.priceTiers && filters.priceTiers.length > 0) {
    if (!document.priceTier || !filters.priceTiers.includes(document.priceTier)) {
      return false;
    }
  }

  const categories = normalizeFilterValues(filters.categories);
  if (categories.length > 0 && !hasAny(document.facets.categories, categories)) {
    return false;
  }

  const requiredTags = normalizeFilterValues(filters.requiredTags);
  if (requiredTags.length > 0 && !hasAll(document.facets.tags, requiredTags)) {
    return false;
  }

  const excludedTags = normalizeFilterValues(filters.excludedTags);
  if (excludedTags.length > 0 && hasAny(document.facets.tags, excludedTags)) {
    return false;
  }

  const excludedAllergens = normalizeFilterValues(filters.excludedAllergens);
  if (excludedAllergens.length > 0 && hasAny(document.facets.allergens, excludedAllergens)) {
    return false;
  }

  if (filters.requiredDietarySupport && filters.requiredDietarySupport.length > 0) {
    for (const key of filters.requiredDietarySupport) {
      if (!document.facets.dietarySupport[key]) {
        return false;
      }
    }
  }

  if (!matchesNutritionRanges(document, filters.nutrition)) {
    return false;
  }

  if (!matchesPriceRange(document, filters.minPriceUSD, filters.maxPriceUSD)) {
    return false;
  }

  if (!matchesRating(document, filters.minRating, filters.maxRating, filters.minRatingCount)) {
    return false;
  }

  if (!matchesDistance(distanceKm, filters.minDistanceKm, filters.maxDistanceKm)) {
    return false;
  }

  if (filters.openAtISO && !isOpenAt(document, filters.openAtISO)) {
    return false;
  }

  return true;
};

const matchesNutritionRanges = (
  document: SearchDocument,
  ranges: SearchFilters["nutrition"] | undefined,
): boolean => {
  if (!ranges) {
    return true;
  }

  for (const key of NUTRITION_KEYS) {
    const range = ranges[key];
    if (!range) {
      continue;
    }

    const stats = document.nutritionStats[key];
    if (!stats) {
      return false;
    }

    if (range.min !== undefined && stats.max < range.min) {
      return false;
    }

    if (range.max !== undefined && stats.min > range.max) {
      return false;
    }
  }

  return true;
};

const matchesPriceRange = (
  document: SearchDocument,
  minPriceUSD: number | undefined,
  maxPriceUSD: number | undefined,
): boolean => {
  if (minPriceUSD === undefined && maxPriceUSD === undefined) {
    return true;
  }

  const range = document.menuPriceRangeUSD;
  if (!range) {
    return false;
  }

  if (minPriceUSD !== undefined && range.max < minPriceUSD) {
    return false;
  }

  if (maxPriceUSD !== undefined && range.min > maxPriceUSD) {
    return false;
  }

  return true;
};

const matchesRating = (
  document: SearchDocument,
  minRating: number | undefined,
  maxRating: number | undefined,
  minRatingCount: number | undefined,
): boolean => {
  if (minRating === undefined && maxRating === undefined && minRatingCount === undefined) {
    return true;
  }

  const rating = document.rating;
  if (!rating) {
    return false;
  }

  if (minRating !== undefined && rating.average < minRating) {
    return false;
  }

  if (maxRating !== undefined && rating.average > maxRating) {
    return false;
  }

  if (minRatingCount !== undefined && rating.count < minRatingCount) {
    return false;
  }

  return true;
};

const matchesDistance = (
  distanceKm: number | undefined,
  minDistanceKm: number | undefined,
  maxDistanceKm: number | undefined,
): boolean => {
  if (minDistanceKm === undefined && maxDistanceKm === undefined) {
    return true;
  }

  if (distanceKm === undefined) {
    return false;
  }

  if (minDistanceKm !== undefined && distanceKm < minDistanceKm) {
    return false;
  }

  if (maxDistanceKm !== undefined && distanceKm > maxDistanceKm) {
    return false;
  }

  return true;
};

const isOpenAt = (document: SearchDocument, openAtISO: string): boolean => {
  if (document.hours.length === 0) {
    return false;
  }

  const when = new Date(openAtISO);
  if (Number.isNaN(when.getTime())) {
    return false;
  }

  const dayKey = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"][when.getDay()];
  const minutes = when.getHours() * 60 + when.getMinutes();

  for (const slot of document.hours) {
    if (slot.day !== dayKey) {
      continue;
    }

    const open = parseTimeToMinutes(slot.open);
    const close = parseTimeToMinutes(slot.close);
    if (open === undefined || close === undefined) {
      continue;
    }

    if (open <= close && minutes >= open && minutes <= close) {
      return true;
    }

    if (open > close && (minutes >= open || minutes <= close)) {
      return true;
    }
  }

  return false;
};

const parseTimeToMinutes = (value: string): number | undefined => {
  const parts = value.split(":");
  if (parts.length !== 2) {
    return undefined;
  }

  const hours = Number.parseInt(parts[0] ?? "", 10);
  const minutes = Number.parseInt(parts[1] ?? "", 10);

  if (
    Number.isNaN(hours) ||
    Number.isNaN(minutes) ||
    hours < 0 ||
    hours > 23 ||
    minutes < 0 ||
    minutes > 59
  ) {
    return undefined;
  }

  return hours * 60 + minutes;
};

const resolveDistanceKm = (
  document: SearchDocument,
  options: SearchOptions,
): number | undefined => {
  const origin = options.filters?.origin;
  if (!origin) {
    return undefined;
  }

  return haversineKm(origin.lat, origin.lng, document.location.lat, document.location.lng);
};

const haversineKm = (lat1: number, lon1: number, lat2: number, lon2: number): number => {
  const toRad = (value: number) => (value * Math.PI) / 180;
  const earthRadiusKm = 6371;

  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const startLat = toRad(lat1);
  const endLat = toRad(lat2);

  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(startLat) * Math.cos(endLat) * Math.sin(dLon / 2) * Math.sin(dLon / 2);

  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return earthRadiusKm * c;
};

const computeDistanceScore = (distanceKm: number | undefined): number => {
  if (distanceKm === undefined) {
    return 0;
  }

  return 1 / (1 + distanceKm);
};

const computePriceScore = (
  document: SearchDocument,
  targetPriceUSD: number | undefined,
): number => {
  const range = document.menuPriceRangeUSD;
  if (!range) {
    return 0;
  }

  if (targetPriceUSD === undefined) {
    return 1 / (1 + range.avg / 30);
  }

  const diff = Math.abs(range.avg - targetPriceUSD);
  return 1 / (1 + diff / Math.max(targetPriceUSD, 1));
};

const computeNutritionScore = (
  document: SearchDocument,
  target: SearchOptions["nutritionTarget"],
): number => {
  if (!target) {
    return 0;
  }

  const perKeyScores: number[] = [];

  for (const key of NUTRITION_KEYS) {
    const desired = target[key];
    if (desired === undefined) {
      continue;
    }

    const stats = document.nutritionStats[key];
    if (!stats || desired === 0) {
      perKeyScores.push(0);
      continue;
    }

    const diff = Math.abs(stats.avg - desired);
    perKeyScores.push(1 / (1 + diff / Math.abs(desired)));
  }

  if (perKeyScores.length === 0) {
    return 0;
  }

  const sum = perKeyScores.reduce((total, score) => total + score, 0);
  return sum / perKeyScores.length;
};

const computePreferenceScore = (document: SearchDocument, options: SearchOptions): number => {
  const boosts = options.preferenceBoosts;
  if (!boosts) {
    return 0;
  }

  let total = 0;

  if (boosts.restaurantBoosts) {
    total += boosts.restaurantBoosts[document.id] ?? 0;
  }

  if (boosts.cuisineBoosts) {
    for (const cuisine of document.facets.cuisines) {
      total += boosts.cuisineBoosts[cuisine] ?? 0;
    }
  }

  if (boosts.tagBoosts) {
    for (const tag of document.facets.tags) {
      total += boosts.tagBoosts[tag] ?? 0;
    }
  }

  return total;
};

const computeRatingScore = (document: SearchDocument): number => {
  const rating = document.rating;
  if (!rating) {
    return 0;
  }

  const normalizedAverage = Math.max(0, Math.min(1, rating.average / 5));
  const confidence = rating.count / (rating.count + 25);
  return normalizedAverage * confidence;
};

const sortResults = (
  results: SearchResult[],
  sort: SearchOptions["sort"] | undefined,
): SearchResult[] => {
  const strategy = sort ?? "relevance";

  if (strategy === "distance") {
    return results.sort(
      (left, right) =>
        (left.breakdown.distanceKm ?? Number.POSITIVE_INFINITY) -
          (right.breakdown.distanceKm ?? Number.POSITIVE_INFINITY) ||
        right.score - left.score ||
        left.document.name.localeCompare(right.document.name),
    );
  }

  if (strategy === "priceLowToHigh") {
    return results.sort(
      (left, right) =>
        (left.document.menuPriceRangeUSD?.avg ?? Number.POSITIVE_INFINITY) -
          (right.document.menuPriceRangeUSD?.avg ?? Number.POSITIVE_INFINITY) ||
        right.score - left.score ||
        left.document.name.localeCompare(right.document.name),
    );
  }

  if (strategy === "priceHighToLow") {
    return results.sort(
      (left, right) =>
        (right.document.menuPriceRangeUSD?.avg ?? Number.NEGATIVE_INFINITY) -
          (left.document.menuPriceRangeUSD?.avg ?? Number.NEGATIVE_INFINITY) ||
        right.score - left.score ||
        left.document.name.localeCompare(right.document.name),
    );
  }

  if (strategy === "name") {
    return results.sort((left, right) => left.document.name.localeCompare(right.document.name));
  }

  if (strategy === "ratingHighToLow") {
    return results.sort(
      (left, right) =>
        (right.document.rating?.average ?? Number.NEGATIVE_INFINITY) -
          (left.document.rating?.average ?? Number.NEGATIVE_INFINITY) ||
        (right.document.rating?.count ?? Number.NEGATIVE_INFINITY) -
          (left.document.rating?.count ?? Number.NEGATIVE_INFINITY) ||
        right.score - left.score ||
        left.document.name.localeCompare(right.document.name),
    );
  }

  return results.sort(
    (left, right) =>
      right.score - left.score || left.document.name.localeCompare(right.document.name),
  );
};

const normalizeFilterValues = (values: string[] | undefined): string[] => {
  if (!values || values.length === 0) {
    return [];
  }

  const seen = new Set<string>();
  const output: string[] = [];

  for (const value of values) {
    const normalized = normalizeText(value);
    if (!normalized || seen.has(normalized)) {
      continue;
    }

    seen.add(normalized);
    output.push(normalized);
  }

  return output;
};

const hasAny = (haystack: string[], needles: string[]): boolean => {
  const source = new Set(haystack);
  for (const needle of needles) {
    if (source.has(needle)) {
      return true;
    }
  }

  return false;
};

const hasAll = (haystack: string[], needles: string[]): boolean => {
  const source = new Set(haystack);
  for (const needle of needles) {
    if (!source.has(needle)) {
      return false;
    }
  }

  return true;
};
