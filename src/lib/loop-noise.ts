export const DEFAULT_LOOP_DURATION = 4000;
export const DEFAULT_ANIMATION_SEED = 23;
export const DEFAULT_MAX_TIME_STEPS = 64;
export const MAX_TIME_STEPS = 512;
const TAU = Math.PI * 2;

// Random access, not a mutable PRNG: seeking and export order cannot change a cell.
function cellRandom(x: number, y: number, seed: number, channel: number) {
  let h = Math.imul(Math.round(x * 1000), 374761393)
    ^ Math.imul(Math.round(y * 1000), 668265263)
    ^ Math.imul(seed, 1597334677) ^ Math.imul(channel, 1274126177);
  h = Math.imul(h ^ (h >>> 16), 2246822507);
  h = Math.imul(h ^ (h >>> 13), 3266489909);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

/** Seeded sine noise in [0, 1], with matching values and derivatives at the seam. */
export function sinRandom(time: number, x: number, y: number, duration: number, seed = DEFAULT_ANIMATION_SEED) {
  const phase = loopPhase(time, duration);
  const cycles = Math.max(1, Math.round(duration / 12000));
  const a = cellRandom(x, y, seed, 0) * TAU;
  const b = cellRandom(x, y, seed, 1) * TAU;
  const c = cellRandom(x, y, seed, 2) * TAU;
  // Integer harmonics close after one source loop. Fresh random noise per frame
  // would break both continuity and reproducibility.
  return .5 + (Math.sin(cycles * phase + a)
    + .3 * Math.sin(2 * cycles * phase + b)
    + .15 * Math.sin(3 * cycles * phase + c)) / 2.9;
}

function loopPhase(time: number, duration: number) {
  if (!Number.isFinite(duration) || duration <= 0) throw new Error('Loop duration must be positive and finite.');
  return (((time % duration) + duration) % duration) / duration * TAU;
}

const MIN_CHARACTER_HOLD = 800;

type CharacterChange = { time: number; value: number };
type CharacterSchedule = { base: number; changes: CharacterChange[] };
// Keep preview and export schedules cached independently; never retain an
// unbounded history as the user drags the control or changes the source.
const scheduleCaches = new Map<string, Map<string, CharacterSchedule>>();

export function normalizeTimeSteps(value = DEFAULT_MAX_TIME_STEPS) {
  return Number.isFinite(value) ? Math.max(1, Math.min(MAX_TIME_STEPS, Math.round(value))) : DEFAULT_MAX_TIME_STEPS;
}

function createSchedule(x: number, y: number, duration: number, seed: number, steps: number): CharacterSchedule {
  const schedule: CharacterSchedule = { base: cellRandom(x, y, seed, 4), changes: [] };
  const maxChanges = Math.min(steps, Math.floor(duration / MIN_CHARACTER_HOLD));
  // A closed loop needs zero or at least two transitions. Short loops keep
  // their characters rather than speeding them up to force a change.
  if (maxChanges < 2) return schedule;

  // Average the original .00022/ms chance across slow and lively cells.
  // The change budget depends on seconds, not the number of samples or FPS.
  const temperament = cellRandom(x, y, seed, 5);
  const expected = duration / 1000 * (.06 + .48 * temperament ** 2);
  let count = Math.floor(expected) + (cellRandom(x, y, seed, 6) < expected % 1 ? 1 : 0);
  if (count === 1) count = cellRandom(x, y, seed, 7) < .5 ? 0 : 2;
  count = Math.min(count, maxChanges);
  if (!count) return schedule;

  const interval = duration / steps;
  const offset = cellRandom(x, y, seed, 8) * duration;
  // N samples on [0, 2π), each with independent seeded randomness weighted
  // by the sine noise. Per-cell offsets prevent synchronized step changes.
  const candidates = Array.from({ length: steps }, (_, step) => {
    const time = (offset + step * interval) % duration;
    const weight = .5 + sinRandom(step * interval, x, y, duration, seed);
    const random = cellRandom(x, y, seed, 1000 + step * 2);
    return { time, value: cellRandom(x, y, seed, 1001 + step * 2), priority: -Math.log(1 - random) / weight };
  }).sort((a, b) => a.priority - b.priority);
  // Weighted sampling without replacement: extra time steps offer a richer
  // choice of change times without multiplying the character-change rate.
  for (const candidate of candidates) {
    if (schedule.changes.some(change => {
      const distance = Math.abs(candidate.time - change.time);
      return Math.min(distance, duration - distance) < MIN_CHARACTER_HOLD;
    })) continue;
    schedule.changes.push({ time: candidate.time, value: candidate.value });
    if (schedule.changes.length === count) break;
  }
  if (schedule.changes.length < 2) schedule.changes = [];
  schedule.changes.sort((a, b) => a.time - b.time);
  return schedule;
}

/** Sparse sample-and-hold on a seeded, cyclic time-step schedule. */
export function characterSchedule(x: number, y: number, duration: number, seed = DEFAULT_ANIMATION_SEED, maxTimeSteps = DEFAULT_MAX_TIME_STEPS): Readonly<CharacterSchedule> {
  const steps = normalizeTimeSteps(maxTimeSteps);
  const configKey = `${duration}:${seed}:${steps}`;
  let cache = scheduleCaches.get(configKey);
  if (!cache) {
    if (scheduleCaches.size >= 2) scheduleCaches.delete(scheduleCaches.keys().next().value!);
    cache = new Map(); scheduleCaches.set(configKey, cache);
  }
  const cellKey = `${x}:${y}`;
  let schedule = cache.get(cellKey);
  if (!schedule) {
    schedule = createSchedule(x, y, duration, seed, steps);
    if (cache.size >= 32768) cache.clear();
    cache.set(cellKey, schedule);
  }
  return schedule;
}

function heldCharacter(time: number, x: number, y: number, duration: number, seed: number, maxTimeSteps: number) {
  const schedule = characterSchedule(x, y, duration, seed, maxTimeSteps);
  const localTime = ((time % duration) + duration) % duration;
  let value = schedule.changes.at(-1)?.value ?? schedule.base;
  for (const change of schedule.changes) {
    if (localTime < change.time) break;
    value = change.value;
  }
  return value;
}

/** Offsets and character state are anchored to the original grid, before wobble. */
export function sampleGlyphLoop(time: number, x: number, y: number, duration = DEFAULT_LOOP_DURATION, seed = DEFAULT_ANIMATION_SEED, maxTimeSteps = DEFAULT_MAX_TIME_STEPS) {
  const phase = loopPhase(time, duration);
  const cellPhase = cellRandom(x, y, seed, 3) * TAU;
  const cycles = wanderCycles(duration);
  return {
    character: heldCharacter(time, x, y, duration, seed, maxTimeSteps),
    dx: Math.sin(cycles * phase + cellPhase),
    dy: Math.cos(cycles * phase + cellPhase),
    alpha: .68 + (Math.sin(cellPhase) + 1) * .16,
  };
}

export function wanderCycles(duration: number) {
  return Math.max(1, Math.round(duration / (TAU / .0015)));
}
