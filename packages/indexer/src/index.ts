export { buildSearchIndex } from "./search/index-builder";
export { buildIndexMeta, getIndexFilePaths, writeSearchIndexFiles } from "./search/index-files";
export { normalizeText } from "./search/normalize";
export { search } from "./search/search";
export { tokenize } from "./search/tokenize";
export type {
  IndexFilePaths,
  IndexMeta,
  SearchDocument,
  SearchIndex,
  SearchOptions,
  SearchResult,
  TokenPosting,
} from "./search/types";
export { SEARCH_FIELD_WEIGHTS } from "./search/weights";
