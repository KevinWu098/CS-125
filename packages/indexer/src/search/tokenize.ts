import { normalizeText } from "./normalize";

export const tokenize = (text: string): string[] => {
  const normalized = normalizeText(text);
  if (!normalized) {
    return [];
  }

  return uniqueTokens(normalized.split(" "));
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
