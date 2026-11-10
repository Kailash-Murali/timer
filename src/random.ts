import type { Source } from "./state";

const MIN = 10;
const MAX = 40;
const URL = `https://www.random.org/integers/?num=1&min=${MIN}&max=${MAX}&col=1&base=10&format=plain&rnd=new`;

/** Unbiased integer in [MIN, MAX] via rejection sampling. */
function cryptoInt() {
  const span = MAX - MIN + 1;
  const limit = Math.floor(0x1_0000_0000 / span) * span;
  const buf = new Uint32Array(1);
  do crypto.getRandomValues(buf);
  while (buf[0] >= limit);
  return MIN + (buf[0] % span);
}

async function fetchRandomOrg(): Promise<number> {
  const res = await fetch(URL, { cache: "no-store", signal: AbortSignal.timeout(4500) });
  if (!res.ok) throw new Error(`random.org ${res.status}`);
  const value = Number((await res.text()).trim());
  if (!Number.isInteger(value) || value < MIN || value > MAX)
    throw new Error("random.org: bad payload");
  return value;
}

/** True random from Random.org, falling back to crypto.getRandomValues. Lasts at least `minMs` so the scrolling reels read. */
export async function rollRandom(minMs = 1100): Promise<{ value: number; source: Source }> {
  const delay = new Promise((r) => setTimeout(r, minMs));
  let result: { value: number; source: Source };
  try {
    result = { value: await fetchRandomOrg(), source: "RANDOM_ORG" };
  } catch {
    result = { value: cryptoInt(), source: "CRYPTO" };
  }
  await delay;
  return result;
}
