import type { RestaurantSchema } from "@packages/types";

export type RawRestaurant = {
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

export type NormalizedDay = NonNullable<RestaurantSchema["hours"]>[number]["day"];

export type DietaryKey =
  | "vegan"
  | "vegetarian"
  | "glutenFree"
  | "halal"
  | "kosher"
  | "dairyFree"
  | "nutFree";

export type SortKey = "recommended" | "distance" | "rating" | "price" | "name";

export type UserRecord = {
  userId: string;
  createdAtISO: string;
  lastLoginAtISO: string;
  loginCount: number;
  ratings: Record<string, number>;
  mealRatings: Record<string, number>;
};

export type UserLocation = {
  lat: number;
  lng: number;
  label: string;
  source: "manual" | "browser" | "default";
};

export type RankedMeal = {
  meal: RestaurantSchema["menu"][number];
  mealKey: string;
  score: number;
  reasons: string[];
  userMealRating: number | null;
};

export type RankedRestaurant = {
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
