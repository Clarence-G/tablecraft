import { createAuthClient } from 'better-auth/react';

const baseURL = import.meta.env.VITE_API_URL || 'http://localhost:3001';

// Explicit ReturnType annotation avoids TS2742 (inferred type uses transitive
// paths into .pnpm/@better-auth+core that vite+tsc think are non-portable).
export const authClient: ReturnType<typeof createAuthClient> = createAuthClient({
  baseURL,
});
