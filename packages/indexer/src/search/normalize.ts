const NON_ALPHANUMERIC = /[^a-z0-9\s]/g;
const WHITESPACE = /\s+/g;

export const normalizeText = (text: string): string => {
  const lower = text.toLowerCase();
  const cleaned = lower.replace(NON_ALPHANUMERIC, " ");
  return cleaned.replace(WHITESPACE, " ").trim();
};
