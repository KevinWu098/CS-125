import type { RestaurantSchema } from "@packages/types";

import { KM_PER_MILE } from "./constants";
import { DEFAULT_MAX_MEAL_PRICE, restaurantData, restaurantsById } from "./data";
import { resolveMealNutrition, sumMealNutrition } from "./nutrition";
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
  candidateRestaurantIds?: string[];
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
    candidateRestaurantIds,
  } = options;
  const hasDistanceFilter = maxDistanceMiles > 0;

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

  const nutritionGoals = profile?.nutritionGoals ?? null;
  const consumedNutrition = profile ? sumMealNutrition(profile.mealHistory) : null;
  const remainingCalories =
    nutritionGoals && consumedNutrition
      ? Math.max(nutritionGoals.calories - consumedNutrition.calories, 0)
      : null;

  const sourceRestaurants =
    candidateRestaurantIds && candidateRestaurantIds.length > 0
      ? candidateRestaurantIds
          .map((restaurantId) => restaurantsById.get(restaurantId))
          .filter((restaurant): restaurant is RestaurantSchema => restaurant !== undefined)
      : restaurantData;

  const filtered = sourceRestaurants
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

      if (hasDistanceFilter && distanceKm > maxDistanceMiles * KM_PER_MILE) {
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
          const { nutrition: mealNutrition, estimated: nutritionEstimated } =
            resolveMealNutrition(meal);

          let nutritionGoalSignal = 0.55;
          let macroRatioSignal = 0.55;
          let calorieSignal = 0.55;
          let proteinGoalSignal = 0.55;
          let proteinDensitySignal = 0.55;
          let carbGoalSignal = 0.55;
          let fatGoalSignal = 0.55;
          if (nutritionGoals) {
            const targetCalories = Math.max(nutritionGoals.calories, 1);
            const targetProteinCalories = Math.max(nutritionGoals.proteinG, 0) * 4;
            const targetCarbCalories = Math.max(nutritionGoals.carbsG, 0) * 4;
            const targetFatCalories = Math.max(nutritionGoals.fatG, 0) * 9;
            const totalTargetMacroCalories =
              targetProteinCalories + targetCarbCalories + targetFatCalories;

            const targetProteinRatio =
              totalTargetMacroCalories > 0 ? targetProteinCalories / totalTargetMacroCalories : 0.3;
            const targetCarbRatio =
              totalTargetMacroCalories > 0 ? targetCarbCalories / totalTargetMacroCalories : 0.45;
            const targetFatRatio =
              totalTargetMacroCalories > 0 ? targetFatCalories / totalTargetMacroCalories : 0.25;

            const mealProteinCalories = Math.max(mealNutrition.proteinG, 0) * 4;
            const mealCarbCalories = Math.max(mealNutrition.carbsG, 0) * 4;
            const mealFatCalories = Math.max(mealNutrition.fatG, 0) * 9;
            const totalMealMacroCalories = mealProteinCalories + mealCarbCalories + mealFatCalories;

            const mealCarbRatio =
              totalMealMacroCalories > 0 ? mealCarbCalories / totalMealMacroCalories : 0.45;
            const mealFatRatio =
              totalMealMacroCalories > 0 ? mealFatCalories / totalMealMacroCalories : 0.25;

            const lowCarbBias = clamp((0.3 - targetCarbRatio) / 0.18, 0, 1);
            const highProteinBias = clamp((targetProteinRatio - 0.3) / 0.2, 0, 1);

            const proteinTargetPerMeal = Math.max(18, nutritionGoals.proteinG * 0.22);
            proteinGoalSignal = clamp(mealNutrition.proteinG / proteinTargetPerMeal, 0, 1);

            const proteinPer100Calories =
              mealNutrition.calories > 0
                ? (mealNutrition.proteinG / mealNutrition.calories) * 100
                : 0;
            proteinDensitySignal = clamp((proteinPer100Calories - 3.5) / 5.5, 0, 1);

            const carbTargetPerMeal = Math.max(8, nutritionGoals.carbsG * 0.24);
            const carbOver = Math.max(mealNutrition.carbsG - carbTargetPerMeal, 0);
            const carbTolerance = Math.max(carbTargetPerMeal * (0.65 + lowCarbBias * 0.2), 10);
            const carbAbsoluteSignal = clamp(1 - carbOver / carbTolerance, 0, 1);
            const carbRatioOver = Math.max(mealCarbRatio - targetCarbRatio, 0);
            const carbRatioSignal = clamp(1 - carbRatioOver / 0.2, 0, 1);
            carbGoalSignal = clamp(carbAbsoluteSignal * 0.6 + carbRatioSignal * 0.4, 0, 1);

            const fatRatioOver = Math.max(mealFatRatio - (targetFatRatio + 0.08), 0);
            fatGoalSignal = clamp(1 - fatRatioOver / 0.35, 0, 1);

            const proteinWeight = 0.36 + highProteinBias * 0.12;
            const carbWeight = 0.28 + lowCarbBias * 0.16;
            const fatWeight = 0.12;
            const densityWeight = 0.16 + highProteinBias * 0.08;
            const macroWeightTotal = proteinWeight + carbWeight + fatWeight + densityWeight;

            macroRatioSignal = clamp(
              (proteinGoalSignal * proteinWeight +
                carbGoalSignal * carbWeight +
                fatGoalSignal * fatWeight +
                proteinDensitySignal * densityWeight) /
                macroWeightTotal,
              0,
              1,
            );

            const calorieTarget =
              remainingCalories !== null
                ? Math.min(Math.max(remainingCalories, 220), targetCalories * 0.38)
                : clamp(targetCalories * 0.24, 320, 680);
            const calorieTolerance = Math.max(targetCalories * 0.22, 160);
            calorieSignal = clamp(
              1 - Math.abs(mealNutrition.calories - calorieTarget) / calorieTolerance,
              0,
              1,
            );

            nutritionGoalSignal = clamp(macroRatioSignal * 0.82 + calorieSignal * 0.18, 0, 1);
          }

          const mealScore =
            explicitMealNormalized * 0.34 +
            mealCategoryNormalized * 0.17 +
            dietarySignal * 0.14 +
            mealTextSignal * 0.07 +
            nutritionGoalSignal * 0.28;

          const nutritionFitPros: string[] = [];
          const nutritionFitCons: string[] = [];
          const proteinCalorieShare =
            mealNutrition.calories > 0 ? (mealNutrition.proteinG * 4) / mealNutrition.calories : 0;
          const fatCalorieShare =
            mealNutrition.calories > 0 ? (mealNutrition.fatG * 9) / mealNutrition.calories : 0;
          const caloriesPerProteinGram =
            mealNutrition.proteinG > 0
              ? mealNutrition.calories / mealNutrition.proteinG
              : Number.POSITIVE_INFINITY;

          if (nutritionGoals) {
            if (calorieSignal >= 0.72) {
              nutritionFitPros.push("Calories land in range for your current goal.");
            } else if (mealNutrition.calories > nutritionGoals.calories * 0.45) {
              nutritionFitCons.push("Calories are high for one meal in your daily target.");
            } else if (mealNutrition.calories < Math.max(nutritionGoals.calories * 0.14, 150)) {
              nutritionFitCons.push("Calories may be too low for your target intake.");
            }

            if (proteinGoalSignal >= 0.74 && proteinDensitySignal >= 0.7) {
              nutritionFitPros.push("Strong protein fit for your goal and calories.");
            } else if (proteinGoalSignal <= 0.45 || proteinCalorieShare < 0.17) {
              nutritionFitCons.push("Protein is low for your target.");
            }

            if (carbGoalSignal >= 0.74) {
              nutritionFitPros.push("Carbs are in a strong range for your goal.");
            } else if (carbGoalSignal <= 0.45) {
              nutritionFitCons.push("Carbs are high for your goal range.");
            }

            if (macroRatioSignal >= 0.75) {
              nutritionFitPros.push("Overall macro profile aligns well with your target.");
            } else if (fatGoalSignal <= 0.4 || fatCalorieShare > 0.5) {
              nutritionFitCons.push("Macro balance is less aligned with your target.");
            }

            if (
              mealNutrition.proteinG >= Math.max(20, nutritionGoals.proteinG * 0.18) &&
              caloriesPerProteinGram <= 28
            ) {
              nutritionFitPros.push("Good protein density for the calories.");
            } else if (mealNutrition.proteinG < Math.max(14, nutritionGoals.proteinG * 0.1)) {
              nutritionFitCons.push("Adds limited protein toward your daily goal.");
            }

            if (remainingCalories !== null && remainingCalories > 0) {
              if (mealNutrition.calories <= remainingCalories + 120) {
                nutritionFitPros.push("Fits your remaining calorie budget today.");
              } else {
                nutritionFitCons.push("Likely exceeds your remaining calories today.");
              }
            }

            if (nutritionFitPros.length === 0 && nutritionGoalSignal >= 0.65) {
              nutritionFitPros.push("Overall nutrition fit is solid for your goals.");
            }
            if (nutritionFitCons.length === 0 && nutritionGoalSignal <= 0.5) {
              nutritionFitCons.push("Overall fit is weaker for your current goals.");
            }
          } else {
            if (mealNutrition.proteinG >= 24 && caloriesPerProteinGram <= 30) {
              nutritionFitPros.push("High protein relative to calories.");
            }
            if (mealNutrition.calories <= 650) {
              nutritionFitPros.push("Moderate calorie portion.");
            }

            if (mealNutrition.calories >= 900) {
              nutritionFitCons.push("Calorie-dense meal.");
            }
            if (fatCalorieShare >= 0.45) {
              nutritionFitCons.push("Higher fat share than most meals.");
            }

            if (nutritionFitPros.length === 0) {
              nutritionFitPros.push("Balanced option for a typical meal.");
            }
          }

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
          if (nutritionGoals && nutritionGoalSignal > 0.72) {
            mealReasons.push("Aligned with your nutrition goals.");
          }
          if (
            nutritionGoals &&
            remainingCalories !== null &&
            remainingCalories > 0 &&
            remainingCalories < nutritionGoals.calories * 0.25 &&
            mealNutrition.calories <= remainingCalories + 120
          ) {
            mealReasons.push("Fits your remaining calorie budget.");
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
            nutrition: mealNutrition,
            nutritionEstimated,
            nutritionFitScore: nutritionGoalSignal,
            nutritionFitPros: nutritionFitPros.slice(0, 3),
            nutritionFitCons: nutritionFitCons.slice(0, 3),
          };
        })
        .filter((meal): meal is RankedMeal => meal !== null)
        .sort((left, right) => {
          if (nutritionGoals && right.nutritionFitScore !== left.nutritionFitScore) {
            return right.nutritionFitScore - left.nutritionFitScore;
          }
          return right.score - left.score;
        })
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
      const distanceSignal = hasDistanceFilter
        ? clamp(1 - distanceKm / Math.max(maxDistanceMiles * KM_PER_MILE, 0.1), 0, 1)
        : 1 / (1 + distanceKm / 3);

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
      if (
        nutritionGoals &&
        recommendedMeals.some((meal) => meal.reasons.includes("Aligned with your nutrition goals."))
      ) {
        personalReasons.push("Meals here align with your nutrition goals.");
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
