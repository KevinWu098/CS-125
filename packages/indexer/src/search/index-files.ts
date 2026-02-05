import { promises as fs } from "node:fs";
import path from "node:path";

import type { IndexFilePaths, IndexMeta, SearchIndex } from "./types";

export const getIndexFilePaths = (outputDir: string): IndexFilePaths => ({
  documentsPath: path.join(outputDir, "documents.json"),
  tokenIndexPath: path.join(outputDir, "token-index.json"),
  metaPath: path.join(outputDir, "index-meta.json"),
});

export const buildIndexMeta = (index: SearchIndex): IndexMeta => ({
  version: index.version,
  generatedAtISO: index.generatedAtISO,
  documentCount: Object.keys(index.documents).length,
  tokenCount: Object.keys(index.tokenIndex).length,
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
    fs.writeFile(paths.metaPath, JSON.stringify(meta, null, 2), "utf8"),
  ]);

  return paths;
};
