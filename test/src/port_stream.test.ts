import { suite, test } from "node:test";
import * as assert from "node:assert";
import { EventEmitter } from "node:events";
import { type MessagePort } from "node:worker_threads";
import { CallMessage } from "network-services";
import { PortStream } from "scalability";

await suite("PortStream", () => {
  void test("Route messages through a PortStream.", async () => {
    const eventTransport = new EventEmitter();
    const transport = eventTransport as unknown as MessagePort;
    transport.postMessage = (value: CallMessage) => {
      queueMicrotask(() => eventTransport.emit("message", value));
    };
    const portStream = new PortStream(transport);
    const message = new CallMessage({ type: 0, id: "port-stream", props: ["greet"], args: [] });
    const received = new Promise<CallMessage>((resolve) => portStream.once("data", resolve));

    try {
      await new Promise<void>((resolve, reject) => {
        portStream.write(message, (error) => {
          if (error) reject(error);
          else resolve();
        });
      });
      const result = await received;
      assert.strictEqual(result.type, message.type);
      assert.strictEqual(result.id, message.id);
      assert.deepStrictEqual(result.props, message.props);
      assert.deepStrictEqual(result.args, message.args);
    } finally {
      portStream.destroy();
    }
  });

  void test("Report writes when PortStream has no port.", async () => {
    const portStream = new PortStream();
    portStream.on("error", () => undefined);
    const error = await new Promise<Error>((resolve, reject) => {
      portStream.write(new CallMessage({ type: 0, id: "no-port", props: [], args: [] }), (reason) => {
        if (reason) resolve(reason);
        else reject(new Error("Expected PortStream.write to fail."));
      });
    });
    assert.match(error.message, /No message port/);
    portStream.destroy();
  });

  void test("Handle PortStream message errors.", async () => {
    const eventTransport = new EventEmitter();
    const transport = eventTransport as unknown as MessagePort;
    transport.postMessage = () => undefined;
    const portStream = new PortStream(transport);
    const error = new Promise<Error>((resolve) => portStream.once("error", resolve));
    const reason = new Error("simulated message error");
    eventTransport.emit("messageerror", reason);
    assert.strictEqual(await error, reason);
    assert.strictEqual(portStream.destroyed, true);
  });
});
