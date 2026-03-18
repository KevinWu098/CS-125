"use client";

import { Flame, Star, Target, Utensils } from "lucide-react";
import Link from "next/link";
import React, { useCallback, useEffect, useMemo, useState } from "react";

import { DEFAULT_NUTRITION_GOALS } from "@/components/restaurant-smart/constants";
import { getRingProgress, sumMealNutrition } from "@/components/restaurant-smart/nutrition";
import type {
  MealHistoryEntry,
  NutritionGoals,
  UserRecord,
} from "@/components/restaurant-smart/types";
import { normalizeProfileRecord, toMealKey } from "@/components/restaurant-smart/utils";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";

type ProfileApiResponse = {
  error?: string;
  user?: UserRecord;
};

const GOAL_FIELDS: Array<{
  key: keyof NutritionGoals;
  label: string;
  suffix: string;
  min: number;
  max: number;
  step: number;
  color: string;
}> = [
  {
    key: "calories",
    label: "Calories",
    suffix: "kcal",
    min: 800,
    max: 4500,
    step: 50,
    color: "#f97316",
  },
  {
    key: "proteinG",
    label: "Protein",
    suffix: "g",
    min: 20,
    max: 320,
    step: 5,
    color: "#16a34a",
  },
  {
    key: "carbsG",
    label: "Carbs",
    suffix: "g",
    min: 20,
    max: 520,
    step: 5,
    color: "#0ea5e9",
  },
  {
    key: "fatG",
    label: "Fat",
    suffix: "g",
    min: 10,
    max: 220,
    step: 5,
    color: "#a855f7",
  },
];

function GoalRing({
  label,
  consumed,
  target,
  color,
  suffix,
}: {
  label: string;
  consumed: number;
  target: number;
  color: string;
  suffix: string;
}) {
  const progress = getRingProgress(consumed, target);
  const cappedProgress = Math.min(progress, 1);
  const radius = 42;
  const circumference = 2 * Math.PI * radius;
  const strokeOffset = circumference * (1 - cappedProgress);

  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="flex items-center justify-between">
        <p className="text-xs font-semibold tracking-wide text-slate-500 uppercase">{label}</p>
        <Badge variant="secondary" className="bg-slate-100 text-slate-700">
          {Math.round(progress * 100)}%
        </Badge>
      </div>

      <div className="mt-3 flex items-center gap-4">
        <div className="relative h-24 w-24">
          <svg viewBox="0 0 96 96" className="h-24 w-24">
            <circle cx="48" cy="48" r={radius} fill="none" stroke="#e2e8f0" strokeWidth="10" />
            <circle
              cx="48"
              cy="48"
              r={radius}
              fill="none"
              stroke={color}
              strokeLinecap="round"
              strokeWidth="10"
              strokeDasharray={circumference}
              strokeDashoffset={strokeOffset}
              transform="rotate(-90 48 48)"
              className="transition-all duration-500"
            />
          </svg>
          <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
            <span className="text-xs font-semibold text-slate-700">{Math.round(consumed)}</span>
          </div>
        </div>

        <div className="text-sm text-slate-600">
          <p>
            <span className="font-semibold text-slate-900">{Math.round(consumed)}</span> /{" "}
            <span className="font-medium">{Math.round(target)}</span> {suffix}
          </p>
          <p className="mt-1 text-xs text-slate-500">Based on meals marked as had.</p>
        </div>
      </div>
    </div>
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
            key={`meal-rating-star-${ratingValue}`}
            type="button"
            className="rounded-sm p-0.5 transition-colors hover:bg-emerald-50 disabled:cursor-not-allowed"
            onClick={() => onSelect(ratingValue)}
            disabled={disabled}
            aria-label={`Rate ${ratingValue} star${ratingValue === 1 ? "" : "s"}`}
          >
            <Star
              className={`size-4 ${active ? "fill-emerald-500 text-emerald-500" : "text-slate-300"}`}
            />
          </button>
        );
      })}
    </div>
  );
}

function formatLoggedAt(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return date.toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function MealHistoryItem({
  entry,
  mealRating,
  onRate,
  isSaving,
}: {
  entry: MealHistoryEntry;
  mealRating: number | null;
  onRate: (rating: number) => void;
  isSaving: boolean;
}) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-sm font-semibold text-slate-900">{entry.mealName}</p>
          <p className="text-xs text-slate-500">{entry.restaurantName}</p>
        </div>
        <p className="text-[11px] text-slate-500">{formatLoggedAt(entry.loggedAtISO)}</p>
      </div>

      <div className="mt-3 grid grid-cols-2 gap-2 text-xs text-slate-600 sm:grid-cols-4">
        <p>
          <span className="font-semibold text-slate-800">
            {Math.round(entry.nutrition.calories)}
          </span>{" "}
          kcal
        </p>
        <p>
          <span className="font-semibold text-slate-800">
            {Math.round(entry.nutrition.proteinG)}g
          </span>{" "}
          protein
        </p>
        <p>
          <span className="font-semibold text-slate-800">
            {Math.round(entry.nutrition.carbsG)}g
          </span>{" "}
          carbs
        </p>
        <p>
          <span className="font-semibold text-slate-800">{Math.round(entry.nutrition.fatG)}g</span>{" "}
          fat
        </p>
      </div>

      <div className="mt-3 flex items-center justify-between gap-3 border-t border-slate-200 pt-3">
        <div className="flex items-center gap-2">
          <span className="text-xs text-slate-500">Meal rating:</span>
          <EditableStars value={mealRating} onSelect={onRate} disabled={isSaving} />
        </div>
        {entry.nutritionEstimated && (
          <Badge variant="secondary" className="bg-amber-100 text-amber-800">
            Estimated nutrition
          </Badge>
        )}
      </div>
    </div>
  );
}

export default function ProfilePage() {
  const [userIdInput, setUserIdInput] = useState("local-foodie");
  const [profile, setProfile] = useState<UserRecord | null>(null);
  const [status, setStatus] = useState<"idle" | "loading" | "ready" | "error">("idle");
  const [error, setError] = useState<string | null>(null);

  const [goalDraft, setGoalDraft] = useState<NutritionGoals>(DEFAULT_NUTRITION_GOALS);
  const [isSavingGoals, setIsSavingGoals] = useState(false);
  const [pendingMealRatingKey, setPendingMealRatingKey] = useState<string | null>(null);

  const loadOrCreateProfile = useCallback(async (requestedUserId: string) => {
    const normalizedUserId = requestedUserId.trim().toLowerCase();
    if (!normalizedUserId) {
      setError("User ID is required.");
      return null;
    }

    setStatus("loading");
    setError(null);

    try {
      const response = await fetch("/api/user-profile", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ userId: normalizedUserId }),
      });

      const payload = (await response.json()) as ProfileApiResponse;
      if (!response.ok || !payload.user) {
        throw new Error(payload.error || "Unable to load profile");
      }

      const normalizedProfile = normalizeProfileRecord(payload.user);
      setProfile(normalizedProfile);
      setGoalDraft(normalizedProfile.nutritionGoals);
      setStatus("ready");
      setUserIdInput(normalizedUserId);

      if (typeof window !== "undefined") {
        window.localStorage.setItem("restaurant.profile.userId", normalizedUserId);
      }

      return normalizedProfile;
    } catch (loadError) {
      setStatus("error");
      setError(loadError instanceof Error ? loadError.message : "Unable to load profile");
      return null;
    }
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    const savedUserId = window.localStorage.getItem("restaurant.profile.userId") || "local-foodie";
    setUserIdInput(savedUserId);
    void loadOrCreateProfile(savedUserId);
  }, [loadOrCreateProfile]);

  const consumedNutrition = useMemo(
    () => sumMealNutrition(profile?.mealHistory || []),
    [profile?.mealHistory],
  );
  const profileStats = useMemo(
    () => [
      {
        label: "Restaurant Ratings",
        value: profile ? Object.keys(profile.ratings).length : 0,
      },
      {
        label: "Meal Ratings",
        value: profile ? Object.keys(profile.mealRatings).length : 0,
      },
      {
        label: "Meals Logged",
        value: profile?.mealHistory.length || 0,
      },
    ],
    [profile],
  );

  const updateProfile = useCallback(
    async (payload: Record<string, unknown>) => {
      let activeProfile = profile;
      if (!activeProfile) {
        activeProfile = await loadOrCreateProfile(userIdInput || "local-foodie");
      }
      if (!activeProfile) {
        return null;
      }

      setError(null);

      try {
        const response = await fetch("/api/user-profile", {
          method: "PATCH",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            userId: activeProfile.userId,
            ...payload,
          }),
        });

        const responseBody = (await response.json()) as ProfileApiResponse;
        if (!response.ok || !responseBody.user) {
          throw new Error(responseBody.error || "Unable to update profile");
        }

        const normalizedProfile = normalizeProfileRecord(responseBody.user);
        setProfile(normalizedProfile);
        return normalizedProfile;
      } catch (updateError) {
        setError(updateError instanceof Error ? updateError.message : "Unable to update profile");
        return null;
      }
    },
    [loadOrCreateProfile, profile, userIdInput],
  );

  const saveGoals = async () => {
    setIsSavingGoals(true);
    const nextProfile = await updateProfile({
      action: "setNutritionGoals",
      nutritionGoals: goalDraft,
    });
    if (nextProfile) {
      setGoalDraft(nextProfile.nutritionGoals);
    }
    setIsSavingGoals(false);
  };

  const handleRateMeal = async (restaurantId: string, mealId: string, rating: number) => {
    const mealKey = toMealKey(restaurantId, mealId);
    setPendingMealRatingKey(mealKey);
    await updateProfile({
      action: "setMealRating",
      restaurantId,
      mealId,
      rating,
    });
    setPendingMealRatingKey(null);
  };

  return (
    <div className="min-h-screen bg-[radial-gradient(circle_at_top_left,_#f0fdf4,_#f8fafc_50%,_#ecfeff)]">
      <header className="border-b border-slate-200/80 bg-white/90 backdrop-blur">
        <div className="mx-auto flex max-w-[1200px] items-center justify-between gap-4 px-4 py-4 sm:px-6">
          <div>
            <p className="text-xs font-semibold tracking-wide text-emerald-600 uppercase">
              RestaurantSmart
            </p>
            <h1 className="text-2xl font-semibold tracking-tight text-slate-900">
              Nutrition Profile
            </h1>
          </div>
          <nav className="flex items-center gap-2 rounded-md border border-slate-200 bg-white p-1">
            <Link
              href="/"
              className="rounded px-3 py-1.5 text-sm font-medium text-slate-600 transition hover:bg-slate-100 hover:text-slate-900"
            >
              Search
            </Link>
            <Link
              href="/profile"
              className="rounded bg-slate-900 px-3 py-1.5 text-sm font-medium text-white transition"
              aria-current="page"
            >
              Profile
            </Link>
          </nav>
        </div>
      </header>

      <main className="mx-auto max-w-[1200px] space-y-4 px-4 py-5 sm:px-6">
        <Card className="border-slate-200 bg-white shadow-sm">
          <CardContent className="space-y-4 p-4">
            <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_auto]">
              <div>
                <p className="text-sm font-semibold text-slate-900">Profile</p>
                <p className="text-xs text-slate-500">
                  Enter your user ID here to load your saved preferences, goals, and history.
                </p>
              </div>
              <div className="flex w-full gap-2 sm:w-auto">
                <input
                  value={userIdInput}
                  onChange={(event) => setUserIdInput(event.target.value)}
                  placeholder="your-user-id"
                  className="h-10 min-w-52 rounded-md border border-slate-300 px-3 text-sm transition outline-none focus:border-emerald-500"
                />
                <Button
                  className="h-10 bg-slate-900 text-white hover:bg-slate-800"
                  disabled={status === "loading"}
                  onClick={() => void loadOrCreateProfile(userIdInput)}
                >
                  {status === "loading" ? "Loading..." : "Load"}
                </Button>
              </div>
            </div>

            <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
              {profileStats.map((stat) => (
                <div
                  key={stat.label}
                  className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2"
                >
                  <p className="text-[11px] font-semibold tracking-wide text-slate-500 uppercase">
                    {stat.label}
                  </p>
                  <p className="mt-1 text-lg font-semibold text-slate-900">{stat.value}</p>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        {error && (
          <Card className="border-rose-200 bg-rose-50">
            <CardContent className="p-3 text-sm text-rose-700">{error}</CardContent>
          </Card>
        )}

        <section className="grid gap-4 lg:grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)]">
          <Card className="border-slate-200 bg-white shadow-sm">
            <CardContent className="space-y-4 p-5">
              <div className="flex items-center gap-2">
                <Target className="size-4 text-emerald-600" />
                <p className="text-sm font-semibold text-slate-900">Daily Nutrition Goals</p>
              </div>

              <div className="grid gap-3 sm:grid-cols-2">
                {GOAL_FIELDS.map((field) => (
                  <label key={field.key} className="space-y-1.5">
                    <span className="text-xs font-semibold tracking-wide text-slate-500 uppercase">
                      {field.label}
                    </span>
                    <div className="flex items-center gap-2">
                      <input
                        type="number"
                        min={field.min}
                        max={field.max}
                        step={field.step}
                        value={goalDraft[field.key]}
                        onChange={(event) => {
                          const parsed = Number.parseInt(event.target.value, 10);
                          if (!Number.isFinite(parsed)) {
                            return;
                          }
                          setGoalDraft((previous) => ({
                            ...previous,
                            [field.key]: Math.min(field.max, Math.max(field.min, parsed)),
                          }));
                        }}
                        className="h-10 w-full rounded-md border border-slate-300 px-3 text-sm outline-none focus:border-emerald-500"
                      />
                      <span className="w-10 text-xs text-slate-500">{field.suffix}</span>
                    </div>
                  </label>
                ))}
              </div>

              <div className="flex items-center justify-between border-t border-slate-200 pt-4">
                <p className="text-xs text-slate-500">
                  Goals are applied to ranking when finding restaurants and meals.
                </p>
                <Button
                  className="bg-emerald-600 text-white hover:bg-emerald-500"
                  disabled={isSavingGoals}
                  onClick={() => void saveGoals()}
                >
                  {isSavingGoals ? "Saving..." : "Save goals"}
                </Button>
              </div>
            </CardContent>
          </Card>

          <Card className="border-slate-200 bg-white shadow-sm">
            <CardContent className="space-y-4 p-5">
              <div className="flex items-center gap-2">
                <Flame className="size-4 text-orange-500" />
                <p className="text-sm font-semibold text-slate-900">Progress Rings</p>
              </div>

              <div className="grid gap-3 sm:grid-cols-2">
                {GOAL_FIELDS.map((field) => (
                  <GoalRing
                    key={`ring-${field.key}`}
                    label={field.label}
                    consumed={consumedNutrition[field.key]}
                    target={goalDraft[field.key]}
                    color={field.color}
                    suffix={field.suffix}
                  />
                ))}
              </div>
            </CardContent>
          </Card>
        </section>

        <Card className="border-slate-200 bg-white shadow-sm">
          <CardContent className="p-5">
            <div className="mb-4 flex items-center justify-between gap-3">
              <div>
                <p className="flex items-center gap-2 text-sm font-semibold text-slate-900">
                  <Utensils className="size-4 text-emerald-600" />
                  Meals You Have Had
                </p>
                <p className="text-xs text-slate-500">
                  Rate meals here. These ratings directly influence your future search results.
                </p>
              </div>
              <Badge variant="secondary" className="bg-slate-100 text-slate-700">
                {profile?.mealHistory.length || 0} logged
              </Badge>
            </div>

            {profile?.mealHistory.length ? (
              <div className="max-h-[55vh] space-y-3 overflow-y-auto pr-1">
                {profile.mealHistory.map((entry) => {
                  const mealKey = toMealKey(entry.restaurantId, entry.mealId);
                  const mealRating = profile.mealRatings[mealKey] || null;
                  const isSaving = pendingMealRatingKey === mealKey;

                  return (
                    <MealHistoryItem
                      key={entry.id}
                      entry={entry}
                      mealRating={mealRating}
                      isSaving={isSaving}
                      onRate={(rating) => {
                        void handleRateMeal(entry.restaurantId, entry.mealId, rating);
                      }}
                    />
                  );
                })}
              </div>
            ) : (
              <div className="rounded-xl border border-dashed border-slate-300 py-10 text-center">
                <p className="text-lg font-semibold text-slate-900">No meals logged yet</p>
                <p className="mt-1 text-sm text-slate-500">
                  On the search page, click "Mark as had" on a recommended meal.
                </p>
                <Button asChild variant="outline" className="mt-4">
                  <Link href="/">Go to search</Link>
                </Button>
              </div>
            )}
          </CardContent>
        </Card>
      </main>
    </div>
  );
}
