import { createPortStream, createService } from "scalability";
import { GreeterService } from "./greeter_service.js";
import type { MainThreadService } from "./main_thread_service.js";

const portStream = createPortStream();

const service = createService(portStream);

const app = service.createServiceAPI<MainThreadService>();
service.createServiceApp(new GreeterService(app));
