export type SearchDocument = {
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

export type TokenPosting = {
  id: string;
  weight: number;
};

export type SearchIndex = {
  version: number;
  generatedAtISO: string;
  documents: Record<string, SearchDocument>;
  tokenIndex: Record<string, TokenPosting[]>;
};

export type SearchOptions = {
  limit?: number;
  minScore?: number;
};

export type SearchResult = {
  id: string;
  score: number;
  document: SearchDocument;
  matchedTokens: string[];
};

export type IndexMeta = {
  version: number;
  generatedAtISO: string;
  documentCount: number;
  tokenCount: number;
};

export type IndexFilePaths = {
  documentsPath: string;
  tokenIndexPath: string;
  metaPath: string;
};
