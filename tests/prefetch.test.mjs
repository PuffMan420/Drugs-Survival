import assert from "node:assert/strict";
import test from "node:test";
import {
  prefetchWithConcurrency,
  TEMPLATE_PREFETCH_CONCURRENCY,
  uniqueInOrder,
} from "../js/prefetch.js";

test("uniqueInOrder keeps the first of each key and drops later copies", () => {
  const items = [
    { kit: "roads", file: "straight.glb" },
    { kit: "ground", file: "grass.glb" },
    { kit: "roads", file: "straight.glb" },
    { kit: "roads", file: "bend.glb" },
    { kit: "ground", file: "grass.glb" },
  ];
  const unique = uniqueInOrder(items, (item) => `${item.kit}/${item.file}`);
  assert.deepEqual(unique.map((item) => `${item.kit}/${item.file}`), [
    "roads/straight.glb",
    "ground/grass.glb",
    "roads/bend.glb",
  ]);
});

test("the prefetch concurrency default is a named constant", () => {
  assert.equal(TEMPLATE_PREFETCH_CONCURRENCY, 8);
});

test("prefetchWithConcurrency runs a bounded pool and returns results in input order", async () => {
  const started = [];
  const log = [];
  let inflight = 0;
  let peak = 0;
  const items = ["a", "b", "c", "d", "e", "f"];
  const delay = { a: 40, b: 10, c: 25, d: 5, e: 15, f: 8 };
  const results = await prefetchWithConcurrency(items, async (item) => {
    started.push(item);
    inflight += 1;
    peak = Math.max(peak, inflight);
    await new Promise((resolve) => setTimeout(resolve, delay[item]));
    inflight -= 1;
    log.push(item);
    return item.toUpperCase();
  }, 2);
  assert.deepEqual(results, ["A", "B", "C", "D", "E", "F"]);
  assert.deepEqual(started, items);
  assert.ok(peak <= 2, `peak concurrency ${peak}`);
  assert.ok(peak === 2, `pool never reached 2 (peak ${peak})`);
  assert.notDeepEqual(log, items);
});

test("prefetchWithConcurrency keeps later items going when one worker is slow", async () => {
  const done = [];
  await prefetchWithConcurrency(["slow", "fast", "also-fast"], async (item) => {
    await new Promise((resolve) => setTimeout(resolve, item === "slow" ? 40 : 5));
    done.push(item);
    return item;
  }, 2);
  assert.equal(done[done.length - 1], "slow");
  assert.ok(done.indexOf("fast") < done.indexOf("slow"));
});
