import { after, suite, test } from "node:test";
import * as assert from "node:assert";
import { once } from "node:events";
import { createService, createWorkerPool } from "scalability";
import type { Greeter } from "./greeter.js";
import { App } from "./app.js";

interface CrashingService {
  crash(): void;
  exitWorker(): void;
  greet(): string;
}

interface SlowService {
  wait(milliseconds: number): Promise<string>;
}

interface OptionsService {
  getWorkerData(): unknown;
}

interface BurstService {
  value(number: number): number;
}

const wait = async (milliseconds: number): Promise<void> => {
  await new Promise<void>((resolve) => setTimeout(resolve, milliseconds));
};

await suite("WorkerPool", async () => {
  const workerPool = createWorkerPool({ workerCount: 4, workerURL: "./dist/service.js" });
  await once(workerPool, "ready");

  after(async () => {
    workerPool.destroy();
    await once(workerPool, "close");
  });

  const service = createService(workerPool);
  service.createServiceApp<App>(new App());
  const greeter = service.createServiceAPI<Greeter>();

  void test("Call methods concurrently through the worker pool.", async () => {
    const results = await Promise.all(Array.from({ length: 10 }, () => greeter.greet("happy")));
    assert.deepStrictEqual(results, Array(10).fill("Hello, happy world!"));
  });

  void test("Call a method on the main thread from a worker.", async () => {
    assert.strictEqual(await greeter.getNumber(), 1);
  });

  void test("Reject invalid worker counts.", () => {
    assert.throws(() => createWorkerPool({ workerCount: 0, workerURL: "./dist/service.js" }), RangeError);
  });

  void test("Replace workers that exit and reject their calls.", async () => {
    const pool = createWorkerPool({ workerCount: 1, workerURL: "./dist/crashing_service.js", restartWorkerOnError: true });
    await once(pool, "ready");
    const api = createService(pool).createServiceAPI<CrashingService>();

    console.log("The following Error from network-services is expected because the test worker is intentionally exiting.");
    await assert.rejects(api.crash(), /Worker exited with code 1/);
    await wait(50);
    assert.strictEqual(await api.greet(), "hello");
    await assert.rejects(api.exitWorker(), /Worker exited with code 0/);
    await wait(50);
    assert.strictEqual(await api.greet(), "hello");

    const close = once(pool, "close");
    pool.destroy();
    await close;
  });

  void test("Close active calls when the pool is destroyed.", async () => {
    const pool = createWorkerPool({ workerCount: 1, workerURL: "./dist/slow_service.js" });
    await once(pool, "ready");
    const api = createService(pool).createServiceAPI<SlowService>();
    const close = once(pool, "close");
    const call = api.wait(500);
    await wait(25);
    pool.destroy();
    await assert.rejects(call, /stream|closed/i);
    await close;
  });

  void test("Handle one failed worker while another continues serving calls.", async () => {
    const pool = createWorkerPool({ workerCount: 2, workerURL: "./dist/crashing_service.js", restartWorkerOnError: true });
    await once(pool, "ready");
    const api = createService(pool).createServiceAPI<CrashingService>();
    const results = await Promise.allSettled([api.crash(), api.greet()]);
    assert.strictEqual(results[0].status, "rejected");
    assert.deepStrictEqual(results[1], { status: "fulfilled", value: "hello" });
    const close = once(pool, "close");
    pool.destroy();
    await close;
  });

  void test("Support URL worker paths and workerData.", async () => {
    const pool = createWorkerPool({
      workerCount: 1,
      workerURL: new URL("./options_service.js", import.meta.url),
      workerOptions: { workerData: { value: "from-worker-data" } },
    });
    await once(pool, "ready");
    const api = createService(pool).createServiceAPI<OptionsService>();
    assert.deepStrictEqual(await api.getWorkerData(), { value: "from-worker-data" });
    const close = once(pool, "close");
    pool.destroy();
    await close;
  });

  void test("Destroy a pool safely during startup.", async () => {
    const pool = createWorkerPool({ workerCount: 1, workerURL: "./dist/slow_service.js" });
    let ready = false;
    pool.once("ready", () => {
      ready = true;
    });
    const close = once(pool, "close");
    pool.destroy();
    await close;
    await wait(25);
    assert.strictEqual(ready, false);
  });

  void test("Allow repeated pool destruction.", async () => {
    const pool = createWorkerPool({ workerCount: 1, workerURL: "./dist/service.js" });
    await once(pool, "ready");
    const close = once(pool, "close");
    pool.destroy();
    pool.destroy();
    await close;
  });

  void test("Handle a large burst of queued calls.", async () => {
    const pool = createWorkerPool({ workerCount: 4, workerURL: "./dist/burst_service.js" });
    await once(pool, "ready");
    const api = createService(pool).createServiceAPI<BurstService>();
    const results = await Promise.all(Array.from({ length: 500 }, (_, number) => api.value(number)));
    assert.deepStrictEqual(results, Array.from({ length: 500 }, (_, number) => number));
    const close = once(pool, "close");
    pool.destroy();
    await close;
  });
});
