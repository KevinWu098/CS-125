import { tokenize } from "./tokenize";
import type { SearchIndex, SearchOptions, SearchResult } from "./types";

type SearchScore = {
  score: number;
  matchedTokens: Set<string>;
};

export const search = (
  index: SearchIndex,
  query: string,
  options: SearchOptions = {},
): SearchResult[] => {
  const tokens = tokenize(query);
  if (tokens.length === 0) {
    return [];
  }

  const scores = new Map<string, SearchScore>();

  for (const token of tokens) {
    const postings = index.tokenIndex[token];
    // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
    if (!postings) {
      continue;
    }

    for (const posting of postings) {
      const current = scores.get(posting.id) ?? { score: 0, matchedTokens: new Set<string>() };
      current.score += posting.weight;
      current.matchedTokens.add(token);
      scores.set(posting.id, current);
    }
  }

  const minScore = options.minScore ?? 0;
  const limit = options.limit ?? 20;
  const results: SearchResult[] = [];

  for (const [id, data] of scores) {
    const document = index.documents[id];
    // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
    if (!document || data.score < minScore) {
      continue;
    }

    results.push({
      id,
      score: data.score,
      document,
      matchedTokens: Array.from(data.matchedTokens),
    });
  }

  return results
    .sort(
      (left, right) =>
        right.score - left.score || left.document.name.localeCompare(right.document.name),
    )
    .slice(0, limit);
};
