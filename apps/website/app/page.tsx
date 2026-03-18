"use client";

import "leaflet/dist/leaflet.css";

import rawRestaurantData from "@packages/data";
import type { RestaurantSchema } from "@packages/types";
import type * as Leaflet from "leaflet";
import { Clock, LocateFixed, MapPin, Search, Star, TrendingUp, UserRound } from "lucide-react";
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Popover,
  PopoverContent,
  PopoverDescription,
  PopoverHeader,
  PopoverTitle,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Slider } from "@/components/ui/slider";

type RawRestaurant = {
  id?: string;
  name?: string;
  description?: string;
  cuisine?: string[];
  priceTier?: string;
  location?: {
    address?: string;
    city?: string;
    state?: string;
    postalCode?: string;
    lat?: number;
    lng?: number;
  };
  hours?: Array<{
    day?: string;
    open?: string;
    close?: string;
  }>;
  menu?: Array<{
    id?: string;
    name?: string;
    description?: string;
    priceUSD?: number | null;
    category?: string;
  }>;
};

type NormalizedDay = NonNullable<RestaurantSchema["hours"]>[number]["day"];

const dayLookup: Record<string, NormalizedDay> = {
  monday: "mon",
  tuesday: "tue",
  wednesday: "wed",
  thursday: "thu",
  friday: "fri",
  saturday: "sat",
  sunday: "sun",
};
const EXCLUDED_CUISINES = new Set(["vegan", "vegetarian"]);
const VEGAN_KEYWORDS = ["vegan", "falafel", "veggie", "vegetable", "plant", "tofu", "salad"];
const VEGETARIAN_KEYWORDS = ["vegetarian", "veggie", "cheese", "egg", "falafel", "salad"];
const GLUTEN_FREE_KEYWORDS = ["gluten free", "gluten-free", "gf", "salad", "bowl"];

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

function normalizeRestaurants(rawRestaurants: RawRestaurant[]): RestaurantSchema[] {
  return rawRestaurants
    .map<RestaurantSchema | null>((restaurant) => {
      const location = restaurant.location;
      const lat = location?.lat;
      const lng = location?.lng;

      if (
        !restaurant.id ||
        !restaurant.name ||
        !Array.isArray(restaurant.cuisine) ||
        !location ||
        typeof lat !== "number" ||
        typeof lng !== "number" ||
        !Number.isFinite(lat) ||
        !Number.isFinite(lng)
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
        restaurant.menu?.map((item, itemIndex) => ({
          id: item.id?.trim() || `${restaurant.id}-item-${itemIndex + 1}`,
          name: item.name?.trim() || `Item ${itemIndex + 1}`,
          description: item.description?.trim() || undefined,
          priceUSD:
            typeof item.priceUSD === "number" && Number.isFinite(item.priceUSD)
              ? item.priceUSD
              : undefined,
          category: normalizeMealCategory(item.category),
        })) ?? [];

      return {
        id: restaurant.id,
        name: restaurant.name,
        description: restaurant.description?.trim() || undefined,
        cuisine: restaurant.cuisine
          .map((cuisine) => cuisine.trim().toLowerCase())
          .filter((cuisine) => cuisine.length > 0 && !EXCLUDED_CUISINES.has(cuisine)),
        priceTier: normalizePriceTier(restaurant.priceTier),
        location: {
          address: location.address?.trim() || "Address unavailable",
          city: location.city?.trim() || "Unknown",
          state: location.state?.trim() || "Unknown",
          postalCode: location.postalCode?.trim() || "00000",
          lat,
          lng,
        },
        hours: normalizedHours.length > 0 ? normalizedHours : undefined,
        menu: menu.length > 0 ? menu : [{ id: `${restaurant.id}-item-1`, name: "Menu item" }],
      };
    })
    .filter((restaurant): restaurant is RestaurantSchema => restaurant !== null);
}

const restaurantData = normalizeRestaurants(rawRestaurantData as RawRestaurant[]);

const rawCuisineOptions = Array.from(
  new Set(restaurantData.flatMap((restaurant) => restaurant.cuisine)),
).sort();
const cuisineOptionSet = new Set(rawCuisineOptions);
const allMealCategories = Array.from(
  new Set(
    restaurantData.flatMap((restaurant) =>
      restaurant.menu
        .map((meal) => meal.category?.trim().toLowerCase())
        .filter(
          (category): category is string => Boolean(category) && !cuisineOptionSet.has(category as string),
        ),
    ),
  ),
).sort();
const allCuisines = rawCuisineOptions;
const allMealPrices = restaurantData
  .flatMap((restaurant) => restaurant.menu.map((meal) => meal.priceUSD))
  .filter((price): price is number => typeof price === "number" && Number.isFinite(price));
const DEFAULT_MAX_MEAL_PRICE =
  allMealPrices.length > 0 ? Math.ceil(Math.max(...allMealPrices)) : 60;
const restaurantsById = new Map(restaurantData.map((restaurant) => [restaurant.id, restaurant]));

const allDietary = [
  "vegan",
  "vegetarian",
  "glutenFree",
  "halal",
  "kosher",
  "dairyFree",
  "nutFree",
] as const;

type DietaryKey = (typeof allDietary)[number];
type SortKey = "recommended" | "distance" | "rating" | "price" | "name";

type UserRecord = {
  userId: string;
  createdAtISO: string;
  lastLoginAtISO: string;
  loginCount: number;
  ratings: Record<string, number>;
  mealRatings: Record<string, number>;
};

type UserLocation = {
  lat: number;
  lng: number;
  label: string;
  source: "manual" | "browser" | "default";
};

type RankedMeal = {
  meal: RestaurantSchema["menu"][number];
  mealKey: string;
  score: number;
  reasons: string[];
  userMealRating: number | null;
};

type RankedRestaurant = {
  restaurant: RestaurantSchema;
  distanceKm: number;
  recommendationScore: number;
  textSignal: number;
  personalSignal: number;
  mealSignal: number;
  userRating: number | null;
  personalReasons: string[];
  recommendedMeals: RankedMeal[];
};

type LeafletModule = typeof Leaflet;

function normalizeProfileRecord(profile: UserRecord): UserRecord {
  return {
    ...profile,
    ratings: profile.ratings,
    mealRatings: profile.mealRatings,
  };
}

const dietaryLabels: Record<DietaryKey, string> = {
  vegan: "Vegan",
  vegetarian: "Vegetarian",
  glutenFree: "Gluten-Free",
  halal: "Halal",
  kosher: "Kosher",
  dairyFree: "Dairy-Free",
  nutFree: "Nut-Free",
};

const DEFAULT_LOCATION: UserLocation = {
  lat: 33.64995,
  lng: -117.83895,
  label: "Campus default",
  source: "default",
};

const KM_PER_MILE = 1.60934;
const METERS_PER_MILE = 1609.34;
const DEFAULT_MAX_DISTANCE_MILES = 5;

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function haversineDistanceKm(
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

function getOpenStatus(hours: RestaurantSchema["hours"]): {
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

function formatDistance(distanceKm: number): string {
  const miles = distanceKm * 0.621371;
  if (miles < 0.1) {
    return "< 0.1 mi";
  }
  return `${miles.toFixed(1)} mi`;
}

function formatCuisineLabel(cuisine: string): string {
  return cuisine.replace(/-/g, " ").replace(/\b\w/g, (character) => character.toUpperCase());
}

function toMealKey(restaurantId: string, mealId: string): string {
  return `${restaurantId}::${mealId}`;
}

function splitMealKey(mealKey: string): {
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

function mealDietaryMatch(
  meal: RestaurantSchema["menu"][number],
  dietary: DietaryKey,
  restaurant: RestaurantSchema,
): boolean {
  if (restaurant.dietarySupport?.[dietary]) {
    return true;
  }

  const mealText = `${meal.name} ${meal.description || ""}`.toLowerCase();
  switch (dietary) {
    case "vegan":
      return VEGAN_KEYWORDS.some((keyword) => mealText.includes(keyword));
    case "vegetarian":
      return VEGETARIAN_KEYWORDS.some((keyword) => mealText.includes(keyword));
    case "glutenFree":
      return GLUTEN_FREE_KEYWORDS.some((keyword) => mealText.includes(keyword));
    default:
      return false;
  }
}

function priceLevel(priceTier?: string): number {
  return priceTier?.length || 2;
}

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

function OpenStreetMapPanel({
  userLocation,
  rankedRestaurants,
  maxDistanceMiles,
}: {
  userLocation: UserLocation;
  rankedRestaurants: RankedRestaurant[];
  maxDistanceMiles: number;
}) {
  const mapContainerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<Leaflet.Map | null>(null);
  const leafletRef = useRef<LeafletModule | null>(null);
  const markerLayerRef = useRef<Leaflet.LayerGroup | null>(null);
  const radiusCircleRef = useRef<Leaflet.Circle | null>(null);
  const [mapReady, setMapReady] = useState(false);

  useEffect(() => {
    let cancelled = false;

    const initializeMap = async () => {
      const container = mapContainerRef.current;
      if (!container || mapRef.current) {
        return;
      }

      const L = await import("leaflet");
      if (cancelled || !mapContainerRef.current) {
        return;
      }

      leafletRef.current = L;

      const map = L.map(mapContainerRef.current, {
        zoomControl: true,
      });
      mapRef.current = map;

      L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
        maxZoom: 19,
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
      }).addTo(map);
      markerLayerRef.current = L.layerGroup().addTo(map);
      map.invalidateSize();
      setMapReady(true);
    };

    void initializeMap();

    return () => {
      cancelled = true;
      setMapReady(false);
      markerLayerRef.current?.clearLayers();
      markerLayerRef.current = null;
      radiusCircleRef.current?.remove();
      radiusCircleRef.current = null;
      if (mapRef.current) {
        mapRef.current.remove();
        mapRef.current = null;
      }
      leafletRef.current = null;
    };
  }, []);

  useEffect(() => {
    if (!mapReady || !mapRef.current || !leafletRef.current) {
      return;
    }

    const map = mapRef.current;
    const L = leafletRef.current;
    const markerLayer = markerLayerRef.current ?? L.layerGroup().addTo(map);
    markerLayerRef.current = markerLayer;
    markerLayer.clearLayers();

    radiusCircleRef.current?.remove();
    const radiusKm = maxDistanceMiles * KM_PER_MILE;
    const radiusCircle = L.circle([userLocation.lat, userLocation.lng], {
      radius: maxDistanceMiles * METERS_PER_MILE,
      color: "#f43f5e",
      weight: 1.5,
      fillColor: "#f43f5e",
      fillOpacity: 0.08,
    }).addTo(map);
    radiusCircleRef.current = radiusCircle;

    const visibleRestaurants = rankedRestaurants
      .filter((entry) => entry.distanceKm <= radiusKm)
      .slice(0, 15);

    const points: Array<[number, number]> = [[userLocation.lat, userLocation.lng]];

    const userMarkerIcon = L.divIcon({
      className: "",
      html: '<span style="display:block;height:14px;width:14px;border-radius:9999px;background:#111827;border:2px solid #ffffff;box-shadow:0 0 0 2px #f43f5e;"></span>',
      iconSize: [14, 14],
      iconAnchor: [7, 7],
    });

    L.marker([userLocation.lat, userLocation.lng], { icon: userMarkerIcon })
      .addTo(markerLayer)
      .bindPopup(`<b>You</b><br/>${userLocation.label}`);

    visibleRestaurants.forEach((entry, index) => {
      const { restaurant } = entry;
      const markerIcon = L.divIcon({
        className: "",
        html: `<span style="display:block;height:11px;width:11px;border-radius:9999px;background:${index < 3 ? "#f43f5e" : "#334155"};border:2px solid #ffffff;"></span>`,
        iconSize: [11, 11],
        iconAnchor: [6, 6],
      });

      L.marker([restaurant.location.lat, restaurant.location.lng], { icon: markerIcon })
        .addTo(markerLayer)
        .bindPopup(`<b>${restaurant.name}</b><br/>${formatDistance(entry.distanceKm)}`);

      points.push([restaurant.location.lat, restaurant.location.lng]);
    });

    const radiusBounds = L.latLng(userLocation.lat, userLocation.lng).toBounds(
      maxDistanceMiles * METERS_PER_MILE,
    );
    const zoomCapByRadius =
      maxDistanceMiles <= 1 ? 13 : maxDistanceMiles <= 3 ? 12 : maxDistanceMiles <= 8 ? 11 : 10;

    const paddedRadiusBounds = radiusBounds.pad(0.35);
    const combinedBounds = L.latLngBounds(points).extend(paddedRadiusBounds);
    if (combinedBounds.isValid() && mapRef.current === map) {
      try {
        map.fitBounds(combinedBounds, { padding: [52, 52], maxZoom: zoomCapByRadius });
      } catch {
        map.setView([userLocation.lat, userLocation.lng], zoomCapByRadius);
      }
    }

    map.invalidateSize();
  }, [mapReady, maxDistanceMiles, rankedRestaurants, userLocation]);

  return (
    <Card className="border-slate-200 bg-white shadow-sm lg:h-[calc(100vh-7rem)]">
      <CardContent className="p-4">
        <div className="mb-3 flex items-center justify-between gap-2">
          <div>
            <p className="text-sm font-semibold text-slate-900">Nearby on OpenStreetMap</p>
            <p className="text-xs text-slate-500">
              {`Map updates as filters change · radius ${maxDistanceMiles} mi`}
            </p>
          </div>
          <Badge variant="secondary" className="bg-slate-100 text-slate-700">
            OSM
          </Badge>
        </div>
        <div
          ref={mapContainerRef}
          className="h-80 overflow-hidden rounded-xl border border-slate-200 lg:h-[calc(100vh-12.5rem)] [&_.leaflet-control-attribution]:text-[10px]"
        />
      </CardContent>
    </Card>
  );
}

function RestaurantCard({
  entry,
  rank,
  profile,
  pendingRatingRestaurantId,
  pendingMealRatingKey,
  onRate,
  onRateMeal,
}: {
  entry: RankedRestaurant;
  rank: number;
  profile: UserRecord | null;
  pendingRatingRestaurantId: string | null;
  pendingMealRatingKey: string | null;
  onRate: (restaurantId: string, rating: number) => void;
  onRateMeal: (restaurantId: string, mealId: string, rating: number) => void;
}) {
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

export default function SearchResultsPage() {
  const [searchQuery, setSearchQuery] = useState("");
  const [mealSearchQuery, setMealSearchQuery] = useState("");
  const [selectedCuisines, setSelectedCuisines] = useState<string[]>([]);
  const [selectedMealCategories, setSelectedMealCategories] = useState<string[]>([]);
  const [selectedDietary, setSelectedDietary] = useState<DietaryKey[]>([]);
  const [priceRange, setPriceRange] = useState<[number, number]>([1, 4]);
  const [maxMealPrice, setMaxMealPrice] = useState(DEFAULT_MAX_MEAL_PRICE);
  const [minRating, setMinRating] = useState(0);
  const [maxDistanceMiles, setMaxDistanceMiles] = useState(DEFAULT_MAX_DISTANCE_MILES);
  const [sortBy, setSortBy] = useState<SortKey>("recommended");

  const [userIdInput, setUserIdInput] = useState("local-foodie");
  const [profile, setProfile] = useState<UserRecord | null>(null);
  const [profileStatus, setProfileStatus] = useState<"idle" | "loading" | "ready" | "error">(
    "idle",
  );
  const [profileError, setProfileError] = useState<string | null>(null);
  const [pendingRatingRestaurantId, setPendingRatingRestaurantId] = useState<string | null>(null);
  const [pendingMealRatingKey, setPendingMealRatingKey] = useState<string | null>(null);

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

  const loadOrCreateProfile = useCallback(async (requestedUserId: string) => {
    const normalizedUserId = requestedUserId.trim().toLowerCase();
    if (!normalizedUserId) {
      setProfileError("User ID is required.");
      return null;
    }

    setProfileStatus("loading");
    setProfileError(null);

    try {
      const response = await fetch("/api/user-profile", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ userId: normalizedUserId }),
      });

      const payload = (await response.json()) as {
        error?: string;
        user?: UserRecord;
      };

      if (!response.ok || !payload.user) {
        throw new Error(payload.error || "Unable to load profile");
      }

      setProfile(normalizeProfileRecord(payload.user));
      setProfileStatus("ready");
      setUserIdInput(normalizedUserId);

      if (typeof window !== "undefined") {
        window.localStorage.setItem("restaurant.profile.userId", normalizedUserId);
      }

      return payload.user;
    } catch (error) {
      setProfileStatus("error");
      setProfileError(error instanceof Error ? error.message : "Unable to load profile");
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

    const savedLocation = window.localStorage.getItem("restaurant.location");
    if (savedLocation) {
      try {
        const parsed = JSON.parse(savedLocation) as UserLocation;
        if (Number.isFinite(parsed.lat) && Number.isFinite(parsed.lng)) {
          syncStoredLocation(parsed);
        }
      } catch {
        syncStoredLocation(DEFAULT_LOCATION);
      }
    }
  }, [loadOrCreateProfile, syncStoredLocation]);

  const cuisineSignals = useMemo(() => {
    if (!profile) {
      return {} as Record<string, number>;
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
  }, [profile]);

  const rankedRestaurants = useMemo(() => {
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
          query && restaurant.menu.some((item) => item.name.toLowerCase().includes(query))
            ? 0.7
            : 0;
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
              mealReasons.push(`Matches meal search for "${mealSearchQuery.trim()}".`);
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
  }, [
    cuisineSignals,
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
    userLocation.lat,
    userLocation.lng,
  ]);

  const activeFilterCount =
    selectedCuisines.length +
    selectedMealCategories.length +
    selectedDietary.length +
    (mealSearchQuery.trim() ? 1 : 0) +
    (maxMealPrice < DEFAULT_MAX_MEAL_PRICE ? 1 : 0) +
    (priceRange[0] !== 1 || priceRange[1] !== 4 ? 1 : 0) +
    (minRating > 0 ? 1 : 0) +
    (maxDistanceMiles !== DEFAULT_MAX_DISTANCE_MILES ? 1 : 0);

  const profileInitials = (profile?.userId || userIdInput || "U").slice(0, 2).toUpperCase();

  const clearAllFilters = () => {
    setSelectedCuisines([]);
    setSelectedMealCategories([]);
    setSelectedDietary([]);
    setPriceRange([1, 4]);
    setMaxMealPrice(DEFAULT_MAX_MEAL_PRICE);
    setMinRating(0);
    setMaxDistanceMiles(DEFAULT_MAX_DISTANCE_MILES);
    setSearchQuery("");
    setMealSearchQuery("");
  };

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

  const updateProfileRating = useCallback(
    async (ratingInput: { restaurantId: string; rating: number; mealId?: string }) => {
      let activeProfile = profile;

      if (!activeProfile) {
        const loadedProfile = await loadOrCreateProfile(userIdInput || "local-foodie");
        if (!loadedProfile) {
          return;
        }
        activeProfile = loadedProfile;
      }

      if (ratingInput.mealId) {
        setPendingMealRatingKey(toMealKey(ratingInput.restaurantId, ratingInput.mealId));
      } else {
        setPendingRatingRestaurantId(ratingInput.restaurantId);
      }
      setProfileError(null);

      try {
        const response = await fetch("/api/user-profile", {
          method: "PATCH",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            userId: activeProfile.userId,
            restaurantId: ratingInput.restaurantId,
            mealId: ratingInput.mealId,
            rating: ratingInput.rating,
          }),
        });

        const responseBody = (await response.json()) as {
          error?: string;
          user?: UserRecord;
        };

        if (!response.ok || !responseBody.user) {
          throw new Error(responseBody.error || "Unable to save rating");
        }

        setProfile(normalizeProfileRecord(responseBody.user));
      } catch (error) {
        setProfileError(error instanceof Error ? error.message : "Unable to save rating");
      } finally {
        if (ratingInput.mealId) {
          setPendingMealRatingKey(null);
        } else {
          setPendingRatingRestaurantId(null);
        }
      }
    },
    [loadOrCreateProfile, profile, userIdInput],
  );

  const handleRateRestaurant = useCallback(
    async (restaurantId: string, rating: number) => {
      await updateProfileRating({ restaurantId, rating });
    },
    [updateProfileRating],
  );

  const handleRateMeal = useCallback(
    async (restaurantId: string, mealId: string, rating: number) => {
      await updateProfileRating({ restaurantId, mealId, rating });
    },
    [updateProfileRating],
  );

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

          <Popover>
            <PopoverTrigger asChild>
              <button
                type="button"
                className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white px-2 py-1 text-sm shadow-sm transition hover:border-slate-300"
              >
                <Avatar size="sm">
                  <AvatarFallback className="bg-slate-900 text-white">
                    {profileInitials}
                  </AvatarFallback>
                </Avatar>
                <span className="hidden pr-1 text-xs font-medium text-slate-700 sm:block">
                  {profile?.userId || "Sign in"}
                </span>
              </button>
            </PopoverTrigger>
            <PopoverContent align="end" className="w-80 border-slate-200">
              <PopoverHeader>
                <div className="flex items-center gap-2">
                  <UserRound className="size-4 text-slate-500" />
                  <PopoverTitle>User Profile</PopoverTitle>
                </div>
                <PopoverDescription>
                  Save ratings with a profile to personalize ranking.
                </PopoverDescription>
              </PopoverHeader>

              <div className="mt-4 space-y-3">
                <input
                  value={userIdInput}
                  onChange={(event) => setUserIdInput(event.target.value)}
                  placeholder="your-user-id"
                  className="h-10 w-full rounded-md border border-slate-300 px-3 text-sm transition outline-none focus:border-rose-500"
                />
                <Button
                  onClick={() => void loadOrCreateProfile(userIdInput)}
                  disabled={profileStatus === "loading"}
                  className="h-10 w-full bg-slate-900 text-white hover:bg-slate-800"
                >
                  {profileStatus === "loading" ? "Loading..." : "Load profile"}
                </Button>
                <p className="text-xs text-slate-500">
                  {profile
                    ? `${Object.keys(profile.ratings).length} restaurant ratings • ${Object.keys(profile.mealRatings).length} meal ratings`
                    : "No profile loaded yet."}
                </p>
                {profileError && <p className="text-xs text-rose-600">{profileError}</p>}
              </div>
            </PopoverContent>
          </Popover>
        </div>
      </header>

      <main className="mx-auto max-w-[1500px] space-y-4 px-4 py-5 sm:px-6">
        <Card className="border-slate-200 bg-white shadow-sm">
          <CardContent className="space-y-5 p-4">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-sm font-semibold text-slate-900">Filters</p>
                <p className="text-xs text-slate-500">
                  Top controls affect both the map and the results list below
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
                {(["recommended", "distance", "rating", "price", "name"] as const).map((option) => (
                  <button
                    key={option}
                    type="button"
                    onClick={() => setSortBy(option)}
                    className={`rounded px-2.5 py-1.5 text-xs font-medium transition sm:text-sm ${
                      sortBy === option
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

            <div className="grid gap-4 lg:grid-cols-[minmax(0,1.15fr)_minmax(0,1.2fr)_minmax(0,0.9fr)_minmax(0,0.9fr)_minmax(0,1fr)]">
              <fieldset>
                <legend className="mb-2 text-xs font-semibold tracking-wide text-slate-500 uppercase">
                  Cuisine
                </legend>
                <div className="min-h-56 space-y-2 pr-1">
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

              <fieldset>
                <legend className="mb-2 text-xs font-semibold tracking-wide text-slate-500 uppercase">
                  Dietary
                </legend>
                <div className="space-y-2 pr-1">
                  {allDietary.map((dietary) => (
                    <label key={dietary} className="flex cursor-pointer items-center gap-2">
                      <Checkbox
                        checked={selectedDietary.includes(dietary)}
                        onCheckedChange={(checked) => {
                          setSelectedDietary(
                            checked
                              ? [...selectedDietary, dietary]
                              : selectedDietary.filter((entry) => entry !== dietary),
                          );
                        }}
                      />
                      <span className="text-sm text-slate-700">{dietaryLabels[dietary]}</span>
                    </label>
                  ))}
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
                  min={1}
                  max={20}
                  step={1}
                />
                <p className="mt-2 text-sm text-slate-500">Within {maxDistanceMiles} mi</p>
              </div>

              <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
                <div className="mb-2 flex items-center gap-2">
                  <MapPin className="size-4 text-slate-500" />
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
                </div>
                <p className="mt-2 text-xs text-slate-500">Current: {userLocation.label}</p>
                {locationError && <p className="mt-2 text-xs text-rose-600">{locationError}</p>}
              </div>
            </div>

            {(selectedCuisines.length > 0 ||
              selectedMealCategories.length > 0 ||
              selectedDietary.length > 0 ||
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
                {selectedDietary.map((dietary) => (
                  <Badge
                    key={`active-dietary-${dietary}`}
                    variant="secondary"
                    className="cursor-pointer bg-slate-100 text-slate-700"
                    onClick={() =>
                      setSelectedDietary(selectedDietary.filter((entry) => entry !== dietary))
                    }
                  >
                    {dietaryLabels[dietary]}
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
                </div>

                {rankedRestaurants.length > 0 ? (
                  <div className="max-h-[calc(100vh-13rem)] space-y-4 overflow-y-auto pr-1">
                    {rankedRestaurants.map((entry, index) => (
                      <RestaurantCard
                        key={entry.restaurant.id}
                        entry={entry}
                        rank={index + 1}
                        profile={profile}
                        pendingRatingRestaurantId={pendingRatingRestaurantId}
                        pendingMealRatingKey={pendingMealRatingKey}
                        onRate={(restaurantId, rating) => {
                          void handleRateRestaurant(restaurantId, rating);
                        }}
                        onRateMeal={(restaurantId, mealId, rating) => {
                          void handleRateMeal(restaurantId, mealId, rating);
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
