import { createPortStream, createService } from "scalability";

export class GreeterService {
  // Create a friendly Greeter Application.
  greet(kind: string) {
    for (let now = Date.now(), then = now + 100; now < then; now = Date.now()); // Block for 100 milliseconds.
    return `Hello, ${kind} world!`;
  }
}

const portStream = createPortStream();

const service = createService(portStream);
service.createServiceApp(new GreeterService());
