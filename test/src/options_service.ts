import { workerData } from "node:worker_threads";
import { createPortStream, createService } from "scalability";

class OptionsService {
  getWorkerData(): unknown {
    return workerData;
  }
}

const service = createService(createPortStream());
service.createServiceApp(new OptionsService());
