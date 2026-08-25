import { createPortStream, createService } from "scalability";
import { Greeter } from "./greeter.js";
import type { App } from "./app.js";

const portStream = createPortStream();

const service = createService(portStream);

const app = service.createServiceAPI<App>();
service.createServiceApp(new Greeter(app));
