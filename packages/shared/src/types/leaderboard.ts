export interface LeaderboardEntry {
  rank: number;
  userId: string;
  name: string;
  points: number;
  /** True for bot accounts; false for human users. */
  isBot: boolean;
  /** Display name of the bot's owner; null for human users or unowned bots. */
  ownerName: string | null;
}
