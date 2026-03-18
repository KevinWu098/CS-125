import { NextResponse } from "next/server";
import { z } from "zod";

import {
  DEFAULT_LOCATION,
  DEFAULT_MAX_DISTANCE_MILES,
  DEFAULT_NUTRITION_GOALS,
} from "@/components/restaurant-smart/constants";
import { DEFAULT_MAX_MEAL_PRICE } from "@/components/restaurant-smart/data";
import { rankRestaurants } from "@/components/restaurant-smart/ranking";
import type { UserRecord } from "@/components/restaurant-smart/types";
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
  maxDistanceMiles: z.number().min(1).max(30).default(DEFAULT_MAX_DISTANCE_MILES),
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

    const results = rankRestaurants({
      searchQuery: parsed.data.searchQuery,
      mealSearchQuery: parsed.data.mealSearchQuery,
      selectedCuisines: parsed.data.selectedCuisines,
      selectedMealCategories: parsed.data.selectedMealCategories,
      selectedDietary: parsed.data.selectedDietary,
      priceRange: normalizedPriceRange,
      minRating: parsed.data.minRating,
      maxDistanceMiles: parsed.data.maxDistanceMiles,
      maxMealPrice: parsed.data.maxMealPrice,
      sortBy: parsed.data.sortBy,
      userLocation: parsed.data.userLocation,
      profile,
    });

    return NextResponse.json({
      results,
      meta: {
        count: results.length,
        generatedAtISO: new Date().toISOString(),
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
