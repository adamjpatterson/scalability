# _"Bi-directional Communication"_

## Introduction

In this example you will use Scalability for bi-directional communication between the main thread and a Worker thread.

The main thread calls `GreeterService` in the Worker thread, while the Worker calls `MainThreadService` in the main thread.

## Implement the example

### Implement the `main.ts` module

This module runs in the main thread.

Import `createService`, `createWorkerPool`, and the `GreeterService` type.

```ts
import { once } from "node:events";
import { createService, createWorkerPool } from "scalability";
import type { GreeterService } from "./service.js";
```

Implement and register the main-thread service.

```ts
export class MainThreadService {
  public n = 1;

  getNumber(): number {
    return this.n++;
  }
}
```

Create a pool and register `MainThreadService`.

```ts
const workerPool = createWorkerPool({
  workerCount: 10,
  workerURL: "./dist/service.js",
});

await once(workerPool, "ready");

const app = new MainThreadService();
const service = createService(workerPool);
service.createServiceApp<MainThreadService>(app);
```

Call the Worker service.

```ts
const greeter = service.createServiceAPI<GreeterService>();

const results = [];
for (let i = 0; i < 10; i++) {
  results.push(greeter.greet("happy"));
}

const result = await Promise.all(results);
console.log(result);
```

### Implement the `service.ts` module

This module runs in each Worker thread. It registers `GreeterService` and creates a Service API for `MainThreadService` in the main thread.

```ts
import { createPortStream, createService } from "scalability";
import type { MainThreadService } from "./main.js";

export class GreeterService {
  greet(kind: string) {
    for (let now = Date.now(), then = now + 100; now < then; now = Date.now());
    return `Hello, ${kind} world!`;
  }
}

const service = createService(createPortStream());
service.createServiceApp(new GreeterService());

const app = service.createServiceAPI<MainThreadService>();
console.log(await app.getNumber());
```

The `app.getNumber()` call travels from the Worker to the main thread and returns the value `1`.

## Run the example

### How to run the example

Clone the Scalability repository.

```bash
git clone https://github.com/adamjpatterson/scalability.git
```

Change directory into the example.

```bash
cd scalability/examples/bi-directional-communication
```

Install the example dependencies.

```bash
npm install
```

Build the application.

```bash
npm run clean:build
```

Run the application.

```bash
node --expose-gc .
```

**Output**

```text
1
[
  'Hello, happy world!',
  'Hello, happy world!',
  'Hello, happy world!',
  'Hello, happy world!',
  'Hello, happy world!',
  'Hello, happy world!',
  'Hello, happy world!',
  'Hello, happy world!',
  'Hello, happy world!',
  'Hello, happy world!'
]
```
