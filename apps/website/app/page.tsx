"use client";

import type { RestaurantSchema } from "@packages/types";
import {
  Clock,
  Leaf,
  MapPin,
  Search,
  SlidersHorizontal,
  Sparkles,
  Star,
  TrendingUp,
  UtensilsCrossed,
  X,
} from "lucide-react";
import React, { useMemo, useState } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Slider } from "@/components/ui/slider";

// Sample data - in production this would come from an API
const sampleData: RestaurantSchema[] = [
  {
    id: "chipotle-mexican-grill",
    name: "Chipotle Mexican Grill",
    description: "American fast casual Mexican restaurant chain",
    cuisine: ["mexican"],
    priceTier: "$",
    rating: { average: 4.2, count: 1847, source: "Google" },
    location: {
      address: "4255 Campus Drive",
      city: "Irvine",
      state: "CA",
      postalCode: "92612",
      lat: 33.6495695,
      lng: -117.8393363,
    },
    hours: [
      { day: "mon", open: "10:45", close: "22:00" },
      { day: "tue", open: "10:45", close: "22:00" },
      { day: "wed", open: "10:45", close: "22:00" },
      { day: "thu", open: "10:45", close: "22:00" },
      { day: "fri", open: "10:45", close: "22:00" },
      { day: "sat", open: "10:45", close: "22:00" },
      { day: "sun", open: "10:45", close: "22:00" },
    ],
    dietarySupport: { vegan: true, vegetarian: true, glutenFree: true },
    menu: [
      {
        id: "chicken-burrito-bowl",
        name: "Chicken Burrito Bowl",
        description: "Grilled chicken with rice, beans, and fresh toppings",
        priceUSD: 10.85,
        category: "Bowls",
      },
      {
        id: "steak-burrito",
        name: "Steak Burrito",
        description: "Tender steak wrapped in a warm flour tortilla",
        priceUSD: 11.75,
        category: "Burritos",
      },
      {
        id: "chips-guacamole",
        name: "Chips & Guacamole",
        description: "Fresh-made guacamole with crispy tortilla chips",
        priceUSD: 5.95,
        category: "Sides",
      },
    ],
  },
  {
    id: "luna-grill",
    name: "Luna Grill",
    description: "Fresh Mediterranean cuisine with bold flavors and healthy options",
    cuisine: ["mediterranean", "grill"],
    priceTier: "$$",
    rating: { average: 4.5, count: 892, source: "Google" },
    location: {
      address: "4143 Campus Drive",
      city: "Irvine",
      state: "CA",
      postalCode: "92612",
      lat: 33.6505518,
      lng: -117.8390659,
    },
    hours: [
      { day: "mon", open: "11:00", close: "20:30" },
      { day: "tue", open: "11:00", close: "20:30" },
      { day: "wed", open: "11:00", close: "20:30" },
      { day: "thu", open: "11:00", close: "20:30" },
      { day: "fri", open: "11:00", close: "20:30" },
    ],
    dietarySupport: {
      vegan: true,
      vegetarian: true,
      glutenFree: true,
      halal: true,
    },
    menu: [
      {
        id: "lamb-kabob",
        name: "Lamb Kabob Plate",
        priceUSD: 16.99,
        category: "Plates",
      },
      {
        id: "chicken-shawarma",
        name: "Chicken Shawarma",
        priceUSD: 14.49,
        category: "Plates",
      },
      {
        id: "falafel-wrap",
        name: "Falafel Wrap",
        priceUSD: 11.99,
        category: "Wraps",
      },
    ],
  },
  {
    id: "blaze-pizza",
    name: "Blaze Pizza",
    description: "Build-your-own artisanal pizzas fired in 180 seconds",
    cuisine: ["pizza", "italian"],
    priceTier: "$",
    rating: { average: 4.3, count: 1203, source: "Google" },
    location: {
      address: "Watson Bridge",
      city: "Irvine",
      state: "CA",
      postalCode: "92616",
      lat: 33.6498111,
      lng: -117.8391137,
    },
    hours: [
      { day: "mon", open: "11:00", close: "22:00" },
      { day: "tue", open: "11:00", close: "22:00" },
      { day: "wed", open: "11:00", close: "22:00" },
      { day: "thu", open: "11:00", close: "22:00" },
      { day: "fri", open: "11:00", close: "22:00" },
      { day: "sat", open: "11:00", close: "22:00" },
      { day: "sun", open: "11:00", close: "22:00" },
    ],
    dietarySupport: { vegan: true, vegetarian: true, glutenFree: true },
    menu: [
      {
        id: "build-your-own",
        name: "Build Your Own Pizza",
        priceUSD: 10.95,
        category: "Pizzas",
      },
      {
        id: "meat-eater",
        name: "Meat Eater",
        priceUSD: 12.95,
        category: "Signature Pizzas",
      },
    ],
  },
  {
    id: "breakfast-republic",
    name: "Breakfast Republic",
    description: "All-day breakfast with creative twists on classic American favorites",
    cuisine: ["american", "breakfast"],
    priceTier: "$$",
    rating: { average: 4.6, count: 2341, source: "Google" },
    location: {
      address: "4213 Campus Drive #P166B",
      city: "Irvine",
      state: "CA",
      postalCode: "92612",
      lat: 33.6504111,
      lng: -117.8377808,
    },
    hours: [
      { day: "mon", open: "07:00", close: "15:00" },
      { day: "tue", open: "07:00", close: "15:00" },
      { day: "wed", open: "07:00", close: "15:00" },
      { day: "thu", open: "07:00", close: "15:00" },
      { day: "fri", open: "07:00", close: "15:00" },
      { day: "sat", open: "07:00", close: "15:00" },
      { day: "sun", open: "07:00", close: "15:00" },
    ],
    dietarySupport: { vegetarian: true, glutenFree: true },
    menu: [
      {
        id: "shrimp-grits",
        name: "Shrimp & Grits",
        priceUSD: 18.5,
        category: "Specialties",
      },
      {
        id: "avocado-toast",
        name: "Avocado Toast",
        priceUSD: 14.0,
        category: "Favorites",
      },
      {
        id: "pancake-flight",
        name: "Pancake Flight",
        priceUSD: 16.0,
        category: "Pancakes",
      },
    ],
  },
];

const allCuisines = Array.from(new Set(sampleData.flatMap((r) => r.cuisine))).sort();
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

const dietaryLabels: Record<DietaryKey, string> = {
  vegan: "Vegan",
  vegetarian: "Vegetarian",
  glutenFree: "Gluten-Free",
  halal: "Halal",
  kosher: "Kosher",
  dairyFree: "Dairy-Free",
  nutFree: "Nut-Free",
};

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
  const currentTime = `${now.getHours().toString().padStart(2, "0")}:${now.getMinutes().toString().padStart(2, "0")}`;

  const todayHours = hours.find((h) => h.day === currentDay);
  if (!todayHours) {
    return { isOpen: false, nextChange: "Closed today" };
  }

  const isOpen = currentTime >= todayHours.open && currentTime < todayHours.close;
  const nextChange = isOpen
    ? `Closes at ${formatTime(todayHours.close)}`
    : `Opens at ${formatTime(todayHours.open)}`;

  return { isOpen, nextChange };
}

function formatTime(time: string): string {
  const [hours, minutes] = time.split(":").map(Number);
  const period = hours >= 12 ? "PM" : "AM";
  const displayHours = hours % 12 || 12;
  return `${displayHours}:${minutes.toString().padStart(2, "0")} ${period}`;
}

function PriceTierDisplay({ tier }: { tier: string }) {
  const filled = tier.length;
  return (
    <span className="font-medium tracking-tight">
      <span className="text-emerald-600 dark:text-emerald-400">{tier}</span>
      <span className="text-muted-foreground/40">{"$".repeat(4 - filled)}</span>
    </span>
  );
}

function RatingStars({ rating }: { rating: number }) {
  return (
    <div className="flex items-center gap-1">
      <Star className="size-4 fill-amber-400 text-amber-400" />
      <span className="font-semibold">{rating.toFixed(1)}</span>
    </div>
  );
}

function RestaurantCard({ restaurant, rank }: { restaurant: RestaurantSchema; rank: number }) {
  const openStatus = getOpenStatus(restaurant.hours);
  const avgPrice = restaurant.menu.length
    ? restaurant.menu.reduce((sum, item) => sum + (item.priceUSD || 0), 0) /
      restaurant.menu.filter((m) => m.priceUSD).length
    : null;

  return (
    <Card className="group relative overflow-hidden border-0 bg-gradient-to-br from-white to-slate-50/50 shadow-lg shadow-slate-200/50 transition-all duration-300 hover:-translate-y-1 hover:shadow-xl hover:shadow-slate-300/50 dark:from-slate-900 dark:to-slate-800/50 dark:shadow-slate-950/50">
      {/* Rank Badge */}
      <div className="absolute -top-2 -left-2 z-10">
        <div className="relative">
          <div className="absolute inset-0 bg-gradient-to-br from-violet-500 to-indigo-600 opacity-50 blur-lg" />
          <div className="relative flex size-12 items-center justify-center rounded-full bg-gradient-to-br from-violet-500 to-indigo-600 font-bold text-white shadow-lg">
            #{rank}
          </div>
        </div>
      </div>

      <CardContent className="p-6 pt-8">
        <div className="space-y-4">
          {/* Header */}
          <div className="flex items-start justify-between gap-4">
            <div className="min-w-0 flex-1 pl-6">
              <h3 className="truncate text-xl font-bold tracking-tight text-slate-900 dark:text-white">
                {restaurant.name}
              </h3>
              <p className="text-muted-foreground mt-1 line-clamp-2 text-sm">
                {restaurant.description}
              </p>
            </div>
            <div className="flex flex-col items-end gap-1">
              {restaurant.rating && <RatingStars rating={restaurant.rating.average} />}
              {restaurant.priceTier && <PriceTierDisplay tier={restaurant.priceTier} />}
            </div>
          </div>

          {/* Cuisine Tags */}
          <div className="flex flex-wrap gap-1.5">
            {restaurant.cuisine.map((c) => (
              <Badge
                key={c}
                variant="secondary"
                className="bg-slate-100 text-slate-700 capitalize dark:bg-slate-800 dark:text-slate-300"
              >
                {c}
              </Badge>
            ))}
            {restaurant.dietarySupport?.vegan && (
              <Badge className="bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400">
                <Leaf className="mr-1 size-3" />
                Vegan
              </Badge>
            )}
            {restaurant.dietarySupport?.vegetarian && !restaurant.dietarySupport?.vegan && (
              <Badge className="bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400">
                <Leaf className="mr-1 size-3" />
                Vegetarian
              </Badge>
            )}
          </div>

          {/* Info Row */}
          <div className="flex flex-wrap items-center gap-4 text-sm">
            <div className="text-muted-foreground flex items-center gap-1.5">
              <MapPin className="size-4" />
              <span>
                {restaurant.location.city}, {restaurant.location.state}
              </span>
            </div>
            <div
              className={`flex items-center gap-1.5 ${
                openStatus.isOpen
                  ? "text-emerald-600 dark:text-emerald-400"
                  : "text-rose-600 dark:text-rose-400"
              }`}
            >
              <Clock className="size-4" />
              <span className="font-medium">{openStatus.isOpen ? "Open" : "Closed"}</span>
              <span className="text-muted-foreground">· {openStatus.nextChange}</span>
            </div>
          </div>

          {/* Menu Preview */}
          {restaurant.menu.length > 0 && (
            <div className="rounded-xl bg-slate-50 p-4 dark:bg-slate-800/50">
              <div className="text-muted-foreground mb-2 flex items-center gap-2 text-xs font-semibold tracking-wider uppercase">
                <UtensilsCrossed className="size-3" />
                Popular Items
              </div>
              <div className="space-y-2">
                {restaurant.menu.slice(0, 3).map((item) => (
                  <div key={item.id} className="flex items-center justify-between gap-2">
                    <span className="truncate text-sm font-medium text-slate-700 dark:text-slate-300">
                      {item.name}
                    </span>
                    {item.priceUSD && (
                      <span className="shrink-0 text-sm font-semibold text-emerald-600 dark:text-emerald-400">
                        ${item.priceUSD.toFixed(2)}
                      </span>
                    )}
                  </div>
                ))}
              </div>
              {avgPrice && (
                <div className="text-muted-foreground mt-3 border-t border-slate-200 pt-3 text-xs dark:border-slate-700">
                  Average item: ${avgPrice.toFixed(2)}
                </div>
              )}
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

export default function SearchResultsPage() {
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedCuisines, setSelectedCuisines] = useState<string[]>([]);
  const [selectedDietary, setSelectedDietary] = useState<DietaryKey[]>([]);
  const [priceRange, setPriceRange] = useState<[number, number]>([1, 4]);
  const [minRating, setMinRating] = useState(0);
  const [showFilters, setShowFilters] = useState(false);
  const [sortBy, setSortBy] = useState<"rating" | "price" | "name">("rating");

  const filteredRestaurants = useMemo(() => {
    const results = sampleData.filter((restaurant) => {
      // Search query
      if (searchQuery) {
        const query = searchQuery.toLowerCase();
        const matchesName = restaurant.name.toLowerCase().includes(query);
        const matchesCuisine = restaurant.cuisine.some((c) => c.toLowerCase().includes(query));
        const matchesMenu = restaurant.menu.some((m) => m.name.toLowerCase().includes(query));
        if (!matchesName && !matchesCuisine && !matchesMenu) return false;
      }

      // Cuisine filter
      if (
        selectedCuisines.length > 0 &&
        !restaurant.cuisine.some((c) => selectedCuisines.includes(c))
      ) {
        return false;
      }

      // Dietary filter
      if (selectedDietary.length > 0) {
        const hasAllDietary = selectedDietary.every((d) => restaurant.dietarySupport?.[d]);
        if (!hasAllDietary) return false;
      }

      // Price filter
      const priceLevel = restaurant.priceTier?.length || 2;
      if (priceLevel < priceRange[0] || priceLevel > priceRange[1]) {
        return false;
      }

      // Rating filter
      if (restaurant.rating && restaurant.rating.average < minRating) {
        return false;
      }

      return true;
    });

    // Sort
    results.sort((a, b) => {
      switch (sortBy) {
        case "rating":
          return (b.rating?.average || 0) - (a.rating?.average || 0);
        case "price":
          return (a.priceTier?.length || 2) - (b.priceTier?.length || 2);
        case "name":
          return a.name.localeCompare(b.name);
        default:
          return 0;
      }
    });

    return results;
  }, [searchQuery, selectedCuisines, selectedDietary, priceRange, minRating, sortBy]);

  const activeFilterCount =
    selectedCuisines.length +
    selectedDietary.length +
    (priceRange[0] !== 1 || priceRange[1] !== 4 ? 1 : 0) +
    (minRating > 0 ? 1 : 0);

  const clearAllFilters = () => {
    setSelectedCuisines([]);
    setSelectedDietary([]);
    setPriceRange([1, 4]);
    setMinRating(0);
    setSearchQuery("");
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-slate-100 dark:from-slate-950 dark:via-slate-900 dark:to-slate-950">
      {/* Hero Header */}
      <header className="relative overflow-hidden border-b border-slate-200 bg-white/80 backdrop-blur-xl dark:border-slate-800 dark:bg-slate-900/80">
        <div className="absolute inset-0 bg-gradient-to-r from-violet-500/5 via-transparent to-indigo-500/5" />
        <div className="relative mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
          <div className="flex flex-col gap-6">
            {/* Title */}
            <div className="flex items-center gap-3">
              <div className="flex size-12 items-center justify-center rounded-2xl bg-gradient-to-br from-violet-500 to-indigo-600 shadow-lg shadow-violet-500/25">
                <Sparkles className="size-6 text-white" />
              </div>
              <div>
                <h1 className="text-2xl font-bold tracking-tight text-slate-900 sm:text-3xl dark:text-white">
                  Discover Restaurants
                </h1>
                <p className="text-muted-foreground text-sm">Personalized picks near UC Irvine</p>
              </div>
            </div>

            {/* Search Bar */}
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
              <div className="relative flex-1">
                <Search className="text-muted-foreground absolute top-1/2 left-4 size-5 -translate-y-1/2" />
                <input
                  type="text"
                  placeholder="Search restaurants, cuisines, or dishes..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="placeholder:text-muted-foreground h-12 w-full rounded-xl border border-slate-200 bg-white pr-4 pl-12 text-sm shadow-sm transition-all focus:border-violet-500 focus:ring-4 focus:ring-violet-500/10 focus:outline-none dark:border-slate-700 dark:bg-slate-800 dark:focus:border-violet-400"
                />
              </div>
              <Button
                variant="outline"
                className="h-12 gap-2 rounded-xl px-4"
                onClick={() => setShowFilters(!showFilters)}
              >
                <SlidersHorizontal className="size-4" />
                Filters
                {activeFilterCount > 0 && (
                  <Badge className="ml-1 bg-violet-500 text-white">{activeFilterCount}</Badge>
                )}
              </Button>
            </div>

            {/* Filters Panel */}
            {showFilters && (
              <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-lg dark:border-slate-700 dark:bg-slate-800">
                <div className="mb-4 flex items-center justify-between">
                  <h3 className="font-semibold text-slate-900 dark:text-white">Filters</h3>
                  {activeFilterCount > 0 && (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={clearAllFilters}
                      className="text-muted-foreground hover:text-foreground"
                    >
                      <X className="mr-1 size-3" />
                      Clear all
                    </Button>
                  )}
                </div>

                <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
                  {/* Cuisine Filter */}
                  <fieldset>
                    <legend className="text-muted-foreground mb-2 text-xs font-semibold tracking-wider uppercase">
                      Cuisine
                    </legend>
                    <div className="space-y-2">
                      {allCuisines.map((cuisine) => (
                        <div key={cuisine} className="flex items-center gap-2">
                          <Checkbox
                            id={`cuisine-${cuisine}`}
                            checked={selectedCuisines.includes(cuisine)}
                            onCheckedChange={(checked) => {
                              setSelectedCuisines(
                                checked
                                  ? [...selectedCuisines, cuisine]
                                  : selectedCuisines.filter((c) => c !== cuisine),
                              );
                            }}
                          />
                          <span className="text-sm capitalize">{cuisine}</span>
                        </div>
                      ))}
                    </div>
                  </fieldset>

                  {/* Dietary Filter */}
                  <fieldset>
                    <legend className="text-muted-foreground mb-2 text-xs font-semibold tracking-wider uppercase">
                      Dietary
                    </legend>
                    <div className="space-y-2">
                      {allDietary.slice(0, 5).map((dietary) => (
                        <div key={dietary} className="flex items-center gap-2">
                          <Checkbox
                            id={`dietary-${dietary}`}
                            checked={selectedDietary.includes(dietary)}
                            onCheckedChange={(checked) => {
                              setSelectedDietary(
                                checked
                                  ? [...selectedDietary, dietary]
                                  : selectedDietary.filter((d) => d !== dietary),
                              );
                            }}
                          />
                          <span className="text-sm">{dietaryLabels[dietary]}</span>
                        </div>
                      ))}
                    </div>
                  </fieldset>

                  {/* Price Filter */}
                  <div>
                    <div className="text-muted-foreground mb-2 text-xs font-semibold tracking-wider uppercase">
                      Price Range
                    </div>
                    <div className="space-y-3">
                      <Slider
                        value={priceRange}
                        onValueChange={(value) => setPriceRange(value as [number, number])}
                        min={1}
                        max={4}
                        step={1}
                      />
                      <div className="text-muted-foreground flex justify-between text-sm">
                        <span>{"$".repeat(priceRange[0])}</span>
                        <span>{"$".repeat(priceRange[1])}</span>
                      </div>
                    </div>
                  </div>

                  {/* Rating Filter */}
                  <div>
                    <div className="text-muted-foreground mb-2 text-xs font-semibold tracking-wider uppercase">
                      Minimum Rating
                    </div>
                    <div className="space-y-3">
                      <Slider
                        value={[minRating]}
                        onValueChange={(value) => setMinRating(value[0])}
                        min={0}
                        max={5}
                        step={0.5}
                      />
                      <div className="text-muted-foreground flex items-center gap-1 text-sm">
                        <Star className="size-4 fill-amber-400 text-amber-400" />
                        <span>{minRating > 0 ? `${minRating}+` : "Any"}</span>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
        {/* Results Header */}
        <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-3">
            <TrendingUp className="size-5 text-violet-500" />
            <p className="text-muted-foreground text-sm">
              <span className="text-foreground font-semibold">{filteredRestaurants.length}</span>{" "}
              restaurants found
              {searchQuery && (
                <span>
                  {" "}
                  for "<span className="font-medium">{searchQuery}</span>"
                </span>
              )}
            </p>
          </div>

          {/* Sort */}
          <div className="flex items-center gap-2">
            <span className="text-muted-foreground text-sm">Sort by:</span>
            <div className="flex rounded-lg border border-slate-200 bg-white p-1 dark:border-slate-700 dark:bg-slate-800">
              {(["rating", "price", "name"] as const).map((option) => (
                <button
                  key={option}
                  type="button"
                  onClick={() => setSortBy(option)}
                  className={`rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
                    sortBy === option
                      ? "bg-slate-900 text-white dark:bg-white dark:text-slate-900"
                      : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  {option === "rating" && "Top Rated"}
                  {option === "price" && "Price"}
                  {option === "name" && "Name"}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Active Filters Pills */}
        {(selectedCuisines.length > 0 || selectedDietary.length > 0) && (
          <div className="mb-6 flex flex-wrap gap-2">
            {selectedCuisines.map((cuisine) => (
              <Badge
                key={cuisine}
                variant="secondary"
                className="cursor-pointer gap-1 pl-3 capitalize hover:bg-slate-200 dark:hover:bg-slate-700"
                onClick={() => setSelectedCuisines(selectedCuisines.filter((c) => c !== cuisine))}
              >
                {cuisine}
                <X className="size-3" />
              </Badge>
            ))}
            {selectedDietary.map((dietary) => (
              <Badge
                key={dietary}
                variant="secondary"
                className="cursor-pointer gap-1 pl-3 hover:bg-slate-200 dark:hover:bg-slate-700"
                onClick={() => setSelectedDietary(selectedDietary.filter((d) => d !== dietary))}
              >
                {dietaryLabels[dietary]}
                <X className="size-3" />
              </Badge>
            ))}
          </div>
        )}

        {/* Results Grid */}
        {filteredRestaurants.length > 0 ? (
          <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-2 xl:grid-cols-2">
            {filteredRestaurants.map((restaurant, index) => (
              <RestaurantCard key={restaurant.id} restaurant={restaurant} rank={index + 1} />
            ))}
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center rounded-2xl border-2 border-dashed border-slate-200 py-16 text-center dark:border-slate-700">
            <div className="mb-4 flex size-16 items-center justify-center rounded-full bg-slate-100 dark:bg-slate-800">
              <Search className="text-muted-foreground size-8" />
            </div>
            <h3 className="mb-2 text-lg font-semibold">No restaurants found</h3>
            <p className="text-muted-foreground mb-4 max-w-sm text-sm">
              Try adjusting your filters or search query to find more options.
            </p>
            <Button variant="outline" onClick={clearAllFilters}>
              Clear all filters
            </Button>
          </div>
        )}
      </main>
    </div>
  );
}
