import { createPortStream, createService } from "scalability";

class CrashingService {
  crash(): void {
    process.exit(1);
  }

  exitWorker(): void {
    process.exit(0);
  }

  greet(): string {
    return "hello";
  }
}

const service = createService(createPortStream());
service.createServiceApp(new CrashingService());
