import { authClient } from '../lib/authClient';

export function useSession() {
  return authClient.useSession();
}
