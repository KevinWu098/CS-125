export type DietarySupport = {
  vegan: boolean;
  vegetarian: boolean;
  glutenFree: boolean;
  dairyFree: boolean;
  halal: boolean;
  kosher: boolean;
  nutFree: boolean;
};

export type MenuItemSchema = {
  id: string;
  name: string;
  description?: string;
  priceUSD?: number;
  category?: string;
  tags?: string[];
  allergens?: string[];
  dietarySupport: DietarySupport;
  nutrition?: {
    calories?: number;
    proteinG?: number;
    carbsG?: number;
    fatG?: number;
    fiberG?: number;
    sugarG?: number;
    sodiumMg?: number;
  };
};

export type RestaurantSchema = {
  id: string;
  name: string;
  description?: string;
  cuisine: string[];
  priceTier?: "$" | "$$" | "$$$" | "$$$$";
  rating?: {
    average: number;
    count: number;
    source?: string;
  };
  // contact?: {
  //   phone?: string;
  //   website?: string;
  // };
  location: {
    address: string;
    city: string;
    state: string;
    postalCode: string;
    lat: number;
    lng: number;
    // distanceMeters?: number;
  };
  hours?: Array<{
    day: "mon" | "tue" | "wed" | "thu" | "fri" | "sat" | "sun";
    open: string;
    close: string;
  }>;
  menu: MenuItemSchema[];
  dataSource?: {
    name: string;
    lastUpdatedISO: string;
    url: string;
  };
};
