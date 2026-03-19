import rawRestaurantData from "@packages/data";
import type { DietarySupport, RestaurantSchema } from "@packages/types";

import { dayLookup, EXCLUDED_CUISINES } from "./constants";
import type { NormalizedDay, RawRestaurant } from "./types";

function normalizeDay(value: string): NormalizedDay | null {
  const normalized = value.trim().toLowerCase();
  return dayLookup[normalized] ?? null;
}

function normalizeTimeTo24(value: string): string | null {
  const normalized = value.trim().toLowerCase();
  if (!normalized || normalized === "not specified") {
    return null;
  }

  const match12Hour = normalized.match(/^(\d{1,2}):(\d{2})\s*(am|pm)$/i);
  if (match12Hour) {
    const rawHour = Number(match12Hour[1]);
    const minute = Number(match12Hour[2]);
    const period = match12Hour[3].toLowerCase();
    if (rawHour < 1 || rawHour > 12 || minute < 0 || minute > 59) {
      return null;
    }

    const hour24 = period === "pm" ? (rawHour % 12) + 12 : rawHour % 12;
    return `${hour24.toString().padStart(2, "0")}:${minute.toString().padStart(2, "0")}`;
  }

  const match24Hour = normalized.match(/^(\d{1,2}):(\d{2})$/);
  if (match24Hour) {
    const hour = Number(match24Hour[1]);
    const minute = Number(match24Hour[2]);
    if (hour < 0 || hour > 23 || minute < 0 || minute > 59) {
      return null;
    }
    return `${hour.toString().padStart(2, "0")}:${minute.toString().padStart(2, "0")}`;
  }

  return null;
}

function normalizePriceTier(value?: string): RestaurantSchema["priceTier"] | undefined {
  if (!value) {
    return undefined;
  }

  const normalized = value.trim().toLowerCase();
  if (normalized.startsWith("$")) {
    const symbolCount = normalized.replace(/[^$]/g, "").length;
    const clamped = Math.min(4, Math.max(1, symbolCount));
    return "$".repeat(clamped) as RestaurantSchema["priceTier"];
  }

  if (normalized.includes("moderate")) {
    return "$$";
  }

  if (normalized.includes("expensive")) {
    return "$$$";
  }

  if (normalized.includes("varies") || normalized.includes("not specified")) {
    return "$$";
  }

  return undefined;
}

function normalizeMealCategory(value?: string): string | undefined {
  if (!value) {
    return undefined;
  }

  const withoutMandarin = value
    .replace(/[\u3400-\u4DBF\u4E00-\u9FFF\uF900-\uFAFF]/g, "")
    .replace(/[\u3000-\u303F]/g, "")
    .replace(/\(\s*\)/g, "")
    .replace(/\s*[/|,;:-]\s*$/g, "")
    .replace(/^\s*[/|,;:-]\s*/g, "")
    .replace(/\s{2,}/g, " ")
    .trim();

  return withoutMandarin.length > 0 ? withoutMandarin : undefined;
}

function normalizeStringArray(values?: string[]): string[] | undefined {
  if (!values || values.length === 0) {
    return undefined;
  }

  const normalized = values
    .map((value) => value.trim().toLowerCase())
    .filter((value) => value.length > 0);

  if (normalized.length === 0) {
    return undefined;
  }

  return Array.from(new Set(normalized));
}

function normalizeNumericValue(value: unknown): number | undefined {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }

  if (typeof value === "string") {
    const parsed = Number.parseFloat(value.trim());
    if (Number.isFinite(parsed)) {
      return parsed;
    }
  }

  return undefined;
}

function normalizeDietarySupport(value?: Partial<DietarySupport>): DietarySupport {
  return {
    vegan: Boolean(value?.vegan),
    vegetarian: Boolean(value?.vegetarian),
    glutenFree: Boolean(value?.glutenFree),
    dairyFree: Boolean(value?.dairyFree),
    halal: Boolean(value?.halal),
    kosher: Boolean(value?.kosher),
    nutFree: Boolean(value?.nutFree),
  };
}

function hasValidCoordinates(lat: number, lng: number): boolean {
  const inRange = Math.abs(lat) <= 90 && Math.abs(lng) <= 180;
  const notZeroOrigin = Math.abs(lat) > 1e-9 || Math.abs(lng) > 1e-9;
  return inRange && notZeroOrigin;
}

function normalizeRestaurants(rawRestaurants: RawRestaurant[]): RestaurantSchema[] {
  return rawRestaurants
    .map<RestaurantSchema | null>((restaurant) => {
      const location = restaurant.location;
      const lat = location?.lat;
      const lng = location?.lng;

      if (!restaurant.id || !restaurant.name || !Array.isArray(restaurant.cuisine) || !location) {
        return null;
      }

      if (
        typeof lat !== "number" ||
        typeof lng !== "number" ||
        !Number.isFinite(lat) ||
        !Number.isFinite(lng) ||
        !hasValidCoordinates(lat, lng)
      ) {
        return null;
      }

      const normalizedHours =
        restaurant.hours
          ?.map((hour) => {
            if (!hour.day || !hour.open || !hour.close) {
              return null;
            }

            const day = normalizeDay(hour.day);
            const open = normalizeTimeTo24(hour.open);
            const close = normalizeTimeTo24(hour.close);
            if (!day || !open || !close) {
              return null;
            }

            return { day, open, close };
          })
          .filter(
            (hour): hour is NonNullable<RestaurantSchema["hours"]>[number] => hour !== null,
          ) ?? [];

      const menu =
        restaurant.menu?.map((item, itemIndex) => {
          const normalizedNutrition = item.nutrition
            ? {
                calories: normalizeNumericValue(item.nutrition.calories),
                proteinG: normalizeNumericValue(item.nutrition.proteinG),
                carbsG: normalizeNumericValue(item.nutrition.carbsG),
                fatG: normalizeNumericValue(item.nutrition.fatG),
                fiberG: normalizeNumericValue(item.nutrition.fiberG),
                sugarG: normalizeNumericValue(item.nutrition.sugarG),
                sodiumMg: normalizeNumericValue(item.nutrition.sodiumMg),
              }
            : undefined;

          const hasNutritionValues = Boolean(
            normalizedNutrition &&
            Object.values(normalizedNutrition).some(
              (value) => typeof value === "number" && Number.isFinite(value),
            ),
          );

          return {
            id: item.id?.trim() || `${restaurant.id}-item-${itemIndex + 1}`,
            name: item.name?.trim() || `Item ${itemIndex + 1}`,
            description: item.description?.trim() || undefined,
            priceUSD:
              typeof item.priceUSD === "number" && Number.isFinite(item.priceUSD)
                ? item.priceUSD
                : undefined,
            category: normalizeMealCategory(item.category),
            tags: normalizeStringArray(item.tags),
            allergens: normalizeStringArray(item.allergens),
            dietarySupport: normalizeDietarySupport(item.dietarySupport),
            nutrition: hasNutritionValues ? normalizedNutrition : undefined,
          };
        }) ?? [];

      return {
        id: restaurant.id,
        name: restaurant.name,
        description: restaurant.description?.trim() || undefined,
        cuisine: restaurant.cuisine
          .map((cuisine) => cuisine.trim().toLowerCase())
          .filter((cuisine) => cuisine.length > 0 && !EXCLUDED_CUISINES.has(cuisine)),
        priceTier: normalizePriceTier(restaurant.priceTier),
        rating:
          restaurant.rating &&
          typeof restaurant.rating.average === "number" &&
          Number.isFinite(restaurant.rating.average) &&
          typeof restaurant.rating.count === "number" &&
          Number.isFinite(restaurant.rating.count)
            ? {
                average: restaurant.rating.average,
                count: restaurant.rating.count,
                source: restaurant.rating.source?.trim() || undefined,
              }
            : undefined,
        location: {
          address: location.address?.trim() || "Address unavailable",
          city: location.city?.trim() || "Unknown",
          state: location.state?.trim() || "Unknown",
          postalCode: location.postalCode?.trim() || "00000",
          lat,
          lng,
        },
        hours: normalizedHours.length > 0 ? normalizedHours : undefined,
        menu:
          menu.length > 0
            ? menu
            : [
                {
                  id: `${restaurant.id}-item-1`,
                  name: "Menu item",
                  dietarySupport: normalizeDietarySupport(),
                },
              ],
      };
    })
    .filter((restaurant): restaurant is RestaurantSchema => restaurant !== null);
}

export const restaurantData = normalizeRestaurants(rawRestaurantData as RawRestaurant[]);

const rawCuisineOptions = Array.from(
  new Set(restaurantData.flatMap((restaurant) => restaurant.cuisine)),
).sort();

const cuisineOptionSet = new Set(rawCuisineOptions);

export const allMealCategories = Array.from(
  new Set(
    restaurantData.flatMap((restaurant) =>
      restaurant.menu
        .map((meal) => meal.category?.trim().toLowerCase())
        .filter(
          (category): category is string =>
            typeof category === "string" && category.length > 0 && !cuisineOptionSet.has(category),
        ),
    ),
  ),
).sort();

export const allCuisines = rawCuisineOptions;

const allMealPrices = restaurantData
  .flatMap((restaurant) => restaurant.menu.map((meal) => meal.priceUSD))
  .filter((price): price is number => typeof price === "number" && Number.isFinite(price));

export const DEFAULT_MAX_MEAL_PRICE =
  allMealPrices.length > 0 ? Math.ceil(Math.max(...allMealPrices)) : 60;

export const restaurantsById = new Map(
  restaurantData.map((restaurant) => [restaurant.id, restaurant]),
);
