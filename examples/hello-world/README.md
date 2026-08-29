# _"Hello, World!"_

## Introduction

In this example you will use Scalability to run a `GreeterService` in a pool of Worker threads and call it from the main thread.

## Implement the example

### Implement the `main.ts` module

This module runs in the main thread.

Import `createService`, `createWorkerPool`, and the `GreeterService` type.

```ts
import { once } from "node:events";
import { createService, createWorkerPool } from "scalability";
import type { GreeterService } from "./service.js";
```

Create a pool of Worker threads.

```ts
const workerPool = createWorkerPool({
  workerCount: 10,
  workerURL: "./dist/service.js",
});

await once(workerPool, "ready");
```

The `ready` event is emitted after all ten Worker modules have initialized.

Create a Service API and call `greet` concurrently.

```ts
const service = createService(workerPool);
const greeter = service.createServiceAPI<GreeterService>();

const results = [];
for (let i = 0; i < 10; i++) {
  results.push(greeter.greet("happy"));
}

const result = await Promise.all(results);
console.log(result);
```

### Implement the `service.ts` module

This module runs in each Worker thread. It wraps the Worker’s `parentPort` in a `PortStream` and registers a `GreeterService` Service App.

```ts
import { createPortStream, createService } from "scalability";

export class GreeterService {
  greet(kind: string) {
    for (let now = Date.now(), then = now + 100; now < then; now = Date.now());
    return `Hello, ${kind} world!`;
  }
}

const service = createService(createPortStream());
service.createServiceApp(new GreeterService());
```

## Run the example

### How to run the example

Clone the Scalability repository.

```bash
git clone https://github.com/adamjpatterson/scalability.git
```

Change directory into the example.

```bash
cd scalability/examples/hello-world
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
npm start
```

**Output**

```text
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
