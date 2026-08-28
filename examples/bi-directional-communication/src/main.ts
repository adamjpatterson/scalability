import { once } from "node:events";
import { createService, createWorkerPool } from "scalability";
import type { GreeterService } from "./service.js";

export class MainThreadService {
  public n = 1;
  getNumber(): number {
    return this.n++;
  }
}

const workerPool = createWorkerPool({
  workerCount: 10,
  workerURL: "./dist/service.js",
});

await once(workerPool, "ready");

const app = new MainThreadService();
const service = createService(workerPool);
service.createServiceApp<MainThreadService>(app);

const greeter = service.createServiceAPI<GreeterService>();

const results = [];
for (let i = 0; i < 10; i++) {
  results.push(greeter.greet("happy"));
}

console.time("test");
const result = await Promise.all(results);
console.log(result);
console.timeEnd("test");
