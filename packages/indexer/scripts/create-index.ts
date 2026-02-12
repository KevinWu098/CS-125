import path from "node:path";
import { fileURLToPath } from "node:url";

import data from "@packages/data";
import type { RestaurantSchema } from "@packages/types";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const OUTPUT_DIR = path.resolve(__dirname, "..", "..", "data", "index");

const SEARCH_FIELD_WEIGHTS = {
  name: 5,
  description: 2,
  cuisine: 3,
  menuItem: 2,
  location: 1,
} as const;

const NON_ALPHANUMERIC = /[^a-z0-9\s]/g;
const WHITESPACE = /\s+/g;

const normalizeText = (text: string): string => {
  const lower = text.toLowerCase();
  const cleaned = lower.replace(NON_ALPHANUMERIC, " ");
  return cleaned.replace(WHITESPACE, " ").trim();
};

const uniqueTokens = (tokens: string[]): string[] => {
  const seen = new Set<string>();
  const result: string[] = [];

  for (const token of tokens) {
    if (!token || seen.has(token)) {
      continue;
    }

    seen.add(token);
    result.push(token);
  }

  return result;
};

const tokenize = (text: string): string[] => {
  const normalized = normalizeText(text);
  if (!normalized) {
    return [];
  }

  return uniqueTokens(normalized.split(" "));
};

type SearchDocument = {
  id: string;
  name: string;
  description?: string;
  cuisine: string[];
  priceTier?: "$" | "$$" | "$$$" | "$$$$";
  location: {
    city: string;
    state: string;
  };
  menuItemNames: string[];
};

type TokenPosting = {
  id: string;
  weight: number;
};

type SearchIndex = {
  version: number;
  generatedAtISO: string;
  documents: Record<string, SearchDocument>;
  tokenIndex: Record<string, TokenPosting[]>;
};

type IndexMeta = {
  version: number;
  generatedAtISO: string;
  documentCount: number;
  tokenCount: number;
};

type IndexFilePaths = {
  documentsPath: string;
  tokenIndexPath: string;
  metaPath: string;
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

const buildSearchIndex = (restaurants: RestaurantSchema[]): SearchIndex => {
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
    version: 1,
    generatedAtISO: new Date().toISOString(),
    documents,
    tokenIndex,
  };
};

const buildIndexMeta = (index: SearchIndex): IndexMeta => ({
  version: index.version,
  generatedAtISO: index.generatedAtISO,
  documentCount: Object.keys(index.documents).length,
  tokenCount: Object.keys(index.tokenIndex).length,
});

const getIndexFilePaths = (outputDir: string): IndexFilePaths => ({
  documentsPath: path.join(outputDir, "documents.json"),
  tokenIndexPath: path.join(outputDir, "token-index.json"),
  metaPath: path.join(outputDir, "index-meta.json"),
});

const writeSearchIndexFiles = async (
  index: SearchIndex,
  outputDir: string,
): Promise<IndexFilePaths> => {
  const paths = getIndexFilePaths(outputDir);
  const meta = buildIndexMeta(index);

  const { promises: fs } = await import("node:fs");
  await fs.mkdir(outputDir, { recursive: true });
  await Promise.all([
    fs.writeFile(paths.documentsPath, JSON.stringify(index.documents, null, 2), "utf8"),
    fs.writeFile(paths.tokenIndexPath, JSON.stringify(index.tokenIndex, null, 2), "utf8"),
    fs.writeFile(paths.metaPath, JSON.stringify(meta, null, 2), "utf8"),
  ]);

  return paths;
};

const coerceRestaurants = (value: unknown): RestaurantSchema[] => {
  if (!Array.isArray(value)) {
    throw new Error("data.json must contain an array of restaurants.");
  }

  return value as RestaurantSchema[];
};

const main = async (): Promise<void> => {
  const restaurants = coerceRestaurants(data);
  const index = buildSearchIndex(restaurants);
  const paths = await writeSearchIndexFiles(index, OUTPUT_DIR);

  console.log("Search index written:");
  console.log(paths.documentsPath);
  console.log(paths.tokenIndexPath);
  console.log(paths.metaPath);
};

main().catch((error) => {
  console.error("Failed to build search index:", error);
  process.exitCode = 1;
});
