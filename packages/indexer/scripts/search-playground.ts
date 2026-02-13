import documents from "../index/documents.json";
import facetIndex from "../index/facet-index.json";
import meta from "../index/index-meta.json";
import tokenIndex from "../index/token-index.json";
import { search } from "../src";
import type { SearchIndex, SearchOptions } from "../src/search/types";

type Scenario = {
  name: string;
  query: string;
  options: SearchOptions;
};

const DEFAULT_ORIGIN = { lat: 33.643246, lng: -117.842551 };

const SCENARIOS: Scenario[] = [
  {
    name: "Keyword relevance",
    query: "chicken bowl",
    options: { limit: 5 },
  },
  {
    name: "Nearest options",
    query: "",
    options: {
      sort: "distance",
      filters: {
        origin: DEFAULT_ORIGIN,
        maxDistanceKm: 2,
      },
      limit: 5,
    },
  },
  {
    name: "Open now + budget",
    query: "",
    options: {
      sort: "distance",
      filters: {
        origin: DEFAULT_ORIGIN,
        maxDistanceKm: 3,
        maxPriceUSD: 15,
        openAtISO: "2026-02-13T12:00:00-08:00",
      },
      limit: 5,
    },
  },
  {
    name: "Nutrition + preference",
    query: "protein",
    options: {
      filters: {
        origin: DEFAULT_ORIGIN,
        maxDistanceKm: 3,
        nutrition: {
          proteinG: { min: 20 },
        },
      },
      nutritionTarget: { proteinG: 35, carbsG: 45, fatG: 20 },
      rankingWeights: { text: 1, distance: 0.7, nutrition: 0.8, price: 0.2, rating: 0.1 },
      limit: 5,
    },
  },
];

const index: SearchIndex = {
  version: meta.version,
  generatedAtISO: meta.generatedAtISO,
  documents: documents as SearchIndex["documents"],
  tokenIndex: tokenIndex as SearchIndex["tokenIndex"],
  facetIndex: facetIndex as SearchIndex["facetIndex"],
};

const printResults = (scenario: Scenario, index: SearchIndex): void => {
  const results = search(index, scenario.query, scenario.options);
  console.log(`\n=== ${scenario.name} ===`);
  console.log(`query: "${scenario.query}"`);
  console.log(`options: ${JSON.stringify(scenario.options)}`);
  console.log(`results: ${results.length}`);

  for (const result of results.slice(0, 5)) {
    const distance =
      result.breakdown.distanceKm === undefined
        ? "n/a"
        : `${result.breakdown.distanceKm.toFixed(2)}km`;
    const price = result.document.menuPriceRangeUSD?.avg.toFixed(2) ?? "n/a";
    const rating = result.document.rating?.average.toFixed(1) ?? "n/a";
    console.log(
      `- ${result.document.name} | score=${result.score.toFixed(3)} | dist=${distance} | avgPrice=$${price} | rating=${rating}`,
    );
  }
};

const main = (): void => {
  for (const scenario of SCENARIOS) {
    printResults(scenario, index);
  }
};

try {
  main();
} catch (error) {
  console.error("Search playground failed:", error);
  process.exitCode = 1;
}
