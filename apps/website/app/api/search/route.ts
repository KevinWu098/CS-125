import { promises as fs } from "node:fs";
import path from "node:path";

import {
  type PriceTier,
  readSearchIndexFiles,
  search as searchIndex,
  type SearchIndex,
  type SearchOptions,
} from "@packages/indexer";
import { NextResponse } from "next/server";
import { z } from "zod";

import {
  DEFAULT_LOCATION,
  DEFAULT_MAX_DISTANCE_MILES,
  DEFAULT_NUTRITION_GOALS,
  KM_PER_MILE,
} from "@/components/restaurant-smart/constants";
import { DEFAULT_MAX_MEAL_PRICE } from "@/components/restaurant-smart/data";
import { rankRestaurants } from "@/components/restaurant-smart/ranking";
import type { SortKey, UserRecord } from "@/components/restaurant-smart/types";
import { normalizeProfileRecord } from "@/components/restaurant-smart/utils";

export const runtime = "nodejs";

const dietaryValues = [
  "vegan",
  "vegetarian",
  "glutenFree",
  "halal",
  "kosher",
  "dairyFree",
  "nutFree",
] as const;

const sortValues = ["recommended", "distance", "rating", "price", "name"] as const;
const ALL_PRICE_TIERS: PriceTier[] = ["$", "$$", "$$$", "$$$$"];

const INDEX_DIR_CANDIDATES = [
  path.resolve(process.cwd(), "packages/indexer/index"),
  path.resolve(process.cwd(), "../packages/indexer/index"),
  path.resolve(process.cwd(), "../../packages/indexer/index"),
];

let cachedIndex: SearchIndex | null = null;
let cachedIndexDir: string | null = null;
let cachedMetaMtimeMs: number | null = null;

const nutritionGoalSchema = z.object({
  calories: z.number().int().min(800).max(6000),
  proteinG: z.number().int().min(20).max(600),
  carbsG: z.number().int().min(20).max(900),
  fatG: z.number().int().min(10).max(300),
});

const profileSchema: z.ZodType<UserRecord> = z.object({
  userId: z.string().min(1),
  createdAtISO: z.string().default(""),
  lastLoginAtISO: z.string().default(""),
  loginCount: z.number().int().min(1).default(1),
  ratings: z.record(z.string(), z.number().int().min(1).max(5)).default({}),
  mealRatings: z.record(z.string(), z.number().int().min(1).max(5)).default({}),
  dietaryRestrictions: z.array(z.enum(dietaryValues)).default([]),
  nutritionGoals: nutritionGoalSchema.default(DEFAULT_NUTRITION_GOALS),
  mealHistory: z
    .array(
      z.object({
        id: z.string(),
        restaurantId: z.string(),
        restaurantName: z.string(),
        mealId: z.string(),
        mealName: z.string(),
        loggedAtISO: z.string(),
        nutrition: z.object({
          calories: z.number().min(0),
          proteinG: z.number().min(0),
          carbsG: z.number().min(0),
          fatG: z.number().min(0),
        }),
        nutritionEstimated: z.boolean(),
      }),
    )
    .default([]),
});

const requestSchema = z.object({
  searchQuery: z.string().default(""),
  mealSearchQuery: z.string().default(""),
  selectedCuisines: z.array(z.string().trim().min(1)).default([]),
  selectedMealCategories: z.array(z.string().trim().min(1)).default([]),
  selectedDietary: z.array(z.enum(dietaryValues)).default([]),
  priceRange: z.tuple([z.number().min(1).max(4), z.number().min(1).max(4)]).default([1, 4]),
  minRating: z.number().min(0).max(5).default(0),
  maxDistanceMiles: z.number().min(0).max(30).default(DEFAULT_MAX_DISTANCE_MILES),
  maxMealPrice: z
    .number()
    .min(1)
    .max(Math.max(DEFAULT_MAX_MEAL_PRICE, 200))
    .default(DEFAULT_MAX_MEAL_PRICE),
  sortBy: z.enum(sortValues).default("recommended"),
  userLocation: z
    .object({
      lat: z.number().min(-90).max(90),
      lng: z.number().min(-180).max(180),
      label: z.string().min(1).max(120).default(DEFAULT_LOCATION.label),
      source: z.enum(["manual", "browser", "default"]).default(DEFAULT_LOCATION.source),
    })
    .default(DEFAULT_LOCATION),
  profile: profileSchema.nullable().default(null),
});

async function resolveIndexDirectory(): Promise<string> {
  for (const candidate of INDEX_DIR_CANDIDATES) {
    try {
      await fs.access(path.join(candidate, "index-meta.json"));
      await fs.access(path.join(candidate, "documents.json"));
      await fs.access(path.join(candidate, "token-index.json"));
      await fs.access(path.join(candidate, "facet-index.json"));
      return candidate;
    } catch {
      continue;
    }
  }

  throw new Error(
    "Search index files not found. Run `pnpm --dir packages/indexer run create-index` first.",
  );
}

async function getSearchIndex(): Promise<SearchIndex> {
  const indexDir = await resolveIndexDirectory();
  const metaPath = path.join(indexDir, "index-meta.json");
  const metaStat = await fs.stat(metaPath);

  if (
    cachedIndex &&
    cachedIndexDir === indexDir &&
    cachedMetaMtimeMs !== null &&
    cachedMetaMtimeMs === metaStat.mtimeMs
  ) {
    return cachedIndex;
  }

  const loaded = await readSearchIndexFiles(indexDir);
  cachedIndex = loaded;
  cachedIndexDir = indexDir;
  cachedMetaMtimeMs = metaStat.mtimeMs;
  return loaded;
}

function hasValidCoordinates(lat: number, lng: number): boolean {
  const inRange = Math.abs(lat) <= 90 && Math.abs(lng) <= 180;
  const notZeroOrigin = Math.abs(lat) > 1e-9 || Math.abs(lng) > 1e-9;
  return Number.isFinite(lat) && Number.isFinite(lng) && inRange && notZeroOrigin;
}

function mapSort(sortBy: SortKey): SearchOptions["sort"] {
  switch (sortBy) {
    case "recommended":
      return "relevance";
    case "distance":
      return "distance";
    case "rating":
      return "ratingHighToLow";
    case "price":
      return "priceLowToHigh";
    case "name":
      return "name";
    default:
      return "relevance";
  }
}

function mapPriceTiers(priceRange: [number, number]): PriceTier[] | undefined {
  const [left, right] = priceRange;
  const minTier = Math.max(1, Math.min(left, right));
  const maxTier = Math.min(4, Math.max(left, right));

  if (minTier === 1 && maxTier === 4) {
    return undefined;
  }

  return ALL_PRICE_TIERS.slice(minTier - 1, maxTier);
}

export async function POST(request: Request) {
  try {
    const payload = await request.json();
    const parsed = requestSchema.safeParse(payload);

    if (!parsed.success) {
      return NextResponse.json(
        {
          error: "Invalid search payload",
          issues: parsed.error.issues.map((issue) => issue.message),
        },
        { status: 400 },
      );
    }

    const [left, right] = parsed.data.priceRange;
    const normalizedPriceRange: [number, number] = [Math.min(left, right), Math.max(left, right)];

    const profile = parsed.data.profile ? normalizeProfileRecord(parsed.data.profile) : null;
    const effectiveDietary =
      parsed.data.selectedDietary.length > 0
        ? parsed.data.selectedDietary
        : profile?.dietaryRestrictions || [];

    const index = await getSearchIndex();
    const combinedQuery = `${parsed.data.searchQuery} ${parsed.data.mealSearchQuery}`.trim();

    const useDistanceFilter =
      parsed.data.maxDistanceMiles > 0 &&
      hasValidCoordinates(parsed.data.userLocation.lat, parsed.data.userLocation.lng);

    const indexResults = searchIndex(index, combinedQuery, {
      limit: Math.max(200, Object.keys(index.documents).length),
      sort: mapSort(parsed.data.sortBy),
      filters: {
        cuisines:
          parsed.data.selectedCuisines.length > 0 ? parsed.data.selectedCuisines : undefined,
        categories:
          parsed.data.selectedMealCategories.length > 0
            ? parsed.data.selectedMealCategories
            : undefined,
        requiredDietarySupport: effectiveDietary.length > 0 ? effectiveDietary : undefined,
        priceTiers: mapPriceTiers(normalizedPriceRange),
        minRating: parsed.data.minRating > 0 ? parsed.data.minRating : undefined,
        origin: useDistanceFilter
          ? {
              lat: parsed.data.userLocation.lat,
              lng: parsed.data.userLocation.lng,
            }
          : undefined,
        maxDistanceKm: useDistanceFilter ? parsed.data.maxDistanceMiles * KM_PER_MILE : undefined,
      },
    });

    const candidateRestaurantIds = indexResults
      .filter((result) =>
        hasValidCoordinates(result.document.location.lat, result.document.location.lng),
      )
      .map((result) => result.id);

    const results = rankRestaurants({
      searchQuery: parsed.data.searchQuery,
      mealSearchQuery: parsed.data.mealSearchQuery,
      selectedCuisines: parsed.data.selectedCuisines,
      selectedMealCategories: parsed.data.selectedMealCategories,
      selectedDietary: effectiveDietary,
      priceRange: normalizedPriceRange,
      minRating: parsed.data.minRating,
      maxDistanceMiles: parsed.data.maxDistanceMiles,
      maxMealPrice: parsed.data.maxMealPrice,
      sortBy: parsed.data.sortBy,
      userLocation: parsed.data.userLocation,
      profile,
      candidateRestaurantIds,
    });

    return NextResponse.json({
      results,
      meta: {
        count: results.length,
        generatedAtISO: new Date().toISOString(),
        indexCandidateCount: candidateRestaurantIds.length,
      },
    });
  } catch (error) {
    console.error("Failed to run search", error);
    return NextResponse.json(
      {
        error: "Failed to run search",
      },
      { status: 500 },
    );
  }
}
