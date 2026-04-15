import type { SeededRandom } from '@repo/shared';
import seedrandom from 'seedrandom';

export class RandomProvider implements SeededRandom {
  private rng: () => number;
  readonly seed: string;

  constructor(seed: string) {
    this.seed = seed;
    this.rng = seedrandom(seed);
  }

  int(min: number, max: number): number {
    return min + Math.floor(this.rng() * (max - min + 1));
  }

  float(): number {
    return this.rng();
  }

  shuffle<T>(arr: T[]): T[] {
    const result = [...arr];
    for (let i = result.length - 1; i > 0; i--) {
      const j = Math.floor(this.rng() * (i + 1));
      [result[i], result[j]] = [result[j], result[i]];
    }
    return result;
  }
}
