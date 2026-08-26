import * as threads from "node:worker_threads";
import * as stream from "node:stream";
import * as crypto from "node:crypto";
import * as path from "node:path";
import { pathToFileURL } from "node:url";
import * as ns from "network-services";

export interface WorkerPoolOptions {
  workerCount: number;
  workerURL: string | URL;
  restartWorkerOnError?: boolean;
  workerOptions?: threads.WorkerOptions;
  duplexOptions?: stream.DuplexOptions;
}

const $data = Symbol("data");
const $messageQueue = Symbol("messageQueue");
const $workers = Symbol("workers");
const $allWorkers = Symbol("allWorkers");
const $callRegistrar = Symbol("callRegistrar");
const $pendingCalls = Symbol("pendingCalls");
const $startWorker = Symbol("startWorker");
const $workerFailed = Symbol("workerFailed");
const $workerPoolOptions = Symbol("workerPoolOptions");
const $restartWorkerOnError = Symbol("restartWorkerOnError");

export class WorkerPoolError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "WorkerPoolError";
  }
}

export class WorkerPool extends stream.Duplex {
  private [$messageQueue]: (ns.CallMessage | ns.ResultMessage)[] = [];
  private [$workers]: threads.Worker[] = [];
  private [$allWorkers]: Set<threads.Worker> = new Set<threads.Worker>();
  private [$callRegistrar]: Map<string, threads.Worker>;
  private [$pendingCalls]: Map<string, threads.Worker> = new Map<string, threads.Worker>();
  private [$workerPoolOptions]: WorkerPoolOptions;
  private [$restartWorkerOnError]: boolean;

  constructor(workerPoolOptions: WorkerPoolOptions) {
    super({ ...workerPoolOptions.duplexOptions, ...{ objectMode: true } });

    if (!Number.isInteger(workerPoolOptions.workerCount) || workerPoolOptions.workerCount < 1) {
      throw new RangeError("workerCount must be a positive integer.");
    }

    this[$callRegistrar] = new Map<string, threads.Worker>();
    this[$workerPoolOptions] = workerPoolOptions;
    this[$restartWorkerOnError] = workerPoolOptions.restartWorkerOnError ?? false;

    const workers: Promise<threads.Worker>[] = [];
    for (let i = 0; i < workerPoolOptions.workerCount; i++) {
      workers.push(this[$startWorker]());
    }

    void (async () => {
      const values = await Promise.allSettled(workers);
      const failure = values.find((value) => value.status === "rejected");

      if (failure?.status === "rejected") {
        const error = failure.reason instanceof Error
          ? failure.reason
          : new WorkerPoolError(String(failure.reason));
        this.destroy(error);
        return;
      }

      if (this.destroyed) return;
      this.emit("ready");
    })();
  }

  private async [$startWorker](): Promise<threads.Worker> {
    return new Promise<threads.Worker>((r, e) => {
      const channelName = `scalability-${crypto.randomUUID()}`;
      const target = this[$workerPoolOptions].workerURL instanceof URL
        ? this[$workerPoolOptions].workerURL.href
        : pathToFileURL(path.resolve(this[$workerPoolOptions].workerURL)).href;
      const channel = new threads.BroadcastChannel(channelName);
      channel.unref();
      const workerOptions = this[$workerPoolOptions].workerOptions;
      const environment = workerOptions?.env === threads.SHARE_ENV
        ? process.env
        : workerOptions?.env ?? process.env;
      const worker = new threads.Worker(
        `const { BroadcastChannel } = require("node:worker_threads"); const channel = new BroadcastChannel(process.env.SCALABILITY_BOOTSTRAP_CHANNEL); channel.unref(); import(process.env.SCALABILITY_BOOTSTRAP_TARGET).then(() => channel.postMessage({ type: "ready" })).catch((error) => { channel.postMessage({ type: "error", name: error instanceof Error ? error.name : "Error", message: error instanceof Error ? error.message : String(error) }); throw error; });`,
        {
          ...(workerOptions ?? {}),
          eval: true,
          env: {
            ...environment,
            SCALABILITY_BOOTSTRAP_CHANNEL: channelName,
            SCALABILITY_BOOTSTRAP_TARGET: target,
          },
        }
      );
      this[$allWorkers].add(worker);
      let settled = false;
      let failed = false;
      const fail = (reason: unknown): void => {
        if (failed) return;
        failed = true;
        channel.close();
        this[$allWorkers].delete(worker);
        if (!settled) {
          settled = true;
          e(reason instanceof Error ? reason : new WorkerPoolError(String(reason)));
          void worker.terminate();
        } else {
          void this[$workerFailed](worker, reason).catch((err: unknown) => {
            this.destroy(err instanceof Error ? err : new WorkerPoolError(String(err)));
          });
        }
      };
      channel.onmessage = (event: MessageEvent) => {
        const data: unknown = event.data;
        if (typeof data !== "object" || data === null) {
          fail(new WorkerPoolError("The worker startup channel sent an invalid message."));
          return;
        }
        const message = data as { type?: unknown; name?: unknown; message?: unknown };
        if (message.type === "ready") {
          channel.close();
          if (!settled) {
            settled = true;
            this[$workers].push(worker);
            r(worker);
          }
        } else {
          const name = typeof message.name === "string" ? message.name : "WorkerPoolError";
          const errorMessage = typeof message.message === "string" ? message.message : "Worker failed to load.";
          fail(Object.assign(new WorkerPoolError(errorMessage), {
            name,
          }));
        }
      };
      channel.onmessageerror = () => {
        fail(new WorkerPoolError("The worker startup channel reported a message error."));
      };
      worker.on("message", (message: ns.CallMessage | ns.ResultMessage) => {
        if (message.type === 0) {
          // A CallMessage was sent by a Worker.
          this[$callRegistrar].set(message.id, worker);
        }
        this[$messageQueue].push(message);
        this.emit($data);
      });
      worker.on("messageerror", (error) => {
        fail(error);
      });
      worker.on("error", fail);
      worker.on("exit", (code) => {
        if (!this.destroyed) fail(new WorkerPoolError(`Worker exited with code ${String(code)}.`));
      });
    });
  }

  private async [$workerFailed](worker: threads.Worker, reason: unknown): Promise<void> {
    const index = this[$workers].indexOf(worker);
    if (index >= 0) this[$workers].splice(index, 1);
    this[$allWorkers].delete(worker);
    await worker.terminate();

    const error = reason instanceof Error
      ? reason
      : new WorkerPoolError("A worker failed.");
    for (const [id, owner] of this[$pendingCalls]) {
      if (owner === worker) {
        this[$pendingCalls].delete(id);
        this[$messageQueue].push(new ns.ResultMessage({
          type: 1,
          id,
          data: { name: error.name, message: error.message },
        }));
      }
    }
    this.emit($data);
    if (this[$restartWorkerOnError] && !this.destroyed) {
      try {
        await this[$startWorker]();
      } catch (restartError) {
        this.destroy(restartError instanceof Error ? restartError : new WorkerPoolError(String(restartError)));
      }
    } else if (!this.destroyed) {
      this.destroy(error);
    }
  }

  _write(
    chunk: ns.CallMessage | ns.ResultMessage,
    encoding: BufferEncoding,
    callback: (error?: Error | null) => void
  ): void {
    // The Mux writes data to *this* stream.Duplex.
    try {
      let worker: threads.Worker | undefined;

      if (chunk.type == 1 || chunk.type == 2) {
        // A ResultMessage returned to a Worker.
        worker = this[$callRegistrar].get(chunk.id);
        this[$callRegistrar].delete(chunk.id);
      } else {
        worker = this[$workers].shift();
      }

      if (!worker) {
        throw new WorkerPoolError("No worker is available to handle the message.");
      }
      if (chunk.type === 0) this[$pendingCalls].set(chunk.id, worker);
      this[$workers].push(worker);
      worker.postMessage(chunk);
      if (chunk.type === 1 || chunk.type === 2) this[$pendingCalls].delete(chunk.id);
      callback();
    } catch (err: unknown) {
      if (chunk.type === 0) this[$pendingCalls].delete(chunk.id);
      callback(err instanceof Error ? err : undefined);
    }
  }

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  _read(size: number): void {
    // The Mux listens for `data` events and reads data from *this* stream.Duplex.
    if (this[$messageQueue].length) {
      while (this[$messageQueue].length) {
        const message = this[$messageQueue].shift();
        if (!this.push(message)) {
          // Push the message to the Mux.
          break;
        }
      }
    } else {
      this.once($data, () => {
        while (this[$messageQueue].length) {
          const message = this[$messageQueue].shift();
          if (!this.push(message)) {
            break;
          }
        }
      });
    }
  }

  _destroy(error: Error | null, callback: (error?: Error | null) => void): void {
    const workers = [...this[$allWorkers]];
    this[$workers].splice(0);
    this[$allWorkers].clear();
    Promise.all(workers.map((worker) => worker.terminate()))
      .then(() => {
        callback(error);
      })
      .catch((err: unknown) => {
        callback(err instanceof Error ? err : undefined);
      });
  }
}

export function createWorkerPool(options: WorkerPoolOptions): WorkerPool {
  return new WorkerPool(options);
}
