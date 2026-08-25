import type { Async } from "network-services";
import type { App } from "./app.js";

export class Greeter {
  constructor(private readonly app: Async<App>) {}

  greet(kind: string): string {
    for (let now = Date.now(), then = now + 100; now < then; now = Date.now());
    return `Hello, ${kind} world!`;
  }

  getNumber(): Promise<number> {
    return this.app.getNumber();
  }
}
