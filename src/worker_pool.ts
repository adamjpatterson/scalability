import * as threads from "node:worker_threads";
import * as stream from "node:stream";
import * as ns from "network-services";

export interface WorkerPoolOptions {
  workerCount: number;
  workerURL: string | URL;
  restartWorkerOnError?: boolean;
  workerOptions?: threads.WorkerOptions;
  duplexOptions?: stream.DuplexOptions;
}

export const $data = Symbol("data");
export const $ready = Symbol("ready");
export const $messageQueue = Symbol("messageQueue");
export const $workers = Symbol("workers");
export const $callRegistrar = Symbol("callRegistrar ");
export const $startWorker = Symbol("startWorker");
export const $workerPoolOptions = Symbol("workerPoolOptions");
export const $restartWorkerOnError = Symbol("restartWorkerOnError");

export class WorkerPool extends stream.Duplex {
  public [$messageQueue]: (ns.CallMessage | ns.ResultMessage)[] = [];
  public [$workers]: threads.Worker[] = [];
  public [$callRegistrar]: Map<string, threads.Worker>;
  public [$workerPoolOptions]: WorkerPoolOptions;
  public [$restartWorkerOnError]: boolean;

  constructor(workerPoolOptions: WorkerPoolOptions) {
    super({ ...workerPoolOptions.duplexOptions, ...{ objectMode: true } });

    this[$callRegistrar] = new Map<string, threads.Worker>();
    this[$workerPoolOptions] = workerPoolOptions;
    this[$restartWorkerOnError] = workerPoolOptions.restartWorkerOnError ?? false;

    const workers: Promise<threads.Worker>[] = [];
    for (let i = 0; i < workerPoolOptions.workerCount; i++) {
      workers.push(this[$startWorker]());
    }

    void (async () => {
      const values = await Promise.allSettled(workers);

      for (const value of values) {
        if (value.status == "rejected") {
          console.error(value.reason);
        }
      }

      this.emit("ready");
    })();
  }

  async [$startWorker](): Promise<threads.Worker> {
    return new Promise<threads.Worker>((r, e) => {
      const worker = new threads.Worker(this[$workerPoolOptions].workerURL, this[$workerPoolOptions].workerOptions);
      worker.on("message", (message: ns.CallMessage | ns.ResultMessage) => {
        if (message.type === 0) {
          // A CallMessage was sent by a Worker.
          this[$callRegistrar].set(message.id, worker);
        }
        this[$messageQueue].push(message);
        this.emit($data);
      });
      worker.once("error", e);
      worker.once("online", () => {
        worker.removeListener("error", e);
        // eslint-disable-next-line @typescript-eslint/no-misused-promises
        worker.once("error", async () => {
          this[$workers].splice(this[$workers].indexOf(worker), 1);
          if (this[$restartWorkerOnError]) {
            const worker = await this[$startWorker]();
            this[$workers].push(worker);
          }
        });
        r(worker);
      });
      this[$workers].push(worker);
    });
  }

  _write(
    chunk: ns.CallMessage | ns.ResultMessage,
    encoding: BufferEncoding,
    callback: (error?: Error | null) => void
  ): void {
    // The Mux writes data to *this* stream.Duplex.
    (async () => {
      let worker: threads.Worker | undefined;

      if (chunk.type == 1 || chunk.type == 2) {
        // A ResultMessage returned to a Worker.
        worker = this[$callRegistrar].get(chunk.id);
        this[$callRegistrar].delete(chunk.id);
      } else {
        worker = this[$workers].shift();
      }

      if (worker) {
        this[$workers].push(worker);
        await new Promise<null>((r, j) => {
          worker.once("messageerror", j);
          worker.postMessage(chunk);
          worker.removeListener("messageerror", j);

          r(null);
        });
        callback();
      }
    })().catch((err: unknown) => {
      callback(err instanceof Error ? err : undefined);
    });
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
    Promise.all(this[$workers].map((worker) => worker.terminate()))
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
