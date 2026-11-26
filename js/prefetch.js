// Bounded parallel work for boot loads. The caller still applies results
// in the original order so placement stays deterministic.

export const TEMPLATE_PREFETCH_CONCURRENCY = 8;

export function uniqueInOrder(items, keyOf) {
  const keys = [];
  const seen = new Set();
  for (const item of items) {
    const key = keyOf(item);
    if (key == null || seen.has(key)) continue;
    seen.add(key);
    keys.push(item);
  }
  return keys;
}

export async function prefetchWithConcurrency(
  items,
  worker,
  concurrency = TEMPLATE_PREFETCH_CONCURRENCY,
) {
  const list = Array.isArray(items) ? items : [];
  if (list.length === 0) return [];
  const limit = Math.max(1, Math.min(list.length, Math.floor(Number(concurrency)) || 1));
  const results = new Array(list.length);
  let cursor = 0;
  async function run() {
    for (;;) {
      const index = cursor;
      cursor += 1;
      if (index >= list.length) return;
      results[index] = await worker(list[index], index);
    }
  }
  await Promise.all(Array.from({ length: limit }, () => run()));
  return results;
}
