import { createAuthClient } from 'better-auth/react';

// Empty baseURL = same-origin relative URLs. In dev, vite proxies /api
// to localhost:3001. In prod, nginx proxies /api to the node server.
// This removes the localhost:3001 leak that shipped in v1 builds.
const baseURL = import.meta.env.VITE_API_URL || '';

// Explicit ReturnType annotation avoids TS2742 (inferred type uses transitive
// paths into .pnpm/@better-auth+core that vite+tsc think are non-portable).
export const authClient: ReturnType<typeof createAuthClient> = createAuthClient({
  baseURL,
});
