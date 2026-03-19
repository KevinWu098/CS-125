"use client";

import "leaflet/dist/leaflet.css";

import { LocateFixed, Search, TrendingUp } from "lucide-react";
import Link from "next/link";
import React, { useCallback, useEffect, useState } from "react";

import {
  DEFAULT_LOCATION,
  DEFAULT_MAX_DISTANCE_MILES,
  dietaryLabels,
} from "@/components/restaurant-smart/constants";
import {
  allCuisines,
  allMealCategories,
  DEFAULT_MAX_MEAL_PRICE,
} from "@/components/restaurant-smart/data";
import { OpenStreetMapPanel } from "@/components/restaurant-smart/OpenStreetMapPanel";
import { RestaurantCard } from "@/components/restaurant-smart/RestaurantCard";
import type {
  RankedRestaurant,
  SortKey,
  UserLocation,
  UserRecord,
} from "@/components/restaurant-smart/types";
import { normalizeProfileRecord, toMealKey } from "@/components/restaurant-smart/utils";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Slider } from "@/components/ui/slider";

type ProfileApiResponse = {
  error?: string;
  user?: UserRecord;
};

type SearchApiResponse = {
  error?: string;
  results?: RankedRestaurant[];
};

export default function SearchResultsPage() {
  const [searchQuery, setSearchQuery] = useState("");
  const [mealSearchQuery, setMealSearchQuery] = useState("");
  const [selectedCuisines, setSelectedCuisines] = useState<string[]>([]);
  const [selectedMealCategories, setSelectedMealCategories] = useState<string[]>([]);
  const [priceRange, setPriceRange] = useState<[number, number]>([1, 4]);
  const [maxMealPrice, setMaxMealPrice] = useState(DEFAULT_MAX_MEAL_PRICE);
  const [minRating, setMinRating] = useState(0);
  const [maxDistanceMiles, setMaxDistanceMiles] = useState(DEFAULT_MAX_DISTANCE_MILES);
  const [sortBy, setSortBy] = useState<SortKey>("distance");

  const [profile, setProfile] = useState<UserRecord | null>(null);
  const [profileError, setProfileError] = useState<string | null>(null);
  const [pendingRatingRestaurantId, setPendingRatingRestaurantId] = useState<string | null>(null);
  const [pendingLoggedMealKey, setPendingLoggedMealKey] = useState<string | null>(null);

  const [rankedRestaurants, setRankedRestaurants] = useState<RankedRestaurant[]>([]);
  const [isSearchLoading, setIsSearchLoading] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);

  const [userLocation, setUserLocation] = useState<UserLocation>(DEFAULT_LOCATION);
  const [latInput, setLatInput] = useState(DEFAULT_LOCATION.lat.toFixed(6));
  const [lngInput, setLngInput] = useState(DEFAULT_LOCATION.lng.toFixed(6));
  const [locationError, setLocationError] = useState<string | null>(null);
  const [isLocating, setIsLocating] = useState(false);

  const syncStoredLocation = useCallback((nextLocation: UserLocation) => {
    setUserLocation(nextLocation);
    setLatInput(nextLocation.lat.toFixed(6));
    setLngInput(nextLocation.lng.toFixed(6));

    if (typeof window !== "undefined") {
      window.localStorage.setItem("restaurant.location", JSON.stringify(nextLocation));
    }
  }, []);

  const getStoredUserId = useCallback((): string | null => {
    if (typeof window === "undefined") {
      return null;
    }

    return window.localStorage.getItem("restaurant.profile.userId");
  }, []);

  const loadOrCreateProfile = useCallback(async (requestedUserId: string) => {
    const normalizedUserId = requestedUserId.trim().toLowerCase();
    if (!normalizedUserId) {
      setProfileError("User ID is required.");
      return null;
    }
    setProfileError(null);

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

      if (typeof window !== "undefined") {
        window.localStorage.setItem("restaurant.profile.userId", normalizedUserId);
      }

      return normalizedProfile;
    } catch (error) {
      setProfileError(error instanceof Error ? error.message : "Unable to load profile");
      return null;
    }
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    const savedUserId = getStoredUserId();
    if (savedUserId) {
      void loadOrCreateProfile(savedUserId);
    }

    const savedLocation = window.localStorage.getItem("restaurant.location");
    if (!savedLocation) {
      return;
    }

    try {
      const parsed = JSON.parse(savedLocation) as UserLocation;
      if (Number.isFinite(parsed.lat) && Number.isFinite(parsed.lng)) {
        syncStoredLocation(parsed);
      }
    } catch {
      syncStoredLocation(DEFAULT_LOCATION);
    }
  }, [getStoredUserId, loadOrCreateProfile, syncStoredLocation]);

  useEffect(() => {
    if (!profile && sortBy === "recommended") {
      setSortBy("distance");
    }
  }, [profile, sortBy]);

  const hasProfile = profile !== null;
  const visibleSortOptions: SortKey[] = hasProfile
    ? ["recommended", "distance", "rating", "price", "name"]
    : ["distance", "rating", "price", "name"];
  const effectiveSortBy = hasProfile ? sortBy : sortBy === "recommended" ? "distance" : sortBy;

  useEffect(() => {
    const abortController = new AbortController();

    const runSearch = async () => {
      setIsSearchLoading(true);
      setSearchError(null);

      try {
        const response = await fetch("/api/search", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          signal: abortController.signal,
          body: JSON.stringify({
            searchQuery,
            mealSearchQuery,
            selectedCuisines,
            selectedMealCategories,
            priceRange,
            minRating,
            maxDistanceMiles,
            maxMealPrice,
            sortBy: effectiveSortBy,
            userLocation,
            profile,
          }),
        });

        const payload = (await response.json()) as SearchApiResponse;
        if (!response.ok) {
          throw new Error(payload.error || "Search failed");
        }

        setRankedRestaurants(payload.results || []);
      } catch (error) {
        if (abortController.signal.aborted) {
          return;
        }
        setSearchError(error instanceof Error ? error.message : "Search failed");
        setRankedRestaurants([]);
      } finally {
        if (!abortController.signal.aborted) {
          setIsSearchLoading(false);
        }
      }
    };

    void runSearch();

    return () => {
      abortController.abort();
    };
  }, [
    maxDistanceMiles,
    maxMealPrice,
    mealSearchQuery,
    minRating,
    priceRange,
    profile,
    searchQuery,
    selectedCuisines,
    selectedMealCategories,
    sortBy,
    userLocation,
    effectiveSortBy,
  ]);

  const updateProfile = useCallback(
    async (patch: Record<string, unknown>): Promise<UserRecord | null> => {
      if (!profile) {
        setProfileError("Log in on the Profile page to save ratings and meal history.");
        return null;
      }

      setProfileError(null);

      try {
        const response = await fetch("/api/user-profile", {
          method: "PATCH",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            userId: profile.userId,
            ...patch,
          }),
        });

        const payload = (await response.json()) as ProfileApiResponse;
        if (!response.ok || !payload.user) {
          throw new Error(payload.error || "Unable to update profile");
        }

        const normalizedProfile = normalizeProfileRecord(payload.user);
        setProfile(normalizedProfile);
        return normalizedProfile;
      } catch (error) {
        setProfileError(error instanceof Error ? error.message : "Unable to update profile");
        return null;
      }
    },
    [profile],
  );

  const handleRateRestaurant = useCallback(
    async (restaurantId: string, rating: number) => {
      if (!profile) {
        return;
      }
      setPendingRatingRestaurantId(restaurantId);
      await updateProfile({
        action: "setRestaurantRating",
        restaurantId,
        rating,
      });
      setPendingRatingRestaurantId(null);
    },
    [profile, updateProfile],
  );

  const handleLogMeal = useCallback(
    async (restaurantId: string, mealId: string) => {
      if (!profile) {
        return;
      }
      const mealKey = toMealKey(restaurantId, mealId);
      setPendingLoggedMealKey(mealKey);
      await updateProfile({
        action: "logMeal",
        restaurantId,
        mealId,
      });
      setPendingLoggedMealKey(null);
    },
    [profile, updateProfile],
  );

  const applyManualLocation = () => {
    const parsedLat = Number.parseFloat(latInput);
    const parsedLng = Number.parseFloat(lngInput);

    if (!Number.isFinite(parsedLat) || !Number.isFinite(parsedLng)) {
      setLocationError("Latitude and longitude must be valid numbers.");
      return;
    }

    if (Math.abs(parsedLat) > 90 || Math.abs(parsedLng) > 180) {
      setLocationError("Latitude must be -90..90 and longitude must be -180..180.");
      return;
    }

    setLocationError(null);
    syncStoredLocation({
      lat: parsedLat,
      lng: parsedLng,
      label: "Manual location",
      source: "manual",
    });
  };

  const useCurrentLocation = () => {
    setIsLocating(true);
    setLocationError(null);

    navigator.geolocation.getCurrentPosition(
      (position) => {
        setIsLocating(false);
        syncStoredLocation({
          lat: position.coords.latitude,
          lng: position.coords.longitude,
          label: "Current location",
          source: "browser",
        });
      },
      (error) => {
        setIsLocating(false);
        setLocationError(error.message || "Could not get your current location.");
      },
      {
        enableHighAccuracy: true,
        timeout: 10000,
      },
    );
  };

  const clearAllFilters = () => {
    setSelectedCuisines([]);
    setSelectedMealCategories([]);
    setPriceRange([1, 4]);
    setMaxMealPrice(DEFAULT_MAX_MEAL_PRICE);
    setMinRating(0);
    setMaxDistanceMiles(DEFAULT_MAX_DISTANCE_MILES);
    setSearchQuery("");
    setMealSearchQuery("");
    setLocationError(null);
    syncStoredLocation(DEFAULT_LOCATION);
  };

  const activeFilterCount =
    selectedCuisines.length +
    selectedMealCategories.length +
    (mealSearchQuery.trim() ? 1 : 0) +
    (maxMealPrice < DEFAULT_MAX_MEAL_PRICE ? 1 : 0) +
    (priceRange[0] !== 1 || priceRange[1] !== 4 ? 1 : 0) +
    (minRating > 0 ? 1 : 0) +
    (maxDistanceMiles !== DEFAULT_MAX_DISTANCE_MILES ? 1 : 0) +
    (userLocation.source !== "default" ? 1 : 0);

  return (
    <div className="min-h-screen bg-[radial-gradient(circle_at_top_left,_#fff7ed,_#f8fafc_50%,_#f1f5f9)]">
      <header className="sticky top-0 z-30 border-b border-slate-200/80 bg-white/95 backdrop-blur">
        <div className="mx-auto flex max-w-[1500px] items-center justify-between gap-4 px-4 py-4 sm:px-6">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight text-slate-900 sm:text-3xl">
              RestaurantSmart
            </h1>
            <p className="mt-1 text-sm text-slate-600">Filter-first search with live map results</p>
          </div>

          <nav className="flex items-center gap-2 rounded-md border border-slate-200 bg-white p-1">
            <Link
              href="/"
              className="rounded bg-slate-900 px-3 py-1.5 text-sm font-medium text-white transition"
              aria-current="page"
            >
              Search
            </Link>
            <Link
              href="/profile"
              className="rounded px-3 py-1.5 text-sm font-medium text-slate-600 transition hover:bg-slate-100 hover:text-slate-900"
            >
              Profile
            </Link>
          </nav>
        </div>
      </header>

      <main className="mx-auto max-w-[1500px] space-y-4 px-4 py-5 sm:px-6">
        {profileError && (
          <Card className="border-rose-200 bg-rose-50">
            <CardContent className="p-3 text-sm text-rose-700">{profileError}</CardContent>
          </Card>
        )}

        {!hasProfile && (
          <Card className="border-amber-200 bg-amber-50">
            <CardContent className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <p className="text-sm font-semibold text-amber-900">Browsing without a profile</p>
                <p className="text-xs text-amber-800">
                  Log in on the Profile page to enable recommended sorting, nutrition fit,
                  restaurant ratings, and meal tracking.
                </p>
              </div>
              <Button
                asChild
                variant="outline"
                className="border-amber-300 bg-white text-amber-900"
              >
                <Link href="/profile">Log in</Link>
              </Button>
            </CardContent>
          </Card>
        )}

        <Card className="border-slate-200 bg-white shadow-sm">
          <CardContent className="space-y-5 p-4">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-sm font-semibold text-slate-900">Filters</p>
                <p className="text-xs text-slate-500">
                  {hasProfile
                    ? "Top controls affect both the map and the results list below. Dietary restrictions are applied from your profile."
                    : "Top controls affect both the map and the results list below. Log in to unlock profile-based recommendations."}
                </p>
              </div>
              <div className="flex items-center gap-2">
                {activeFilterCount > 0 && (
                  <Badge className="bg-rose-500 text-white">{activeFilterCount} active</Badge>
                )}
                <Button variant="ghost" size="sm" onClick={clearAllFilters}>
                  Reset
                </Button>
              </div>
            </div>

            <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-center">
              <div className="relative">
                <Search className="absolute top-1/2 left-3 size-4 -translate-y-1/2 text-slate-400" />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(event) => setSearchQuery(event.target.value)}
                  placeholder="Search by restaurant, cuisine, or dish"
                  className="h-11 w-full rounded-md border border-slate-300 bg-white pr-3 pl-10 text-sm transition outline-none focus:border-rose-500"
                />
              </div>

              <div className="flex flex-wrap rounded-md border border-slate-200 bg-white p-1">
                {visibleSortOptions.map((option) => (
                  <button
                    key={option}
                    type="button"
                    onClick={() => setSortBy(option)}
                    className={`rounded px-2.5 py-1.5 text-xs font-medium transition sm:text-sm ${
                      effectiveSortBy === option
                        ? "bg-slate-900 text-white"
                        : "text-slate-500 hover:bg-slate-100 hover:text-slate-900"
                    }`}
                  >
                    {option === "recommended" && "Recommended"}
                    {option === "distance" && "Distance"}
                    {option === "rating" && "Top Rated"}
                    {option === "price" && "Price"}
                    {option === "name" && "Name"}
                  </button>
                ))}
              </div>
            </div>

            <div className="grid gap-4 lg:grid-cols-[minmax(0,1.2fr)_minmax(0,1.2fr)_minmax(0,1fr)_minmax(0,1fr)]">
              <fieldset>
                <legend className="mb-2 text-xs font-semibold tracking-wide text-slate-500 uppercase">
                  Cuisine
                </legend>
                <div className="h-[17rem] space-y-2 overflow-y-auto rounded-lg border border-slate-200 bg-slate-50 p-3 pr-2">
                  {allCuisines.map((cuisine) => (
                    <label key={cuisine} className="flex cursor-pointer items-center gap-2">
                      <Checkbox
                        checked={selectedCuisines.includes(cuisine)}
                        onCheckedChange={(checked) => {
                          setSelectedCuisines(
                            checked
                              ? [...selectedCuisines, cuisine]
                              : selectedCuisines.filter((entry) => entry !== cuisine),
                          );
                        }}
                      />
                      <span className="text-sm text-slate-700 capitalize">{cuisine}</span>
                    </label>
                  ))}
                </div>
              </fieldset>

              <fieldset>
                <legend className="mb-2 text-xs font-semibold tracking-wide text-slate-500 uppercase">
                  Meal Focus
                </legend>
                <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
                  <div className="relative">
                    <Search className="absolute top-1/2 left-3 size-3.5 -translate-y-1/2 text-slate-400" />
                    <input
                      type="text"
                      value={mealSearchQuery}
                      onChange={(event) => setMealSearchQuery(event.target.value)}
                      placeholder="Search meals"
                      className="h-9 w-full rounded-md border border-slate-300 bg-white pr-3 pl-9 text-sm transition outline-none focus:border-rose-500"
                    />
                  </div>

                  <p className="mt-3 mb-1 text-[11px] font-semibold tracking-wide text-slate-500 uppercase">
                    Meal categories
                  </p>
                  <div className="max-h-32 space-y-1.5 overflow-y-auto pr-1">
                    {allMealCategories.map((category) => (
                      <label key={category} className="flex cursor-pointer items-center gap-2">
                        <Checkbox
                          checked={selectedMealCategories.includes(category)}
                          onCheckedChange={(checked) => {
                            setSelectedMealCategories(
                              checked
                                ? [...selectedMealCategories, category]
                                : selectedMealCategories.filter((entry) => entry !== category),
                            );
                          }}
                        />
                        <span className="text-sm text-slate-700 capitalize">{category}</span>
                      </label>
                    ))}
                  </div>

                  <p className="mt-3 mb-1 text-[11px] font-semibold tracking-wide text-slate-500 uppercase">
                    Max meal price
                  </p>
                  <Slider
                    value={[maxMealPrice]}
                    onValueChange={(value) => setMaxMealPrice(value[0])}
                    min={1}
                    max={DEFAULT_MAX_MEAL_PRICE}
                    step={1}
                  />
                  <p className="mt-1 text-sm text-slate-500">
                    {maxMealPrice >= DEFAULT_MAX_MEAL_PRICE
                      ? "Any meal price"
                      : `Up to $${maxMealPrice}`}
                  </p>
                </div>
              </fieldset>

              <div>
                <p className="mb-2 text-xs font-semibold tracking-wide text-slate-500 uppercase">
                  Price Range
                </p>
                <Slider
                  value={priceRange}
                  onValueChange={(value) => setPriceRange(value as [number, number])}
                  min={1}
                  max={4}
                  step={1}
                />
                <div className="mt-2 flex justify-between text-sm text-slate-500">
                  <span>{"$".repeat(priceRange[0])}</span>
                  <span>{"$".repeat(priceRange[1])}</span>
                </div>

                <p className="mt-4 mb-2 text-xs font-semibold tracking-wide text-slate-500 uppercase">
                  Minimum Rating
                </p>
                <Slider
                  value={[minRating]}
                  onValueChange={(value) => setMinRating(value[0])}
                  min={0}
                  max={5}
                  step={0.5}
                />
                <p className="mt-2 text-sm text-slate-500">
                  {minRating > 0 ? `${minRating}+` : "Any"}
                </p>

                <p className="mt-4 mb-2 text-xs font-semibold tracking-wide text-slate-500 uppercase">
                  Distance Radius
                </p>
                <Slider
                  value={[maxDistanceMiles]}
                  onValueChange={(value) => setMaxDistanceMiles(value[0])}
                  min={0}
                  max={20}
                  step={1}
                />
                <p className="mt-2 text-sm text-slate-500">
                  {maxDistanceMiles > 0 ? `Within ${maxDistanceMiles} mi` : "Any distance"}
                </p>
              </div>

              <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
                <div className="mb-2 flex items-center gap-2">
                  <LocateFixed className="size-4 text-slate-500" />
                  <p className="text-sm font-semibold text-slate-900">Search origin</p>
                </div>
                <div className="grid gap-2">
                  <input
                    value={latInput}
                    onChange={(event) => setLatInput(event.target.value)}
                    placeholder="Latitude"
                    className="h-10 rounded-md border border-slate-300 px-3 text-sm transition outline-none focus:border-rose-500"
                  />
                  <input
                    value={lngInput}
                    onChange={(event) => setLngInput(event.target.value)}
                    placeholder="Longitude"
                    className="h-10 rounded-md border border-slate-300 px-3 text-sm transition outline-none focus:border-rose-500"
                  />
                </div>
                <div className="mt-2 flex flex-wrap gap-2">
                  <Button variant="outline" className="h-9" onClick={applyManualLocation}>
                    Apply coordinates
                  </Button>
                  <Button
                    variant="outline"
                    className="h-9 gap-2"
                    onClick={useCurrentLocation}
                    disabled={isLocating}
                  >
                    <LocateFixed className="size-4" />
                    {isLocating ? "Locating..." : "Use current location"}
                  </Button>
                  <Button
                    variant="outline"
                    className="h-9"
                    onClick={() => {
                      setLocationError(null);
                      syncStoredLocation(DEFAULT_LOCATION);
                    }}
                  >
                    Use campus default
                  </Button>
                </div>
                <p className="mt-2 text-xs text-slate-500">Current: {userLocation.label}</p>
                {locationError && <p className="mt-2 text-xs text-rose-600">{locationError}</p>}
              </div>
            </div>

            {profile?.dietaryRestrictions && profile.dietaryRestrictions.length > 0 && (
              <div className="rounded-md border border-slate-200 bg-slate-50 p-3">
                <div className="flex flex-wrap items-center gap-2">
                  <p className="text-xs font-semibold tracking-wide text-slate-600 uppercase">
                    Profile dietary restrictions
                  </p>
                  {profile.dietaryRestrictions.map((dietary) => (
                    <Badge
                      key={`profile-dietary-${dietary}`}
                      variant="secondary"
                      className="bg-slate-100 text-slate-700"
                    >
                      {dietaryLabels[dietary]}
                    </Badge>
                  ))}
                  <Button asChild variant="ghost" size="sm" className="h-6 px-2 text-xs">
                    <Link href="/profile">Edit in Profile</Link>
                  </Button>
                </div>
              </div>
            )}

            {(selectedCuisines.length > 0 ||
              selectedMealCategories.length > 0 ||
              Boolean(mealSearchQuery.trim()) ||
              maxMealPrice < DEFAULT_MAX_MEAL_PRICE) && (
              <div className="flex flex-wrap gap-2">
                {selectedCuisines.map((cuisine) => (
                  <Badge
                    key={`active-cuisine-${cuisine}`}
                    variant="secondary"
                    className="cursor-pointer bg-slate-100 text-slate-700 capitalize"
                    onClick={() =>
                      setSelectedCuisines(selectedCuisines.filter((entry) => entry !== cuisine))
                    }
                  >
                    {cuisine}
                  </Badge>
                ))}
                {selectedMealCategories.map((category) => (
                  <Badge
                    key={`active-meal-category-${category}`}
                    variant="secondary"
                    className="cursor-pointer bg-slate-100 text-slate-700 capitalize"
                    onClick={() =>
                      setSelectedMealCategories(
                        selectedMealCategories.filter((entry) => entry !== category),
                      )
                    }
                  >
                    Meal: {category}
                  </Badge>
                ))}
                {mealSearchQuery.trim() && (
                  <Badge
                    variant="secondary"
                    className="cursor-pointer bg-slate-100 text-slate-700"
                    onClick={() => setMealSearchQuery("")}
                  >
                    Meal search: {mealSearchQuery.trim()}
                  </Badge>
                )}
                {maxMealPrice < DEFAULT_MAX_MEAL_PRICE && (
                  <Badge
                    variant="secondary"
                    className="cursor-pointer bg-slate-100 text-slate-700"
                    onClick={() => setMaxMealPrice(DEFAULT_MAX_MEAL_PRICE)}
                  >
                    Max meal ${maxMealPrice}
                  </Badge>
                )}
              </div>
            )}
          </CardContent>
        </Card>

        <div className="grid gap-4 lg:grid-cols-2">
          <section className="lg:sticky lg:top-20">
            <OpenStreetMapPanel
              userLocation={userLocation}
              rankedRestaurants={rankedRestaurants}
              maxDistanceMiles={maxDistanceMiles}
            />
          </section>

          <section>
            <Card className="border-slate-200 bg-white shadow-sm">
              <CardContent className="p-4">
                <div className="mb-4 flex flex-wrap items-center gap-2 text-sm text-slate-600">
                  <TrendingUp className="size-4 text-rose-500" />
                  <span>
                    <span className="font-semibold text-slate-900">{rankedRestaurants.length}</span>{" "}
                    restaurants found
                  </span>
                  {searchQuery && (
                    <span>
                      for <span className="font-medium text-slate-900">"{searchQuery}"</span>
                    </span>
                  )}
                  {isSearchLoading && <span className="text-slate-400">Updating...</span>}
                </div>

                {searchError && (
                  <div className="mb-4 rounded-md border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700">
                    {searchError}
                  </div>
                )}

                {rankedRestaurants.length > 0 ? (
                  <div className="max-h-[calc(100vh-13rem)] space-y-4 overflow-y-auto pr-1">
                    {rankedRestaurants.map((entry, index) => (
                      <RestaurantCard
                        key={entry.restaurant.id}
                        entry={entry}
                        rank={index + 1}
                        profile={profile}
                        pendingRatingRestaurantId={pendingRatingRestaurantId}
                        pendingLoggedMealKey={pendingLoggedMealKey}
                        onRate={(restaurantId, rating) => {
                          void handleRateRestaurant(restaurantId, rating);
                        }}
                        onMarkMealHad={(restaurantId, mealId) => {
                          void handleLogMeal(restaurantId, mealId);
                        }}
                      />
                    ))}
                  </div>
                ) : (
                  <div className="rounded-xl border border-dashed border-slate-300 py-10 text-center">
                    <Search className="mx-auto mb-3 size-7 text-slate-400" />
                    <p className="text-lg font-semibold text-slate-900">No restaurants found</p>
                    <p className="mt-1 text-sm text-slate-500">
                      Try relaxing filters or increasing the distance radius.
                    </p>
                    <Button variant="outline" className="mt-4" onClick={clearAllFilters}>
                      Reset filters
                    </Button>
                  </div>
                )}
              </CardContent>
            </Card>
          </section>
        </div>
      </main>
    </div>
  );
}
