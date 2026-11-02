import { Pattern } from './pattern';
import { Track, Tracks } from './track';
import { Note } from './note';

const countOnes = (arr: Note[]) => arr.reduce<number>((a, b) => a + b, 0);

const nearestHitDistance = (notes: Note[], idx: number): number => {
  const n = notes.length;
  if (notes[idx] === 1) return 0;
  let d = 1;
  while (d < n) {
    if (notes[(idx - d + n) % n] === 1 || notes[(idx + d) % n] === 1) return d;
    d++;
  }
  return n;
};

const addHitsUntil = (notes: Note[], targetCount: number): Note[] => {
  const n = notes.length;
  const out = notes.slice();
  if (countOnes(out) === 0) {
    const step = n % 4 === 0 ? n / 4 : Math.max(1, Math.round(n / 4));
    for (let i = 0; i < n && countOnes(out) < Math.min(targetCount, 4); i += step) {
      out[i] = 1;
    }
  }
  while (countOnes(out) < targetCount) {
    let bestIdx = -1;
    let bestScore = -1;
    for (let i = 0; i < n; i++) {
      if (out[i] === 0) {
        const score = nearestHitDistance(out, i);
        if (score > bestScore) {
          bestScore = score;
          bestIdx = i;
        }
      }
    }
    if (bestIdx === -1) break;
    out[bestIdx] = 1;
  }
  return out;
};

export type DensityCaps = Partial<Record<Track, number>>;

export const densitySweep = (
  base: Pattern,
  steps: number,
  caps: DensityCaps = {
    [Tracks.KICK]: 0.8,
    [Tracks.SNARE]: 0.85,
    [Tracks.HIHAT1]: 0.95,
    [Tracks.HIHAT2]: 0.95,
    [Tracks.PERC1]: 0.9,
    [Tracks.PERC2]: 0.9,
  }
): Pattern[] => {
  const len = base.length;
  const startDensity = countOnes(base.notes) / len;
  const cap = caps[base.track] ?? 0.9;
  const endDensity = Math.max(startDensity, cap);

  const out: Pattern[] = [];
  for (let s = 0; s < steps; s++) {
    const t = steps === 1 ? 1 : s / (steps - 1);
    const targetDensity = startDensity + (endDensity - startDensity) * t;
    const targetCount = Math.min(len, Math.max(0, Math.round(targetDensity * len)));
    const notes = addHitsUntil(base.notes, targetCount);
    out.push(new Pattern(base.track, notes));
  }
  return out;
};
