import path from "node:path";
import { fileURLToPath } from "node:url";

import data from "@packages/data";
import type { RestaurantSchema } from "@packages/types";

import { buildSearchIndex, writeSearchIndexFiles } from "../src";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const OUTPUT_DIR = path.resolve(__dirname, "..", "index");

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
  console.log(paths.facetIndexPath);
  console.log(paths.metaPath);
};

main().catch((error) => {
  console.error("Failed to build search index:", error);
  process.exitCode = 1;
});
