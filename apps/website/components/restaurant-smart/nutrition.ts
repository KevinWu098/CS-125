import type { RestaurantSchema } from "@packages/types";

import type { MealHistoryEntry, MealNutrition } from "./types";

const MIN_ESTIMATED_CALORIES = 350;
const MAX_ESTIMATED_CALORIES = 900;
const CALORIES_PER_DOLLAR = 48;

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

export function estimateMealNutrition(priceUSD?: number): MealNutrition {
  const estimatedCalories = clamp(
    Math.round((priceUSD || 10) * CALORIES_PER_DOLLAR),
    MIN_ESTIMATED_CALORIES,
    MAX_ESTIMATED_CALORIES,
  );

  const proteinCalories = estimatedCalories * 0.25;
  const carbCalories = estimatedCalories * 0.45;
  const fatCalories = estimatedCalories * 0.3;

  return {
    calories: estimatedCalories,
    proteinG: Math.round(proteinCalories / 4),
    carbsG: Math.round(carbCalories / 4),
    fatG: Math.round(fatCalories / 9),
  };
}

export function resolveMealNutrition(meal: RestaurantSchema["menu"][number]): {
  nutrition: MealNutrition;
  estimated: boolean;
} {
  const hasExplicitNutrition = Boolean(
    meal.nutrition &&
    (typeof meal.nutrition.calories === "number" ||
      typeof meal.nutrition.proteinG === "number" ||
      typeof meal.nutrition.carbsG === "number" ||
      typeof meal.nutrition.fatG === "number"),
  );

  if (!hasExplicitNutrition) {
    return {
      nutrition: estimateMealNutrition(meal.priceUSD),
      estimated: true,
    };
  }

  const calories = meal.nutrition?.calories;
  const proteinG = meal.nutrition?.proteinG;
  const carbsG = meal.nutrition?.carbsG;
  const fatG = meal.nutrition?.fatG;

  const nutrition: MealNutrition = {
    calories:
      typeof calories === "number" ? calories : estimateMealNutrition(meal.priceUSD).calories,
    proteinG: typeof proteinG === "number" ? proteinG : 0,
    carbsG: typeof carbsG === "number" ? carbsG : 0,
    fatG: typeof fatG === "number" ? fatG : 0,
  };

  return { nutrition, estimated: false };
}

export function sumMealNutrition(entries: MealHistoryEntry[]): MealNutrition {
  return entries.reduce<MealNutrition>(
    (sum, entry) => ({
      calories: sum.calories + entry.nutrition.calories,
      proteinG: sum.proteinG + entry.nutrition.proteinG,
      carbsG: sum.carbsG + entry.nutrition.carbsG,
      fatG: sum.fatG + entry.nutrition.fatG,
    }),
    { calories: 0, proteinG: 0, carbsG: 0, fatG: 0 },
  );
}

export function getRingProgress(value: number, target: number): number {
  if (!Number.isFinite(target) || target <= 0) {
    return 0;
  }
  return clamp(value / target, 0, 1.25);
}
