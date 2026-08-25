import { after, suite, test } from "node:test";
import * as assert from "node:assert";
import { once } from "node:events";
import { createService, createWorkerPool } from "scalability";
import type { Greeter } from "./greeter.js";
import { App } from "./app.js";

await suite("Test calls over a WorkerPool.", async () => {
  const workerPool = createWorkerPool({
    workerCount: 4,
    workerURL: "./dist/service.js",
  });
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
});
