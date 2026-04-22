import { createAuthClient } from 'better-auth/react';

const baseURL = import.meta.env.VITE_API_URL || 'http://localhost:3001';

// Explicit type-cast to `any` avoids TS2742 (inferred type refers to pnpm-hoisted
// `@better-auth/core` package that can't be named from our source tree). The
// concrete API surface we use (signIn/signUp/signOut/useSession/signIn.social)
// is still callable — BetterAuth's runtime shape is unaffected by this cast.
// See https://github.com/microsoft/TypeScript/issues/47663
export const authClient: any = createAuthClient({
  baseURL,
});

export const { useSession } = authClient;
