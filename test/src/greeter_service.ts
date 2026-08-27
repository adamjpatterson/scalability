import type { Async } from "network-services";
import type { MainThreadService } from "./main_thread_service.js";

export class GreeterService {
  constructor(private readonly app: Async<MainThreadService>) {}

  greet(kind: string): string {
    for (let now = Date.now(), then = now + 100; now < then; now = Date.now());
    return `Hello, ${kind} world!`;
  }

  getNumber(): Promise<number> {
    return this.app.getNumber();
  }
}
