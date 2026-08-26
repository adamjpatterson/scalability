import { createPortStream, createService } from "scalability";

class BurstService {
  value(number: number): number {
    return number;
  }
}

const service = createService(createPortStream());
service.createServiceApp(new BurstService());
