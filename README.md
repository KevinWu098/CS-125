### Frontend
cd apps/website
pnpm install
pnpm run dev
### Backend
There is no long-running backend server. The search layer lives in packages/indexer.
cd packages/indexer
pnpm run create-index
This builds the search index and writes packages/indexer/index/ (documents, token-index, facet-index, index-meta).
