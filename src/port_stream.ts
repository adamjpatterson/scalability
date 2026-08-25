import * as threads from "node:worker_threads";
import * as stream from "node:stream";
import { CallMessage, ResultMessage } from "network-services";

const $data = Symbol("data");

export class PortStream extends stream.Duplex {
  public port?: threads.MessagePort | threads.Worker;
  public messageQueue: (CallMessage | ResultMessage)[];

  constructor(
    port?: threads.MessagePort | threads.Worker,
    options?: stream.DuplexOptions
  ) {
    super({ ...options, ...{ objectMode: true } });
    this.messageQueue = [];
    this.port = port ?? threads.parentPort ?? undefined;
    if (this.port) {
      this.port.on("message", (message: CallMessage | ResultMessage) => {
        this.messageQueue.push(message);
        this.emit($data);
      });
    }
  }

  public _write(
    chunk: CallMessage | ResultMessage,
    encoding: BufferEncoding,
    callback: (error?: Error | null) => void
  ): void {
    (async () => {
      await new Promise<null>((r, e) => {
        this.port?.once("messageerror", e);
        this.port?.postMessage(chunk);
        this.port?.removeListener("messageerror", e);
        r(null);
      });
      callback();
    })().catch((err: unknown) => {
      callback(err instanceof Error ? err : undefined);
    });
  }

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  public _read(size: number): void {
    try {
      if (this.messageQueue.length) {
        while (this.messageQueue.length) {
          const message = this.messageQueue.shift();
          if (!this.push(message)) {
            break;
          }
        }
      } else {
        this.once($data, () => {
          while (this.messageQueue.length) {
            const message = this.messageQueue.shift();
            if (!this.push(message)) {
              break;
            }
          }
        });
      }
    } catch (err) {
      this.destroy(err instanceof Error ? err : undefined);
    }
  }
}

export function createPortStream(options?: stream.DuplexOptions): PortStream {
  return new PortStream(threads.parentPort ?? undefined, options);
}
