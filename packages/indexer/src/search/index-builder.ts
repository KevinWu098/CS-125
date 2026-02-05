import type { RestaurantSchema } from "@packages/types";

import { tokenize } from "./tokenize";
import type { SearchDocument, SearchIndex, TokenPosting } from "./types";
import { SEARCH_FIELD_WEIGHTS } from "./weights";

const INDEX_VERSION = 1;

export const buildSearchIndex = (restaurants: RestaurantSchema[]): SearchIndex => {
  const documents: Record<string, SearchDocument> = {};
  const tokenIndex: Record<string, TokenPosting[]> = {};

  for (const restaurant of restaurants) {
    const document = buildSearchDocument(restaurant);
    documents[document.id] = document;

    addTokens(tokenIndex, document.id, tokenize(document.name), SEARCH_FIELD_WEIGHTS.name);

    if (document.description) {
      addTokens(
        tokenIndex,
        document.id,
        tokenize(document.description),
        SEARCH_FIELD_WEIGHTS.description,
      );
    }

    addTokens(
      tokenIndex,
      document.id,
      tokenize(document.cuisine.join(" ")),
      SEARCH_FIELD_WEIGHTS.cuisine,
    );

    addTokens(
      tokenIndex,
      document.id,
      tokenize(document.menuItemNames.join(" ")),
      SEARCH_FIELD_WEIGHTS.menuItem,
    );

    addTokens(
      tokenIndex,
      document.id,
      tokenize(`${document.location.city} ${document.location.state}`),
      SEARCH_FIELD_WEIGHTS.location,
    );
  }

  return {
    version: INDEX_VERSION,
    generatedAtISO: new Date().toISOString(),
    documents,
    tokenIndex,
  };
};

const buildSearchDocument = (restaurant: RestaurantSchema): SearchDocument => ({
  id: restaurant.id,
  name: restaurant.name,
  description: restaurant.description,
  cuisine: restaurant.cuisine,
  priceTier: restaurant.priceTier,
  location: {
    city: restaurant.location.city,
    state: restaurant.location.state,
  },
  menuItemNames: restaurant.menu.map((item) => item.name),
});

const addTokens = (
  tokenIndex: Record<string, TokenPosting[]>,
  documentId: string,
  tokens: string[],
  weight: number,
): void => {
  for (const token of tokens) {
    if (!token) {
      continue;
    }

    const postings = tokenIndex[token] ?? (tokenIndex[token] = []);
    const existing = postings.find((posting) => posting.id === documentId);

    if (existing) {
      existing.weight += weight;
      continue;
    }

    postings.push({ id: documentId, weight });
  }
};
