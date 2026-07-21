import { createBrowserWorkerConfig } from "./config.js";
import { createBrowserWorkerServer } from "./server.js";

const config = createBrowserWorkerConfig();
const server = createBrowserWorkerServer(config);
server.listen(config.port, config.host, () => {
  process.stdout.write(`${JSON.stringify({ service: "tymra-browser-worker", listening: `${config.host}:${config.port}`, engine: "ulixee" })}\n`);
});

for (const signal of ["SIGINT", "SIGTERM"]) {
  process.on(signal, () => server.close(() => process.exit(0)));
}
