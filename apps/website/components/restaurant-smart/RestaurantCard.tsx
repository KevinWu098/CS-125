import { Clock, MapPin, Star } from "lucide-react";
import React from "react";

import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";

import type { RankedRestaurant, UserRecord } from "./types";
import { formatDistance, getOpenStatus } from "./utils";

type RestaurantCardProps = {
  entry: RankedRestaurant;
  rank: number;
  profile: UserRecord | null;
  pendingRatingRestaurantId: string | null;
  pendingMealRatingKey: string | null;
  onRate: (restaurantId: string, rating: number) => void;
  onRateMeal: (restaurantId: string, mealId: string, rating: number) => void;
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

export function RestaurantCard({
  entry,
  rank,
  profile,
  pendingRatingRestaurantId,
  pendingMealRatingKey,
  onRate,
  onRateMeal,
}: RestaurantCardProps) {
  const { restaurant } = entry;
  const openStatus = getOpenStatus(restaurant.hours);
  const userRating = profile?.ratings[restaurant.id] ?? null;
  const isSaving = pendingRatingRestaurantId === restaurant.id;

  return (
    <Card className="border-slate-200 bg-white shadow-sm transition-shadow hover:shadow-md">
      <CardContent className="p-5">
        <div className="mb-2 flex items-start justify-between gap-4">
          <div className="min-w-0 flex-1">
            <p className="mb-1 text-xs font-medium tracking-wide text-slate-400">#{rank}</p>
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
          {entry.personalSignal > 0.25 && (
            <Badge className="bg-emerald-50 text-emerald-700">Matches your ratings</Badge>
          )}
        </div>

        {entry.personalSignal > 0.25 && entry.personalReasons.length > 0 && (
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
              Recommended Meals
            </p>
            <span className="text-[11px] text-slate-500">Ranked by your preferences + filters</span>
          </div>

          {entry.recommendedMeals.length > 0 ? (
            <div className="flex snap-x gap-3 overflow-x-auto pb-1">
              {entry.recommendedMeals.map((recommendedMeal) => {
                const meal = recommendedMeal.meal;
                const isSavingMeal = pendingMealRatingKey === recommendedMeal.mealKey;

                return (
                  <div
                    key={recommendedMeal.mealKey}
                    className="w-64 shrink-0 snap-start rounded-lg border border-slate-200 bg-white p-3"
                  >
                    <p className="truncate text-sm font-semibold text-slate-900">{meal.name}</p>
                    <p className="mt-0.5 text-xs text-slate-500 capitalize">
                      {meal.category || "Meal"}
                    </p>
                    {meal.description && (
                      <p className="mt-1 line-clamp-2 text-xs text-slate-600">{meal.description}</p>
                    )}
                    <div className="mt-2 flex items-center justify-between">
                      <span className="text-xs font-medium text-slate-700">
                        {meal.priceUSD ? `$${meal.priceUSD.toFixed(2)}` : "Price varies"}
                      </span>
                      <span className="text-xs text-slate-500">
                        {recommendedMeal.userMealRating
                          ? `Your ${recommendedMeal.userMealRating}/5`
                          : "Not rated"}
                      </span>
                    </div>

                    {recommendedMeal.reasons.length > 0 && (
                      <p className="mt-2 line-clamp-2 text-[11px] text-slate-600">
                        {recommendedMeal.reasons.join(" • ")}
                      </p>
                    )}

                    <div className="mt-2 border-t border-slate-200 pt-2">
                      <EditableStars
                        value={recommendedMeal.userMealRating}
                        onSelect={(rating) => onRateMeal(restaurant.id, meal.id, rating)}
                        disabled={isSavingMeal}
                      />
                    </div>
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
