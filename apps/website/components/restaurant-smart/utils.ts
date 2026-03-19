import type { RestaurantSchema } from "@packages/types";

import { DEFAULT_NUTRITION_GOALS } from "./constants";
import type { DietaryKey, NutritionGoals, UserRecord } from "./types";

const DIETARY_KEYS: DietaryKey[] = [
  "vegan",
  "vegetarian",
  "glutenFree",
  "halal",
  "kosher",
  "dairyFree",
  "nutFree",
];

export function normalizeNutritionGoals(nutritionGoals?: Partial<NutritionGoals>): NutritionGoals {
  return {
    calories: nutritionGoals?.calories ?? DEFAULT_NUTRITION_GOALS.calories,
    proteinG: nutritionGoals?.proteinG ?? DEFAULT_NUTRITION_GOALS.proteinG,
    carbsG: nutritionGoals?.carbsG ?? DEFAULT_NUTRITION_GOALS.carbsG,
    fatG: nutritionGoals?.fatG ?? DEFAULT_NUTRITION_GOALS.fatG,
  };
}

export function normalizeDietaryRestrictions(dietaryRestrictions?: string[]): DietaryKey[] {
  if (!Array.isArray(dietaryRestrictions)) {
    return [];
  }

  const keys = new Set<DietaryKey>();
  dietaryRestrictions.forEach((entry) => {
    if (DIETARY_KEYS.includes(entry as DietaryKey)) {
      keys.add(entry as DietaryKey);
    }
  });

  return [...keys];
}

export function normalizeProfileRecord(profile: UserRecord): UserRecord {
  return {
    ...profile,
    ratings: profile.ratings,
    mealRatings: profile.mealRatings,
    dietaryRestrictions: normalizeDietaryRestrictions(profile.dietaryRestrictions),
    nutritionGoals: normalizeNutritionGoals(profile.nutritionGoals),
    mealHistory: profile.mealHistory,
  };
}

export function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

export function haversineDistanceKm(
  originLat: number,
  originLng: number,
  destinationLat: number,
  destinationLng: number,
): number {
  const earthRadiusKm = 6371;
  const toRad = (degrees: number) => (degrees * Math.PI) / 180;

  const deltaLat = toRad(destinationLat - originLat);
  const deltaLng = toRad(destinationLng - originLng);

  const lat1 = toRad(originLat);
  const lat2 = toRad(destinationLat);

  const a =
    Math.sin(deltaLat / 2) * Math.sin(deltaLat / 2) +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(deltaLng / 2) * Math.sin(deltaLng / 2);

  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return earthRadiusKm * c;
}

function formatTime(time: string): string {
  const [hours, minutes] = time.split(":").map(Number);
  const period = hours >= 12 ? "PM" : "AM";
  const displayHours = hours % 12 || 12;
  return `${displayHours}:${minutes.toString().padStart(2, "0")} ${period}`;
}

export function getOpenStatus(hours: RestaurantSchema["hours"]): {
  isOpen: boolean;
  nextChange: string;
} {
  if (!hours || hours.length === 0) {
    return { isOpen: false, nextChange: "Hours unavailable" };
  }

  const now = new Date();
  const days = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"] as const;
  const currentDay = days[now.getDay()];
  const currentTime = `${now.getHours().toString().padStart(2, "0")}:${now
    .getMinutes()
    .toString()
    .padStart(2, "0")}`;

  const todayHours = hours.find((hour) => hour.day === currentDay);
  if (!todayHours) {
    return { isOpen: false, nextChange: "Closed today" };
  }

  const isOpen = currentTime >= todayHours.open && currentTime < todayHours.close;
  const nextChange = isOpen
    ? `Closes at ${formatTime(todayHours.close)}`
    : `Opens at ${formatTime(todayHours.open)}`;

  return { isOpen, nextChange };
}

export function formatDistance(distanceKm: number): string {
  const miles = distanceKm * 0.621371;
  if (miles < 0.1) {
    return "< 0.1 mi";
  }
  return `${miles.toFixed(1)} mi`;
}

export function formatCuisineLabel(cuisine: string): string {
  return cuisine.replace(/-/g, " ").replace(/\b\w/g, (character) => character.toUpperCase());
}

export function toMealKey(restaurantId: string, mealId: string): string {
  return `${restaurantId}::${mealId}`;
}

export function splitMealKey(mealKey: string): {
  restaurantId: string;
  mealId: string;
} | null {
  const delimiterIndex = mealKey.indexOf("::");
  if (delimiterIndex <= 0 || delimiterIndex >= mealKey.length - 2) {
    return null;
  }

  return {
    restaurantId: mealKey.slice(0, delimiterIndex),
    mealId: mealKey.slice(delimiterIndex + 2),
  };
}

export function mealDietaryMatch(
  meal: RestaurantSchema["menu"][number],
  dietary: DietaryKey,
): boolean {
  return meal.dietarySupport[dietary];
}

export function priceLevel(priceTier?: string): number {
  return priceTier?.length || 2;
}
