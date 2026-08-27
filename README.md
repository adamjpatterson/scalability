# _Scalability_

Scalability is a type-safe service scaling facility built on _Network-Services_.

## Introduction

_Scalability_ provides a simple and intuitive API for scaling Node.js modules using Worker threads. You can create a [Service App](https://github.com/adamjpatterson/network-services#service-app) in your scaled module and call its methods from the main thread using a [Service API](https://github.com/adamjpatterson/network-services#service-api). Conversely, methods can be called in the main thread from scaled modules in the same way.

_Scalability_ allows you to easily transform your single threaded application into a multithreaded one.

### Features

- Call methods on a Service App running in a Worker thread using a type-safe API: _code completion_, _parameter types_, and _return types_.
- Return values _and_ Errors are marshalled back to the caller.
- Infinite property nesting; you can use a Service API to call _nested_ properties on a Service App at any depth.
- Bi-directional asynchronous RPC - communication goes both ways - _Scalability_ allows for calls from the main thread to a Worker and from a Worker to the main thread.

## Table of contents

- [Installation](#installation)
- [Concepts](#concepts)
- [Usage](#usage)
- [API](#api)
- [Tests](#tests)
- [Support](#support)

## Installation

```bash
npm install scalability
```

## Concepts

_Scalability_ is an extension of the _Network-Services_ RPC Service facility; hence, the concepts that it introduces are _Network-Services_ concepts e.g., [Services](https://github.com/adamjpatterson/network-services#service), [Service Apps](https://github.com/adamjpatterson/network-services#service-app), and [Service APIs](https://github.com/adamjpatterson/network-services#service-api).

Please see the [_Network-Services_](https://github.com/adamjpatterson/network-services#concepts) documentation if you would like to learn more about these concepts.

## Usage

A _Scalability_ application consists of a main thread (e.g., `main.js`) and a scaled module (e.g., `service.js`). In this example the module that runs in the main thread is named `main.js` and the module that will be scaled is named `service.js`.

### Implement the `main.ts` module

This is the module that runs in the main thread.

#### Import the `createService` and `createWorkerPool` helper functions and the **_type_** of the service application (i.e., `GreeterService`) that will run in the Worker thread.

```ts
import { once } from "node:events";
import { createService, createWorkerPool } from "scalability";
import { GreeterService } from "./service.js";
```

#### Create a pool of Workers consisting of 10 instances of the `service.js` module.

```ts
const workerPool = createWorkerPool({
  workerCount: 10,
  workerURL: "./dist/service.js",
});
```

#### Wait for all Workers to initialize.

```ts
await once(workerPool, "ready");
```

#### Create a Service using the `WorkerPool` stream and a Service API of type `GreeterService`.

The `greeter` object will support _code completion_, _parameter types_, and _return types_.

```ts
const service = createService(workerPool);
const greeter = service.createServiceAPI<GreeterService>();
```

#### Call the `greet` method on the `GreeterService` 100 times and log the results.

The `greeter.greet` method returns a promise because it is called asynchronously using a `MessagePort`.

```ts
const results = [];
for (let i = 0; i < 100; i++) {
  results.push(greeter.greet("happy"));
}

const result = await Promise.all(results);
console.log(result);
```

### Implement the `service.ts` module

This is the scaled module specified in the options of the `WorkerPool` constructor. It contains the `GreeterService` Service App.

#### Import the `createPortStream` and `createService` helper functions.

```ts
import { createPortStream, createService } from "scalability";
```

#### Implement a `GreeterService` service.

```ts
export class GreeterService {
  // Create a friendly Greeter Application.
  greet(kind: string) {
    for (let now = Date.now(), then = now + 100; now < then; now = Date.now()); // Block for 100 milliseconds.
    return `Hello, ${kind} world!`;
  }
}
```

#### Create a `PortStream` adapter instance using the `createPortStream` helper function.

This adapter will wrap the Worker thread's `parentPort` in a `stream.Duplex` in order for it be used by _Network-Services_.

```ts
const portStream = createPortStream();
```

#### Create a Service using the portStream instance and create a Service App using an instance of `GreeterService`.

```ts
const service = createService(portStream);
service.createServiceApp(new GreeterService());
```

That's all it takes to scale this `GreeterService` application. Please see the [Hello, World! example](https://github.com/adamjpatterson/scalability/tree/main/examples/hello-world) for a complete working implementation.

## API

### The ScalableService class

#### scalability.createService(stream)

- `stream` `<WorkerPool | PortStream>` An instance of a `WorkerPool` or an instance of a `PortStream`. This is a type narrowed version of the _Network-Services_ `createService` helper function. This helper function will accept either a `WorkerPool` or a `PortStream` as an argument, both of which are `stream.Duplex`.

Returns: `<Service>`

_public_ **service.createServiceApp\<T\>(app, options)**

- `app` `<object>` An instance of your application.
- `options` `<ServiceAppOptions<T>>`
  - `paths` `<Array<PropPath<Async<T>>>>` An `Array` of _property paths_ (i.e., dot-path `string`s). _If defined_, only property paths in this list may be called on the Service App. Each element of the Array is a `PropPath` and a `PropPath` is simply a dot-path `string` representation of a property path. **Default:** `undefined`.

Returns: `<ServiceApp<T>>`

_public_ **service.createServiceAPI\<T\>(options)**

- `options` `<ServiceAPIOptions>`
  - `timeout` `<number>` Optional argument in milliseconds that specifies the `timeout` for function calls. **Default:** `undefined` (i.e., no timeout).

Returns: `<Async<T>>` A `Proxy` of type `<T>` that consists of asynchronous analogues of methods in `<T>`.

### The WorkerPool class

#### scalability.createWorkerPool(options)

- `options` `<WorkerPoolOptions>`
  - `workerCount` `<number>` The positive integer number of worker threads to be spawned.
  - `workerURL` `<string | URL>` The URL or path to the `.js` module file. This is the module that will be scaled according to the value specified for `workerCount`.
  - `restartWorkerOnError` `<boolean>` A boolean setting specifying if Workers should be restarted after an `error`, `messageerror`, or unexpected `exit`. **Default**: `false`
  - `workerOptions` `<worker_threads.WorkerOptions>` Optional `worker_threads.WorkerOptions` to be passed to each Worker instance. The pool uses an internal bootstrap worker to detect successful module initialization, so `eval` and internal bootstrap environment variables are managed by the pool.
  - `duplexOptions` `<stream.DuplexOptions>` Optional `stream.DuplexOptions` to be passed to the `stream.Duplex` i.e., the parent class of the `WorkerPool`.

Returns: `<WorkerPool>`

The `ready` event is emitted after all worker modules have initialized. If a worker fails, the pool emits an `error` event and closes unless `restartWorkerOnError` is enabled. With restarting enabled, calls in progress on the failed worker reject and the worker is replaced; calls are not automatically retried. Writes fail with `WorkerPoolError` when no worker is available.

A `WorkerPool` wraps the `MessagePorts` of the Worker threads into a single `stream.Duplex`. Hence, a `WorkerPool` _is a_ `stream.Duplex`, so it can be passed to the _Network-Services_ `createService` helper function. This is the stream adapter that is used in the module of the main thread.

### The PortStream class

#### scalability.createPortStream(options)

- `options` `<stream.DuplexOptions>` Optional `stream.DuplexOptions` to be passed to the `stream.Duplex` i.e., the parent class of the `PortStream`.

A `PortStream` wraps the `parentPort` of the Worker thread into a `stream.Duplex`. Hence, a `PortStream` _is a_ `stream.Duplex`, so it can be passed to the _Network-Services_ `createService` helper function. This is the stream adapter that is used in the Worker module.

The `PortStream` class can also be constructed with an explicit `worker_threads.MessagePort` or `worker_threads.Worker` and optional stream options. The `createPortStream` helper is the convenience API for wrapping the current worker's `parentPort`.

If the underlying port reports a `messageerror`, the `PortStream` emits the error and is destroyed. Writes fail when no port is available.

## Tests

### How to run the test suite

#### Clone the repository.

```bash
git clone https://github.com/adamjpatterson/scalability
```

#### Change directory into the root of the repository.

```bash
cd scalability
```

#### Install Scalability dependencies.

```bash
npm install
```

#### Run the tests.

This command performs a clean build of the library, builds the test workspace, and runs the tests with Node.js’s built-in test runner.

```bash
npm test
```

#### Build and lint.

To run the other standard checks independently:

```bash
npm run build
npm run lint:all
```

## Support

If you have a feature request or run into any issues, feel free to submit an [issue](https://github.com/adamjpatterson/scalability/issues) or start a [discussion](https://github.com/adamjpatterson/scalability/discussions). You’re also welcome to reach out directly to one of the authors.

- [Adam Patterson](https://github.com/adamjpatterson)
