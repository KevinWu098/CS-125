import { promises as fs } from "node:fs";
import path from "node:path";

import { NextResponse } from "next/server";
import { z } from "zod";

import { DEFAULT_NUTRITION_GOALS } from "@/components/restaurant-smart/constants";
import { restaurantsById } from "@/components/restaurant-smart/data";
import { resolveMealNutrition } from "@/components/restaurant-smart/nutrition";
import { normalizeNutritionGoals } from "@/components/restaurant-smart/utils";

export const runtime = "nodejs";

const MAX_MEAL_HISTORY_ITEMS = 200;
const dietaryValues = [
  "vegan",
  "vegetarian",
  "glutenFree",
  "halal",
  "kosher",
  "dairyFree",
  "nutFree",
] as const;

const requestSchema = z.object({
  userId: z
    .string()
    .trim()
    .min(1)
    .max(64)
    .regex(/^[a-zA-Z0-9_-]+$/, "User ID can only contain letters, numbers, _ and -"),
});

const nutritionGoalsSchema = z.object({
  calories: z.number().int().min(800).max(6000),
  proteinG: z.number().int().min(20).max(600),
  carbsG: z.number().int().min(20).max(900),
  fatG: z.number().int().min(10).max(300),
});

const mealNutritionSchema = z.object({
  calories: z.number().min(0),
  proteinG: z.number().min(0),
  carbsG: z.number().min(0),
  fatG: z.number().min(0),
});

const mealHistoryEntrySchema = z.object({
  id: z.string().min(1),
  restaurantId: z.string().min(1),
  restaurantName: z.string().min(1),
  mealId: z.string().min(1),
  mealName: z.string().min(1),
  loggedAtISO: z.string(),
  nutrition: mealNutritionSchema,
  nutritionEstimated: z.boolean(),
});

const userRecordSchema = z.object({
  userId: z.string(),
  createdAtISO: z.string(),
  lastLoginAtISO: z.string(),
  loginCount: z.number().int().min(1),
  ratings: z.record(z.string(), z.number().int().min(1).max(5)).default({}),
  mealRatings: z.record(z.string(), z.number().int().min(1).max(5)).default({}),
  dietaryRestrictions: z.array(z.enum(dietaryValues)).default([]),
  nutritionGoals: nutritionGoalsSchema.default(DEFAULT_NUTRITION_GOALS),
  mealHistory: z.array(mealHistoryEntrySchema).default([]),
});

const setRestaurantRatingSchema = requestSchema.extend({
  action: z.literal("setRestaurantRating"),
  restaurantId: z.string().trim().min(1).max(120),
  rating: z.number().int().min(1).max(5),
});

const setMealRatingSchema = requestSchema.extend({
  action: z.literal("setMealRating"),
  restaurantId: z.string().trim().min(1).max(120),
  mealId: z.string().trim().min(1).max(160),
  rating: z.number().int().min(1).max(5),
});

const setNutritionGoalsSchema = requestSchema.extend({
  action: z.literal("setNutritionGoals"),
  nutritionGoals: nutritionGoalsSchema,
});

const setDietaryRestrictionsSchema = requestSchema.extend({
  action: z.literal("setDietaryRestrictions"),
  dietaryRestrictions: z.array(z.enum(dietaryValues)),
});

const logMealSchema = requestSchema.extend({
  action: z.literal("logMeal"),
  restaurantId: z.string().trim().min(1).max(120),
  mealId: z.string().trim().min(1).max(160),
  loggedAtISO: z.iso.datetime().optional(),
});

const removeMealHistoryEntrySchema = requestSchema.extend({
  action: z.literal("removeMealHistoryEntry"),
  entryId: z.string().trim().min(1),
});

const legacyRatingSchema = requestSchema.extend({
  restaurantId: z.string().trim().min(1).max(120),
  mealId: z.string().trim().min(1).max(160).optional(),
  rating: z.number().int().min(1).max(5),
});

const actionPatchSchema = z.discriminatedUnion("action", [
  setRestaurantRatingSchema,
  setMealRatingSchema,
  setNutritionGoalsSchema,
  setDietaryRestrictionsSchema,
  logMealSchema,
  removeMealHistoryEntrySchema,
]);

const usersFilePath = path.join(process.cwd(), "data", "users.json");

type UserRecord = z.infer<typeof userRecordSchema>;
type ActionPatchRequest = z.infer<typeof actionPatchSchema>;
type LegacyRatingRequest = z.infer<typeof legacyRatingSchema>;

const readUsers = async (): Promise<UserRecord[]> => {
  try {
    const raw = await fs.readFile(usersFilePath, "utf8");
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) {
      return [];
    }

    return parsed
      .map((entry) => userRecordSchema.safeParse(entry))
      .filter((entry): entry is { success: true; data: UserRecord } => entry.success)
      .map((entry) => ({
        ...entry.data,
        nutritionGoals: normalizeNutritionGoals(entry.data.nutritionGoals),
      }));
  } catch {
    return [];
  }
};

const writeUsers = async (users: UserRecord[]): Promise<void> => {
  await fs.mkdir(path.dirname(usersFilePath), { recursive: true });
  await fs.writeFile(usersFilePath, `${JSON.stringify(users, null, 2)}\n`, "utf8");
};

function buildMealHistoryEntry(params: {
  restaurantId: string;
  mealId: string;
  loggedAtISO?: string;
}) {
  const restaurant = restaurantsById.get(params.restaurantId);
  if (!restaurant) {
    return null;
  }

  const meal = restaurant.menu.find((menuItem) => menuItem.id === params.mealId);
  if (!meal) {
    return null;
  }

  const { nutrition, estimated } = resolveMealNutrition(meal);
  const nowISO = params.loggedAtISO || new Date().toISOString();

  return {
    id: `meal-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    restaurantId: restaurant.id,
    restaurantName: restaurant.name,
    mealId: meal.id,
    mealName: meal.name,
    loggedAtISO: nowISO,
    nutrition,
    nutritionEstimated: estimated,
  };
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const userId = searchParams.get("userId");
  const parsed = requestSchema.safeParse({ userId });

  if (!parsed.success) {
    return NextResponse.json(
      {
        error: "Invalid user ID",
        issues: parsed.error.issues.map((issue) => issue.message),
      },
      { status: 400 },
    );
  }

  const users = await readUsers();
  const user = users.find((entry) => entry.userId === parsed.data.userId);
  if (!user) {
    return NextResponse.json(
      {
        error: "User not found",
      },
      { status: 404 },
    );
  }

  return NextResponse.json({ user });
}

export async function POST(request: Request) {
  try {
    const payload = await request.json();
    const parsed = requestSchema.safeParse(payload);
    if (!parsed.success) {
      return NextResponse.json(
        {
          error: "Invalid payload",
          issues: parsed.error.issues.map((issue) => issue.message),
        },
        { status: 400 },
      );
    }

    const nowISO = new Date().toISOString();
    const users = await readUsers();
    const existing = users.find((user) => user.userId === parsed.data.userId);

    if (existing) {
      existing.lastLoginAtISO = nowISO;
      existing.loginCount += 1;
      existing.nutritionGoals = normalizeNutritionGoals(existing.nutritionGoals);
      await writeUsers(users);

      return NextResponse.json({
        created: false,
        user: existing,
      });
    }

    const createdUser: UserRecord = {
      userId: parsed.data.userId,
      createdAtISO: nowISO,
      lastLoginAtISO: nowISO,
      loginCount: 1,
      ratings: {},
      mealRatings: {},
      dietaryRestrictions: [],
      nutritionGoals: { ...DEFAULT_NUTRITION_GOALS },
      mealHistory: [],
    };

    users.push(createdUser);
    await writeUsers(users);

    return NextResponse.json({
      created: true,
      user: createdUser,
    });
  } catch (error) {
    console.error("Failed to create profile", error);
    return NextResponse.json(
      {
        error: "Failed to create profile",
      },
      { status: 500 },
    );
  }
}

export async function PATCH(request: Request) {
  try {
    const payload = await request.json();
    const parsedAction = actionPatchSchema.safeParse(payload);
    const parsedLegacy = legacyRatingSchema.safeParse(payload);
    if (!parsedAction.success && !parsedLegacy.success) {
      return NextResponse.json(
        {
          error: "Invalid payload",
          issues: [...parsedAction.error.issues, ...parsedLegacy.error.issues].map(
            (issue) => issue.message,
          ),
        },
        { status: 400 },
      );
    }

    let parsedData: ActionPatchRequest | LegacyRatingRequest;
    if (parsedAction.success) {
      parsedData = parsedAction.data;
    } else if (parsedLegacy.success) {
      parsedData = parsedLegacy.data;
    } else {
      return NextResponse.json(
        {
          error: "Invalid payload",
        },
        { status: 400 },
      );
    }

    const users = await readUsers();
    const user = users.find((entry) => entry.userId === parsedData.userId);
    if (!user) {
      return NextResponse.json(
        {
          error: "User not found",
        },
        { status: 404 },
      );
    }

    if (!("action" in parsedData)) {
      if (parsedData.mealId) {
        const mealKey = `${parsedData.restaurantId}::${parsedData.mealId}`;
        user.mealRatings[mealKey] = parsedData.rating;
      } else {
        user.ratings[parsedData.restaurantId] = parsedData.rating;
      }
    } else {
      switch (parsedData.action) {
        case "setRestaurantRating": {
          user.ratings[parsedData.restaurantId] = parsedData.rating;
          break;
        }
        case "setMealRating": {
          const mealKey = `${parsedData.restaurantId}::${parsedData.mealId}`;
          user.mealRatings[mealKey] = parsedData.rating;
          break;
        }
        case "setNutritionGoals": {
          user.nutritionGoals = normalizeNutritionGoals(parsedData.nutritionGoals);
          break;
        }
        case "setDietaryRestrictions": {
          user.dietaryRestrictions = [...new Set(parsedData.dietaryRestrictions)];
          break;
        }
        case "logMeal": {
          const entry = buildMealHistoryEntry({
            restaurantId: parsedData.restaurantId,
            mealId: parsedData.mealId,
            loggedAtISO: parsedData.loggedAtISO,
          });

          if (!entry) {
            return NextResponse.json(
              {
                error: "Restaurant or meal not found",
              },
              { status: 404 },
            );
          }

          user.mealHistory = [entry, ...user.mealHistory].slice(0, MAX_MEAL_HISTORY_ITEMS);
          break;
        }
        case "removeMealHistoryEntry": {
          const removedEntry = user.mealHistory.find((entry) => entry.id === parsedData.entryId);
          if (!removedEntry) {
            return NextResponse.json(
              {
                error: "Meal history entry not found",
              },
              { status: 404 },
            );
          }

          user.mealHistory = user.mealHistory.filter((entry) => entry.id !== parsedData.entryId);

          const mealKey = `${removedEntry.restaurantId}::${removedEntry.mealId}`;
          const stillHasMealHistory = user.mealHistory.some(
            (entry) =>
              entry.restaurantId === removedEntry.restaurantId &&
              entry.mealId === removedEntry.mealId,
          );
          if (!stillHasMealHistory) {
            delete user.mealRatings[mealKey];
          }
          break;
        }
      }
    }

    user.lastLoginAtISO = new Date().toISOString();
    await writeUsers(users);

    return NextResponse.json({
      user,
    });
  } catch (error) {
    console.error("Failed to update profile", error);
    return NextResponse.json(
      {
        error: "Failed to update profile",
      },
      { status: 500 },
    );
  }
}
