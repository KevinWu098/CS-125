import { CircleCheckBig, CircleX, Clock, MapPin, Star } from "lucide-react";
import React from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { HoverCard, HoverCardContent, HoverCardTrigger } from "@/components/ui/hover-card";

import type { RankedRestaurant, UserRecord } from "./types";
import { formatDistance, getOpenStatus } from "./utils";

type RestaurantCardProps = {
  entry: RankedRestaurant;
  rank: number;
  profile: UserRecord | null;
  pendingRatingRestaurantId: string | null;
  pendingLoggedMealKey: string | null;
  onRate: (restaurantId: string, rating: number) => void;
  onMarkMealHad: (restaurantId: string, mealId: string) => void;
};

function PriceTierDisplay({ tier }: { tier?: string }) {
  const resolvedTier = tier || "$$";
  const filled = resolvedTier.length;

  return (
    <span className="font-medium tracking-tight text-slate-700">
      <span>{resolvedTier}</span>
      <span className="text-slate-300">{"$".repeat(4 - filled)}</span>
    </span>
  );
}

function EditableStars({
  value,
  onSelect,
  disabled,
}: {
  value: number | null;
  onSelect: (rating: number) => void;
  disabled?: boolean;
}) {
  return (
    <div className="flex items-center gap-0.5">
      {Array.from({ length: 5 }, (_, index) => {
        const ratingValue = index + 1;
        const active = value !== null && ratingValue <= value;

        return (
          <button
            key={`editable-star-${ratingValue}`}
            type="button"
            className="rounded-sm p-0.5 transition-colors hover:bg-rose-50 disabled:cursor-not-allowed"
            onClick={() => onSelect(ratingValue)}
            disabled={disabled}
            aria-label={`Rate ${ratingValue} star${ratingValue === 1 ? "" : "s"}`}
          >
            <Star
              className={`size-4 ${active ? "fill-rose-500 text-rose-500" : "text-slate-300"}`}
            />
          </button>
        );
      })}
    </div>
  );
}

function nutritionFitTone(score: number): string {
  if (score >= 0.82) {
    return "Excellent fit";
  }
  if (score >= 0.68) {
    return "Good fit";
  }
  if (score >= 0.52) {
    return "Moderate fit";
  }
  return "Low fit";
}

function nutritionFitBadgeClasses(score: number): string {
  if (score >= 0.75) {
    return "border-emerald-200 bg-emerald-100 text-emerald-800";
  }
  if (score >= 0.3) {
    return "border-amber-200 bg-amber-100 text-amber-800";
  }
  return "border-rose-200 bg-rose-100 text-rose-800";
}

export function RestaurantCard({
  entry,
  rank,
  profile,
  pendingRatingRestaurantId,
  pendingLoggedMealKey,
  onRate,
  onMarkMealHad,
}: RestaurantCardProps) {
  const { restaurant } = entry;
  const openStatus = getOpenStatus(restaurant.hours);
  const userRating = profile?.ratings[restaurant.id] ?? null;
  const isSaving = pendingRatingRestaurantId === restaurant.id;
  const hasProfile = profile !== null;

  return (
    <Card className="border-slate-200 bg-white shadow-sm transition-shadow hover:shadow-md">
      <CardContent className="p-5">
        <div className="mb-2 flex items-start justify-between gap-4">
          <div className="min-w-0 flex-1">
            {hasProfile && (
              <p className="mb-1 text-xs font-medium tracking-wide text-slate-400">#{rank}</p>
            )}
            <h3 className="truncate text-lg font-semibold text-slate-900">{restaurant.name}</h3>
            <p className="mt-1 line-clamp-2 text-sm text-slate-600">{restaurant.description}</p>
          </div>
          <div className="shrink-0">
            <PriceTierDisplay tier={restaurant.priceTier} />
          </div>
        </div>

        <div className="mb-3 flex flex-wrap items-center gap-2">
          {restaurant.cuisine.map((cuisine) => (
            <Badge
              key={`${restaurant.id}-${cuisine}`}
              variant="secondary"
              className="bg-slate-100 text-slate-700 capitalize"
            >
              {cuisine}
            </Badge>
          ))}
          {hasProfile && entry.personalSignal > 0.25 && (
            <Badge className="bg-emerald-50 text-emerald-700">Matches your ratings</Badge>
          )}
        </div>

        {hasProfile && entry.personalSignal > 0.25 && entry.personalReasons.length > 0 && (
          <div className="mb-3 rounded-lg border border-emerald-200 bg-emerald-50/70 p-3">
            <p className="mb-2 text-[11px] font-semibold tracking-wide text-emerald-800 uppercase">
              Why This Matches Your Ratings
            </p>
            <ul className="space-y-1.5 text-xs text-emerald-900">
              {entry.personalReasons.map((reason, index) => (
                <li key={`${restaurant.id}-reason-${index}`} className="flex items-start gap-2">
                  <span className="mt-1.5 size-1.5 shrink-0 rounded-full bg-emerald-700" />
                  <span>{reason}</span>
                </li>
              ))}
            </ul>
          </div>
        )}

        <div className="mb-3 flex flex-wrap items-center gap-4 text-sm text-slate-600">
          {hasProfile && (
            <div className="flex items-center gap-2">
              <span className="text-slate-500">Your rating:</span>
              <EditableStars
                value={userRating}
                onSelect={(rating) => onRate(restaurant.id, rating)}
                disabled={isSaving}
              />
              <span className="text-slate-500">
                {userRating ? `${userRating}/5` : "Rate to personalize"}
              </span>
            </div>
          )}

          <div className="flex items-center gap-1.5">
            <MapPin className="size-4 text-slate-500" />
            <span>{formatDistance(entry.distanceKm)}</span>
            <span className="text-slate-400">{restaurant.location.city}</span>
          </div>

          <div
            className={`flex items-center gap-1.5 ${openStatus.isOpen ? "text-emerald-700" : "text-rose-700"}`}
          >
            <Clock className="size-4" />
            <span className="font-medium">{openStatus.isOpen ? "Open" : "Closed"}</span>
            <span className="text-slate-500">{openStatus.nextChange}</span>
          </div>
        </div>

        <div className="mb-3 rounded-xl border border-slate-200 bg-slate-50/80 p-3">
          <div className="mb-2 flex items-center justify-between gap-2">
            <p className="text-xs font-semibold tracking-wide text-slate-700 uppercase">
              {hasProfile ? "Recommended Meals" : "Matching Meals"}
            </p>
            <span className="text-[11px] text-slate-500">
              {hasProfile
                ? "Ranked by your preferences + filters"
                : "Filtered by your current search and meal filters"}
            </span>
          </div>

          {entry.recommendedMeals.length > 0 ? (
            <div className="flex snap-x gap-3 overflow-x-auto pb-1">
              {entry.recommendedMeals.map((recommendedMeal) => {
                const meal = recommendedMeal.meal;
                const isLoggingMeal = pendingLoggedMealKey === recommendedMeal.mealKey;
                const nutritionFitPercent = Math.round(recommendedMeal.nutritionFitScore * 100);
                const nutritionFitLabel = nutritionFitTone(recommendedMeal.nutritionFitScore);

                return (
                  <div
                    key={recommendedMeal.mealKey}
                    className="w-64 shrink-0 snap-start rounded-lg border border-slate-200 bg-white p-3"
                  >
                    {hasProfile ? (
                      <HoverCard openDelay={140} closeDelay={70}>
                        <HoverCardTrigger asChild>
                          <div className="cursor-help rounded-md transition hover:bg-slate-50">
                            <div className="flex items-start justify-between gap-2">
                              <p className="truncate text-sm font-semibold text-slate-900">
                                {meal.name}
                              </p>
                              <Badge
                                variant="secondary"
                                className={`border text-[10px] ${nutritionFitBadgeClasses(recommendedMeal.nutritionFitScore)}`}
                              >
                                {nutritionFitPercent}% fit
                              </Badge>
                            </div>
                            <p className="mt-0.5 text-xs text-slate-500 capitalize">
                              {meal.category || "Meal"}
                            </p>
                            {meal.description && (
                              <p className="mt-1 line-clamp-2 text-xs text-slate-600">
                                {meal.description}
                              </p>
                            )}
                          </div>
                        </HoverCardTrigger>
                        <HoverCardContent
                          align="start"
                          side="top"
                          className="w-72 border-slate-200 bg-white/98 p-3"
                        >
                          <p className="text-xs font-semibold tracking-wide text-slate-700 uppercase">
                            Nutrition Goal Fit
                          </p>
                          <p className="mt-1 text-sm font-semibold text-slate-900">
                            {nutritionFitLabel} ({nutritionFitPercent}%)
                          </p>

                          <div className="mt-2 grid grid-cols-2 gap-2 text-xs text-slate-600">
                            <p>
                              <span className="font-semibold text-slate-900">
                                {Math.round(recommendedMeal.nutrition.calories)}
                              </span>{" "}
                              kcal
                            </p>
                            <p>
                              <span className="font-semibold text-slate-900">
                                {Math.round(recommendedMeal.nutrition.proteinG)}g
                              </span>{" "}
                              protein
                            </p>
                            <p>
                              <span className="font-semibold text-slate-900">
                                {Math.round(recommendedMeal.nutrition.carbsG)}g
                              </span>{" "}
                              carbs
                            </p>
                            <p>
                              <span className="font-semibold text-slate-900">
                                {Math.round(recommendedMeal.nutrition.fatG)}g
                              </span>{" "}
                              fat
                            </p>
                          </div>

                          <div className="mt-3 space-y-3">
                            <div>
                              <p className="text-[11px] font-semibold tracking-wide text-emerald-800 uppercase">
                                Pros
                              </p>
                              {recommendedMeal.nutritionFitPros.length > 0 ? (
                                <ul className="mt-1.5 space-y-1.5">
                                  {recommendedMeal.nutritionFitPros.map((bullet, index) => (
                                    <li
                                      key={`${recommendedMeal.mealKey}-fit-pro-${index}`}
                                      className="flex items-start gap-1.5 text-xs text-emerald-800"
                                    >
                                      <CircleCheckBig className="mt-0.5 size-3 shrink-0" />
                                      <span>{bullet}</span>
                                    </li>
                                  ))}
                                </ul>
                              ) : (
                                <p className="mt-1 text-xs text-slate-500">
                                  No standout strengths for your current goals.
                                </p>
                              )}
                            </div>

                            <div>
                              <p className="text-[11px] font-semibold tracking-wide text-rose-700 uppercase">
                                Cons
                              </p>
                              {recommendedMeal.nutritionFitCons.length > 0 ? (
                                <ul className="mt-1.5 space-y-1.5">
                                  {recommendedMeal.nutritionFitCons.map((bullet, index) => (
                                    <li
                                      key={`${recommendedMeal.mealKey}-fit-con-${index}`}
                                      className="flex items-start gap-1.5 text-xs text-rose-700"
                                    >
                                      <CircleX className="mt-0.5 size-3 shrink-0" />
                                      <span>{bullet}</span>
                                    </li>
                                  ))}
                                </ul>
                              ) : (
                                <p className="mt-1 text-xs text-slate-500">
                                  No major drawbacks for your current goals.
                                </p>
                              )}
                            </div>
                          </div>

                          {recommendedMeal.nutritionEstimated && (
                            <p className="mt-2 text-[11px] text-slate-500">
                              Nutrition values are estimated for this meal.
                            </p>
                          )}
                        </HoverCardContent>
                      </HoverCard>
                    ) : (
                      <div>
                        <div className="flex items-start justify-between gap-2">
                          <p className="truncate text-sm font-semibold text-slate-900">
                            {meal.name}
                          </p>
                        </div>
                        <p className="mt-0.5 text-xs text-slate-500 capitalize">
                          {meal.category || "Meal"}
                        </p>
                        {meal.description && (
                          <p className="mt-1 line-clamp-2 text-xs text-slate-600">
                            {meal.description}
                          </p>
                        )}
                      </div>
                    )}

                    <div className="mt-2 flex items-center justify-between">
                      <span className="text-xs font-medium text-slate-700">
                        {meal.priceUSD ? `$${meal.priceUSD.toFixed(2)}` : "Price varies"}
                      </span>
                      {hasProfile && (
                        <span className="text-xs text-slate-500">
                          {recommendedMeal.userMealRating &&
                            `Your rating ${recommendedMeal.userMealRating}/5`}
                        </span>
                      )}
                    </div>

                    {recommendedMeal.reasons.length > 0 && (
                      <p className="mt-2 line-clamp-2 text-[11px] text-slate-600">
                        {recommendedMeal.reasons.join(" • ")}
                      </p>
                    )}

                    {hasProfile && (
                      <div className="mt-2 border-t border-slate-200 pt-2">
                        <Button
                          variant="outline"
                          className="h-8 w-full text-xs"
                          disabled={isLoggingMeal}
                          onClick={() => onMarkMealHad(restaurant.id, meal.id)}
                        >
                          {isLoggingMeal ? "Adding..." : "Mark as had"}
                        </Button>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          ) : (
            <p className="text-xs text-slate-500">No meals match current meal filters.</p>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
