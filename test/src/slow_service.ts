import { createPortStream, createService } from "scalability";

class SlowService {
  async wait(milliseconds: number): Promise<string> {
    await new Promise<void>((resolve) => setTimeout(resolve, milliseconds));
    return "done";
  }
}

const service = createService(createPortStream());
service.createServiceApp(new SlowService());
