import { promises as fs } from "node:fs";
import path from "node:path";

import type { IndexFilePaths, IndexMeta, SearchIndex } from "./types";

export const getIndexFilePaths = (outputDir: string): IndexFilePaths => ({
  documentsPath: path.join(outputDir, "documents.json"),
  tokenIndexPath: path.join(outputDir, "token-index.json"),
  facetIndexPath: path.join(outputDir, "facet-index.json"),
  metaPath: path.join(outputDir, "index-meta.json"),
});

export const buildIndexMeta = (index: SearchIndex): IndexMeta => ({
  version: index.version,
  generatedAtISO: index.generatedAtISO,
  documentCount: Object.keys(index.documents).length,
  tokenCount: Object.keys(index.tokenIndex).length,
  facetCounts: {
    cuisines: Object.keys(index.facetIndex.byCuisine).length,
    categories: Object.keys(index.facetIndex.byCategory).length,
    tags: Object.keys(index.facetIndex.byTag).length,
    allergens: Object.keys(index.facetIndex.byAllergen).length,
  },
});

export const writeSearchIndexFiles = async (
  index: SearchIndex,
  outputDir: string,
): Promise<IndexFilePaths> => {
  const paths = getIndexFilePaths(outputDir);
  const meta = buildIndexMeta(index);

  await fs.mkdir(outputDir, { recursive: true });
  await Promise.all([
    fs.writeFile(paths.documentsPath, JSON.stringify(index.documents, null, 2), "utf8"),
    fs.writeFile(paths.tokenIndexPath, JSON.stringify(index.tokenIndex, null, 2), "utf8"),
    fs.writeFile(paths.facetIndexPath, JSON.stringify(index.facetIndex, null, 2), "utf8"),
    fs.writeFile(paths.metaPath, JSON.stringify(meta, null, 2), "utf8"),
  ]);

  return paths;
};

export const readSearchIndexFiles = async (outputDir: string): Promise<SearchIndex> => {
  const paths = getIndexFilePaths(outputDir);

  const [documentsRaw, tokenIndexRaw, facetIndexRaw, metaRaw] = await Promise.all([
    fs.readFile(paths.documentsPath, "utf8"),
    fs.readFile(paths.tokenIndexPath, "utf8"),
    fs.readFile(paths.facetIndexPath, "utf8"),
    fs.readFile(paths.metaPath, "utf8"),
  ]);

  const documents = JSON.parse(documentsRaw) as SearchIndex["documents"];
  const tokenIndex = JSON.parse(tokenIndexRaw) as SearchIndex["tokenIndex"];
  const facetIndex = JSON.parse(facetIndexRaw) as SearchIndex["facetIndex"];
  const meta = JSON.parse(metaRaw) as IndexMeta;

  return {
    version: meta.version,
    generatedAtISO: meta.generatedAtISO,
    documents,
    tokenIndex,
    facetIndex,
  };
};
