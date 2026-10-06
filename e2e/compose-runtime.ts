import { execFileSync } from "node:child_process";
import { resolve } from "node:path";
import { assertIsolatedComposeEnvironment } from "../test/isolation";

export function isolatedCompose(environment: NodeJS.ProcessEnv, ...arguments_: string[]) {
  assertIsolatedComposeEnvironment(environment);
  execFileSync("docker", ["compose", "--env-file", "/dev/null", "-p", environment.COMPOSE_PROJECT_NAME!, "-f", resolve("docker-compose.test.yml"), ...arguments_], {
    cwd: process.cwd(), env: environment, stdio: "inherit",
  });
}

export function recreateRuntime(environment: NodeJS.ProcessEnv) {
  isolatedCompose(environment, "up", "-d", "--no-deps", "--force-recreate", "web", "worker", "api");
  isolatedCompose(environment, "exec", "-T", "web", "node", "-e", 'process.exit(process.env.PROVIDER_MODE === "demo" && process.env.PUBLIC_COLLECTION_MODE === "fixture" ? 0 : 1)');
}

export function stopTestRuntime(environment: NodeJS.ProcessEnv) {
  isolatedCompose(environment, "down", "--volumes", "--remove-orphans");
}
