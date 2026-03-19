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

type RemainingNutritionSnapshot = {
  calories: number;
  proteinG: number;
  carbsG: number;
  fatG: number;
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

function scoreRemainingTarget({
  mealAmount,
  remainingAmount,
  targetAmount,
  minTarget,
  overshootPenaltyWeight,
  extraPenaltyWeight,
}: {
  mealAmount: number;
  remainingAmount: number;
  targetAmount: number;
  minTarget: number;
  overshootPenaltyWeight: number;
  extraPenaltyWeight: number;
}): number {
  const safeTarget = Math.max(targetAmount, minTarget);

  if (remainingAmount <= 0) {
    const extraTolerance = Math.max(safeTarget * 0.75, minTarget);
    const extraPenalty = clamp(mealAmount / extraTolerance, 0, 1);
    return clamp(0.55 - extraPenalty * extraPenaltyWeight, 0.28, 0.55);
  }

  const coverage = clamp(mealAmount / safeTarget, 0, 1);
  const overshootStart = safeTarget * 1.18;
  const overshoot = Math.max(mealAmount - overshootStart, 0);
  const overshootTolerance = Math.max(safeTarget * 0.9, minTarget);
  const overshootPenalty = clamp(overshoot / overshootTolerance, 0, 1);

  return clamp(0.28 + coverage * 0.72 - overshootPenalty * overshootPenaltyWeight, 0, 1);
}

function scoreRemainingCalories(
  mealCalories: number,
  remainingCalories: number,
  targetCalories: number,
): number {
  const safeTargetCalories = Math.max(targetCalories, 180);

  if (remainingCalories <= 0) {
    const extraPenalty = clamp(mealCalories / Math.max(safeTargetCalories * 0.7, 180), 0, 1);
    return clamp(0.52 - extraPenalty * 0.38, 0.3, 0.52);
  }

  const coverage = clamp(mealCalories / safeTargetCalories, 0, 1);
  const overshootStart = safeTargetCalories * 1.15;
  const overshoot = Math.max(mealCalories - overshootStart, 0);
  const overshootTolerance = Math.max(safeTargetCalories * 0.8, 140);
  const overshootPenalty = clamp(overshoot / overshootTolerance, 0, 1);

  return clamp(0.32 + coverage * 0.68 - overshootPenalty * 0.42, 0, 1);
}

function estimateRemainingMealSlots(remainingCalories: number, dailyGoalCalories: number): number {
  const slotCalories = Math.max(dailyGoalCalories * 0.27, 425);
  return clamp(remainingCalories / slotCalories, 1, 4);
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
  const remainingNutrition: RemainingNutritionSnapshot | null =
    nutritionGoals && consumedNutrition
      ? {
          calories: nutritionGoals.calories - consumedNutrition.calories,
          proteinG: nutritionGoals.proteinG - consumedNutrition.proteinG,
          carbsG: nutritionGoals.carbsG - consumedNutrition.carbsG,
          fatG: nutritionGoals.fatG - consumedNutrition.fatG,
        }
      : null;
  const remainingCalories = remainingNutrition ? remainingNutrition.calories : null;
  const remainingMealSlots =
    nutritionGoals && remainingCalories !== null
      ? estimateRemainingMealSlots(Math.max(remainingCalories, 0), nutritionGoals.calories)
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
            mealDietaryMatch(meal, dietary),
          );
          const matchesAllSelectedDietary =
            selectedDietary.length === 0 || dietaryMatches.length === selectedDietary.length;

          if (selectedDietary.length > 0 && !matchesAllSelectedDietary) {
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
          const sugarG = typeof meal.nutrition?.sugarG === "number" ? meal.nutrition.sugarG : null;
          const dessertLike =
            mealCategory === "desserts" ||
            /cookie|brownie|cake|cheesecake|ice cream|gelato|sorbet|milkshake|shake|sundae|churro|donut|dessert/.test(
              mealText,
            );

          const explicitMealNormalized = (explicitMealSignal + 1) / 2;
          const mealCategoryNormalized = (mealCategorySignal + 1) / 2;
          const { nutrition: mealNutrition, estimated: nutritionEstimated } =
            resolveMealNutrition(meal);
          const fatCalorieShare =
            mealNutrition.calories > 0 ? (mealNutrition.fatG * 9) / mealNutrition.calories : 0;

          let nutritionGoalSignal = 0.55;
          let macroRatioSignal = 0.55;
          let calorieSignal = 0.55;
          let proteinGoalSignal = 0.55;
          let proteinDensitySignal = 0.55;
          let carbGoalSignal = 0.55;
          let fatGoalSignal = 0.55;
          if (nutritionGoals) {
            const targetCalories = Math.max(nutritionGoals.calories, 1);
            const dailyProteinCalories = Math.max(nutritionGoals.proteinG, 0) * 4;
            const dailyCarbCalories = Math.max(nutritionGoals.carbsG, 0) * 4;
            const dailyFatCalories = Math.max(nutritionGoals.fatG, 0) * 9;
            const totalDailyMacroCalories =
              dailyProteinCalories + dailyCarbCalories + dailyFatCalories;

            const remainingProtein = remainingNutrition?.proteinG ?? nutritionGoals.proteinG;
            const remainingCarbs = remainingNutrition?.carbsG ?? nutritionGoals.carbsG;
            const remainingFat = remainingNutrition?.fatG ?? nutritionGoals.fatG;
            const remainingProteinCalories = Math.max(remainingProtein, 0) * 4;
            const remainingCarbCalories = Math.max(remainingCarbs, 0) * 4;
            const remainingFatCalories = Math.max(remainingFat, 0) * 9;
            const totalRemainingMacroCalories =
              remainingProteinCalories + remainingCarbCalories + remainingFatCalories;

            const fallbackProteinRatio =
              totalDailyMacroCalories > 0 ? dailyProteinCalories / totalDailyMacroCalories : 0.3;
            const fallbackCarbRatio =
              totalDailyMacroCalories > 0 ? dailyCarbCalories / totalDailyMacroCalories : 0.45;
            const fallbackFatRatio =
              totalDailyMacroCalories > 0 ? dailyFatCalories / totalDailyMacroCalories : 0.25;

            const targetProteinRatio =
              totalRemainingMacroCalories > 0
                ? remainingProteinCalories / totalRemainingMacroCalories
                : fallbackProteinRatio;
            const targetCarbRatio =
              totalRemainingMacroCalories > 0
                ? remainingCarbCalories / totalRemainingMacroCalories
                : fallbackCarbRatio;
            const targetFatRatio =
              totalRemainingMacroCalories > 0
                ? remainingFatCalories / totalRemainingMacroCalories
                : fallbackFatRatio;

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
            const mealSlots = remainingMealSlots ?? 1;
            const proteinTargetPerMeal =
              remainingProtein > 0 ? Math.max(18, remainingProtein / mealSlots) : 0;
            const carbTargetPerMeal =
              remainingCarbs > 0 ? Math.max(18, remainingCarbs / mealSlots) : 0;
            const fatTargetPerMeal = remainingFat > 0 ? Math.max(8, remainingFat / mealSlots) : 0;
            const calorieTargetPerMeal =
              remainingCalories !== null && remainingCalories > 0
                ? clamp(remainingCalories / mealSlots, 220, targetCalories * 0.42)
                : clamp(targetCalories * 0.22, 220, targetCalories * 0.42);

            proteinGoalSignal = scoreRemainingTarget({
              mealAmount: mealNutrition.proteinG,
              remainingAmount: remainingProtein,
              targetAmount: proteinTargetPerMeal,
              minTarget: 12,
              overshootPenaltyWeight: 0.12,
              extraPenaltyWeight: 0.12,
            });

            const proteinPer100Calories =
              mealNutrition.calories > 0
                ? (mealNutrition.proteinG / mealNutrition.calories) * 100
                : 0;
            proteinDensitySignal = clamp((proteinPer100Calories - 3.5) / 5.5, 0, 1);

            const carbNeedSignal = scoreRemainingTarget({
              mealAmount: mealNutrition.carbsG,
              remainingAmount: remainingCarbs,
              targetAmount: carbTargetPerMeal,
              minTarget: 10,
              overshootPenaltyWeight: 0.26 + lowCarbBias * 0.08,
              extraPenaltyWeight: 0.2,
            });
            const carbRatioOver = Math.max(mealCarbRatio - targetCarbRatio, 0);
            const carbRatioSignal = clamp(1 - carbRatioOver / 0.18, 0, 1);
            carbGoalSignal = clamp(carbNeedSignal * 0.72 + carbRatioSignal * 0.28, 0, 1);

            const fatNeedSignal = scoreRemainingTarget({
              mealAmount: mealNutrition.fatG,
              remainingAmount: remainingFat,
              targetAmount: fatTargetPerMeal,
              minTarget: 6,
              overshootPenaltyWeight: 0.28,
              extraPenaltyWeight: 0.22,
            });
            const fatRatioOver = Math.max(mealFatRatio - (targetFatRatio + 0.05), 0);
            const fatRatioSignal = clamp(1 - fatRatioOver / 0.28, 0, 1);
            fatGoalSignal = clamp(fatNeedSignal * 0.74 + fatRatioSignal * 0.26, 0, 1);

            const proteinWeight = 0.4 + highProteinBias * 0.12;
            const carbWeight = 0.26 + lowCarbBias * 0.12;
            const fatWeight = 0.2;
            const densityWeight = 0.14 + highProteinBias * 0.06;
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

            calorieSignal = scoreRemainingCalories(
              mealNutrition.calories,
              remainingCalories ?? nutritionGoals.calories,
              calorieTargetPerMeal,
            );

            nutritionGoalSignal = clamp(macroRatioSignal * 0.72 + calorieSignal * 0.28, 0, 1);
          }

          if (dessertLike) {
            const sugarPenalty =
              sugarG !== null
                ? clamp((sugarG - 16) / 20, 0, 1)
                : mealNutrition.carbsG > 28
                  ? 0.5
                  : 0.2;
            const lowProteinPenalty = clamp((12 - mealNutrition.proteinG) / 12, 0, 1);
            const fatHeavyPenalty = clamp((fatCalorieShare - 0.34) / 0.22, 0, 1);
            const indulgencePenalty =
              0.12 + sugarPenalty * 0.18 + lowProteinPenalty * 0.14 + fatHeavyPenalty * 0.08;

            nutritionGoalSignal = clamp(nutritionGoalSignal - indulgencePenalty, 0, 1);
          }

          const mealScore =
            explicitMealNormalized * 0.24 +
            mealCategoryNormalized * 0.13 +
            dietarySignal * 0.12 +
            mealTextSignal * 0.06 +
            nutritionGoalSignal * 0.45;

          const nutritionFitPros: string[] = [];
          const nutritionFitCons: string[] = [];
          const caloriesPerProteinGram =
            mealNutrition.proteinG > 0
              ? mealNutrition.calories / mealNutrition.proteinG
              : Number.POSITIVE_INFINITY;

          if (nutritionGoals) {
            if (remainingCalories !== null && remainingCalories <= 0) {
              if (mealNutrition.calories <= Math.max(nutritionGoals.calories * 0.08, 180)) {
                nutritionFitPros.push("Keeps calories low after you already hit your goal.");
              } else {
                nutritionFitCons.push("Adds calories after you already hit your goal today.");
              }
            } else if (calorieSignal >= 0.72) {
              nutritionFitPros.push("Fits your remaining calorie budget today.");
            } else if (
              remainingCalories !== null &&
              mealNutrition.calories > remainingCalories + 120
            ) {
              nutritionFitCons.push("Likely exceeds your remaining calories today.");
            } else if (mealNutrition.calories < Math.max(nutritionGoals.calories * 0.1, 150)) {
              nutritionFitCons.push("May not cover enough of what you still need today.");
            }

            const remainingProtein = remainingNutrition?.proteinG ?? nutritionGoals.proteinG;
            if (remainingProtein > 0 && proteinGoalSignal >= 0.72 && proteinDensitySignal >= 0.68) {
              nutritionFitPros.push("Helps close your remaining protein target today.");
            } else if (remainingProtein > 0 && proteinGoalSignal <= 0.45) {
              nutritionFitCons.push("Adds limited protein toward what you still need today.");
            }

            const remainingCarbs = remainingNutrition?.carbsG ?? nutritionGoals.carbsG;
            if (remainingCarbs > 0 && carbGoalSignal >= 0.74) {
              nutritionFitPros.push("Uses your remaining carb budget well.");
            } else if (remainingCarbs <= 0 && mealNutrition.carbsG > 10) {
              nutritionFitCons.push("Adds carbs beyond what you need today.");
            } else if (remainingCarbs > 0 && carbGoalSignal <= 0.45) {
              nutritionFitCons.push("Uses too much of your remaining carb budget.");
            }

            const remainingFat = remainingNutrition?.fatG ?? nutritionGoals.fatG;
            if (remainingFat > 0 && fatGoalSignal >= 0.72) {
              nutritionFitPros.push("Fits your remaining fat budget well.");
            } else if (remainingFat <= 0 && mealNutrition.fatG > 6) {
              nutritionFitCons.push("Adds fat beyond what you need today.");
            } else if (fatGoalSignal <= 0.4 || fatCalorieShare > 0.5) {
              nutritionFitCons.push("Macro balance is less aligned with what you have left today.");
            }

            if (dessertLike) {
              nutritionFitCons.push("Dessert-style meal is a weaker overall nutrition fit.");
            }

            if (macroRatioSignal >= 0.75) {
              nutritionFitPros.push("Macro balance matches what you still need today.");
            }

            if (remainingProtein > 0) {
              if (
                mealNutrition.proteinG >= Math.max(20, nutritionGoals.proteinG * 0.18) &&
                caloriesPerProteinGram <= 28
              ) {
                nutritionFitPros.push("Good protein density for the calories.");
              } else if (
                mealNutrition.proteinG < Math.max(14, nutritionGoals.proteinG * 0.1) &&
                !nutritionFitCons.includes("Adds limited protein toward what you still need today.")
              ) {
                nutritionFitCons.push("Adds limited protein toward what you still need today.");
              }
            }

            if (nutritionFitPros.length === 0 && nutritionGoalSignal >= 0.65) {
              nutritionFitPros.push("Overall fit is solid for what you have left today.");
            }
            if (nutritionFitCons.length === 0 && nutritionGoalSignal <= 0.5) {
              nutritionFitCons.push("Overall fit is weaker for what you have left today.");
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
          ? recommendedMeals.slice(0, 3).reduce((sum, meal) => {
              const mealContribution = nutritionGoals
                ? meal.nutritionFitScore * 0.7 + meal.score * 0.3
                : meal.score;
              return sum + mealContribution;
            }, 0) / Math.min(recommendedMeals.length, 3)
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
      const normalizedCuisineSignal = clamp((cuisineSignal + 1) / 2, 0, 1);
      const cuisineAffinityBoost =
        explicitUserSignal === 0 ? clamp(normalizedCuisineSignal - 0.5, 0, 0.5) * 0.16 : 0;
      const explicitRestaurantBoost = explicitUserSignal * 0.12;
      const qualitySignal = (restaurant.rating?.average || 0) / 5;
      const distanceSignal = hasDistanceFilter
        ? clamp(1 - distanceKm / Math.max(maxDistanceMiles * KM_PER_MILE, 0.1), 0, 1)
        : 1 / (1 + distanceKm / 3);

      const recommendationScore =
        qualitySignal * 0.29 +
        textSignal * 0.22 +
        distanceSignal * 0.17 +
        normalizedPersonalSignal * 0.18 +
        mealSignal * 0.14 +
        cuisineAffinityBoost +
        explicitRestaurantBoost;

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
