import type { RestaurantSchema } from "@packages/types";

import { KM_PER_MILE } from "./constants";
import { DEFAULT_MAX_MEAL_PRICE, restaurantData, restaurantsById } from "./data";
import type {
  DietaryKey,
  RankedMeal,
  RankedRestaurant,
  SortKey,
  UserLocation,
  UserRecord,
} from "./types";
import {
  clamp,
  formatCuisineLabel,
  haversineDistanceKm,
  mealDietaryMatch,
  priceLevel,
  splitMealKey,
  toMealKey,
} from "./utils";

type RankRestaurantsOptions = {
  searchQuery: string;
  mealSearchQuery: string;
  selectedCuisines: string[];
  selectedMealCategories: string[];
  selectedDietary: DietaryKey[];
  priceRange: [number, number];
  minRating: number;
  maxDistanceMiles: number;
  maxMealPrice: number;
  sortBy: SortKey;
  userLocation: UserLocation;
  profile: UserRecord | null;
};

function buildCuisineSignals(profile: UserRecord | null): Record<string, number> {
  if (!profile) {
    return {};
  }

  const totals: Record<string, { sum: number; count: number } | undefined> = {};

  Object.entries(profile.ratings).forEach(([restaurantId, rating]) => {
    const restaurant = restaurantsById.get(restaurantId);
    if (!restaurant) {
      return;
    }

    const centeredRating = (rating - 3) / 2;
    restaurant.cuisine.forEach((cuisine) => {
      const existing = totals[cuisine];
      if (!existing) {
        totals[cuisine] = { sum: centeredRating, count: 1 };
        return;
      }

      existing.sum += centeredRating;
      existing.count += 1;
    });
  });

  const result: Record<string, number> = {};
  Object.entries(totals).forEach(([cuisine, aggregate]) => {
    if (!aggregate) {
      return;
    }
    result[cuisine] = aggregate.sum / aggregate.count;
  });

  return result;
}

export function rankRestaurants(options: RankRestaurantsOptions): RankedRestaurant[] {
  const {
    maxDistanceMiles,
    maxMealPrice,
    mealSearchQuery,
    minRating,
    priceRange,
    profile,
    searchQuery,
    selectedCuisines,
    selectedDietary,
    selectedMealCategories,
    sortBy,
    userLocation,
  } = options;

  const cuisineSignals = buildCuisineSignals(profile);

  const query = searchQuery.trim().toLowerCase();
  const mealQuery = mealSearchQuery.trim().toLowerCase();

  const ratedRestaurants = Object.entries(profile?.ratings || {})
    .map(([restaurantId, rating]) => {
      const restaurant = restaurantsById.get(restaurantId);
      if (!restaurant) {
        return null;
      }

      return { restaurant, rating };
    })
    .filter(
      (
        entry,
      ): entry is {
        restaurant: RestaurantSchema;
        rating: number;
      } => entry !== null,
    );

  const cuisineEvidence = new Map<
    string,
    {
      sum: number;
      count: number;
    }
  >();

  ratedRestaurants.forEach(({ restaurant, rating }) => {
    const centered = (rating - 3) / 2;

    restaurant.cuisine.forEach((rawCuisine) => {
      const cuisine = rawCuisine.toLowerCase();
      const existing = cuisineEvidence.get(cuisine);

      if (!existing) {
        cuisineEvidence.set(cuisine, {
          sum: centered,
          count: 1,
        });
        return;
      }

      existing.sum += centered;
      existing.count += 1;
    });
  });

  const mealCategoryEvidence = new Map<
    string,
    {
      sum: number;
      count: number;
    }
  >();

  Object.entries(profile?.mealRatings || {}).forEach(([mealKey, rating]) => {
    const parsed = splitMealKey(mealKey);
    if (!parsed) {
      return;
    }

    const restaurant = restaurantsById.get(parsed.restaurantId);
    const meal = restaurant?.menu.find((menuItem) => menuItem.id === parsed.mealId);
    if (!meal?.category) {
      return;
    }

    const mealCategory = meal.category.trim().toLowerCase();
    const centered = (rating - 3) / 2;
    const existing = mealCategoryEvidence.get(mealCategory);
    if (!existing) {
      mealCategoryEvidence.set(mealCategory, { sum: centered, count: 1 });
      return;
    }

    existing.sum += centered;
    existing.count += 1;
  });

  const filtered = restaurantData
    .map<RankedRestaurant | null>((restaurant) => {
      const distanceKm = haversineDistanceKm(
        userLocation.lat,
        userLocation.lng,
        restaurant.location.lat,
        restaurant.location.lng,
      );

      const nameMatch = query && restaurant.name.toLowerCase().includes(query) ? 1 : 0;
      const cuisineMatch =
        query && restaurant.cuisine.some((cuisine) => cuisine.toLowerCase().includes(query))
          ? 0.82
          : 0;
      const menuMatch =
        query && restaurant.menu.some((item) => item.name.toLowerCase().includes(query)) ? 0.7 : 0;
      const descriptionMatch =
        query && restaurant.description?.toLowerCase().includes(query) ? 0.62 : 0;

      const textSignal = query
        ? Math.max(nameMatch, cuisineMatch, menuMatch, descriptionMatch)
        : 0.65;

      if (query && textSignal === 0) {
        return null;
      }

      if (
        selectedCuisines.length > 0 &&
        !restaurant.cuisine.some((cuisine) => selectedCuisines.includes(cuisine))
      ) {
        return null;
      }

      const restaurantPriceLevel = priceLevel(restaurant.priceTier);
      if (restaurantPriceLevel < priceRange[0] || restaurantPriceLevel > priceRange[1]) {
        return null;
      }

      if ((restaurant.rating?.average || 0) < minRating) {
        return null;
      }

      if (distanceKm > maxDistanceMiles * KM_PER_MILE) {
        return null;
      }

      const restaurantSupportsDietary =
        selectedDietary.length === 0 ||
        selectedDietary.every((dietary) => Boolean(restaurant.dietarySupport?.[dietary]));
      const hasMealFilters =
        selectedDietary.length > 0 ||
        selectedMealCategories.length > 0 ||
        Boolean(mealQuery) ||
        maxMealPrice < DEFAULT_MAX_MEAL_PRICE;

      const recommendedMeals = restaurant.menu
        .map<RankedMeal | null>((meal) => {
          const mealCategory = meal.category?.trim().toLowerCase();
          if (
            selectedMealCategories.length > 0 &&
            (!mealCategory || !selectedMealCategories.includes(mealCategory))
          ) {
            return null;
          }

          const mealText = `${meal.name} ${meal.description || ""}`.toLowerCase();
          if (mealQuery && !mealText.includes(mealQuery)) {
            return null;
          }

          if (typeof meal.priceUSD === "number" && meal.priceUSD > maxMealPrice) {
            return null;
          }

          const dietaryMatches = selectedDietary.filter((dietary) =>
            mealDietaryMatch(meal, dietary, restaurant),
          );
          const matchesAllSelectedDietary =
            selectedDietary.length === 0 || dietaryMatches.length === selectedDietary.length;

          if (
            selectedDietary.length > 0 &&
            !restaurantSupportsDietary &&
            !matchesAllSelectedDietary
          ) {
            return null;
          }

          const mealKey = toMealKey(restaurant.id, meal.id);
          const existingMealRating = profile?.mealRatings[mealKey];
          const explicitMealSignal = existingMealRating ? (existingMealRating - 3) / 2 : 0;
          const mealCategoryAggregate = mealCategory
            ? mealCategoryEvidence.get(mealCategory)
            : undefined;
          const mealCategorySignal = mealCategoryAggregate
            ? mealCategoryAggregate.sum / mealCategoryAggregate.count
            : 0;

          const dietarySignal =
            selectedDietary.length > 0 ? dietaryMatches.length / selectedDietary.length : 0.6;
          const mealTextSignal = mealQuery ? 1 : 0.6;

          const explicitMealNormalized = (explicitMealSignal + 1) / 2;
          const mealCategoryNormalized = (mealCategorySignal + 1) / 2;
          const mealScore =
            explicitMealNormalized * 0.5 +
            mealCategoryNormalized * 0.22 +
            dietarySignal * 0.2 +
            mealTextSignal * 0.08;

          const mealReasons: string[] = [];
          if (existingMealRating) {
            mealReasons.push("You rated this meal before.");
          }
          if (mealCategory && mealCategorySignal > 0) {
            mealReasons.push(`Similar to your ${formatCuisineLabel(mealCategory)} preference.`);
          }
          if (selectedDietary.length > 0 && matchesAllSelectedDietary) {
            mealReasons.push("Fits your dietary filters.");
          }
          if (mealReasons.length === 0 && mealQuery) {
            mealReasons.push(`Matches meal search for \"${mealSearchQuery.trim()}\".`);
          }
          if (mealReasons.length === 0 && maxMealPrice < DEFAULT_MAX_MEAL_PRICE) {
            mealReasons.push("Within your meal price filter.");
          }

          return {
            meal,
            mealKey,
            score: mealScore,
            reasons: mealReasons.slice(0, 2),
            userMealRating: existingMealRating || null,
          };
        })
        .filter((meal): meal is RankedMeal => meal !== null)
        .sort((left, right) => right.score - left.score)
        .slice(0, 8);

      if (hasMealFilters && recommendedMeals.length === 0) {
        return null;
      }

      const mealSignal =
        recommendedMeals.length > 0
          ? recommendedMeals.slice(0, 3).reduce((sum, meal) => sum + meal.score, 0) /
            Math.min(recommendedMeals.length, 3)
          : 0.45;

      const explicitUserSignal = profile?.ratings[restaurant.id]
        ? (profile.ratings[restaurant.id] - 3) / 2
        : 0;
      const cuisineSignal =
        restaurant.cuisine.reduce((sum, cuisine) => sum + (cuisineSignals[cuisine] || 0), 0) /
        restaurant.cuisine.length;
      const personalSignal =
        explicitUserSignal !== 0 ? explicitUserSignal * 0.7 + cuisineSignal * 0.3 : cuisineSignal;

      const normalizedPersonalSignal = (personalSignal + 1) / 2;
      const qualitySignal = (restaurant.rating?.average || 0) / 5;
      const distanceSignal = clamp(
        1 - distanceKm / Math.max(maxDistanceMiles * KM_PER_MILE, 0.1),
        0,
        1,
      );

      const recommendationScore =
        qualitySignal * 0.29 +
        textSignal * 0.22 +
        distanceSignal * 0.17 +
        normalizedPersonalSignal * 0.18 +
        mealSignal * 0.14;

      const personalReasons: string[] = [];
      if (profile?.ratings[restaurant.id]) {
        personalReasons.push("You have rated this restaurant before.");
      }

      const cuisineReasons = restaurant.cuisine
        .map((rawCuisine) => {
          const cuisine = rawCuisine.toLowerCase();
          const evidence = cuisineEvidence.get(cuisine);
          if (!evidence || evidence.count === 0) {
            return null;
          }

          const averagePreference = evidence.sum / evidence.count;
          if (averagePreference <= 0) {
            return null;
          }

          return {
            score: averagePreference,
            text: `Similar to your ${formatCuisineLabel(cuisine)} preferences.`,
          };
        })
        .filter(
          (
            reason,
          ): reason is {
            score: number;
            text: string;
          } => reason !== null,
        )
        .sort((left, right) => right.score - left.score)
        .slice(0, 2)
        .map((reason) => reason.text);

      personalReasons.push(...cuisineReasons);
      if (
        recommendedMeals.some((meal) => meal.userMealRating !== null && meal.userMealRating >= 4)
      ) {
        personalReasons.push("You previously liked meals from this restaurant.");
      }
      if (personalReasons.length === 0 && personalSignal > 0.25) {
        personalReasons.push("Aligned with your saved cuisine preferences.");
      }

      return {
        restaurant,
        distanceKm,
        recommendationScore,
        textSignal,
        personalSignal,
        mealSignal,
        userRating: profile?.ratings[restaurant.id] || null,
        personalReasons,
        recommendedMeals,
      };
    })
    .filter((entry): entry is RankedRestaurant => entry !== null);

  filtered.sort((left, right) => {
    switch (sortBy) {
      case "recommended":
        return right.recommendationScore - left.recommendationScore;
      case "distance":
        return left.distanceKm - right.distanceKm;
      case "rating":
        return (right.restaurant.rating?.average || 0) - (left.restaurant.rating?.average || 0);
      case "price":
        return priceLevel(left.restaurant.priceTier) - priceLevel(right.restaurant.priceTier);
      case "name":
        return left.restaurant.name.localeCompare(right.restaurant.name);
      default:
        return 0;
    }
  });

  return filtered;
}
