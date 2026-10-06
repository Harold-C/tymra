/** Validate targets before importing persistence or starting a test runtime. */
export function assertIsolatedTestEnvironment(environment: NodeJS.ProcessEnv = process.env) {
  if (environment.TYMRA_TEST_DISPOSABLE !== "YES") {
    throw new Error("Set TYMRA_TEST_DISPOSABLE=YES for an explicitly disposable test environment.");
  }
  const database = connection(environment.DATABASE_URL, "DATABASE_URL", ["postgres:", "postgresql:"]);
  const name = decodeURIComponent(database.pathname.slice(1));
  if (!/^tymra_(?:test|e2e)(?:_[a-z0-9]+)*$/u.test(name)
    || environment.TYMRA_TEST_DATABASE_NAME !== name || database.port === "5433") {
    throw new Error("DATABASE_URL must match TYMRA_TEST_DATABASE_NAME and select a dedicated tymra_test or tymra_e2e database.");
  }
  const redis = connection(environment.REDIS_URL, "REDIS_URL", ["redis:"]);
  if ((!redis.port || redis.port === "6379") && redis.hostname !== "redis-test") {
    throw new Error("REDIS_URL must select a dedicated test Redis service or a separate loopback port.");
  }
  return { databaseName: name };
}

export function assertIsolatedComposeEnvironment(environment: NodeJS.ProcessEnv = process.env) {
  assertIsolatedTestEnvironment(environment);
  if (!/^tymra-(?:test|e2e)(?:-[a-z0-9]+)*$/u.test(environment.COMPOSE_PROJECT_NAME ?? "")) {
    throw new Error("COMPOSE_PROJECT_NAME must identify a dedicated tymra-test or tymra-e2e project.");
  }
  for (const name of ["PUBLIC_ORIGIN", "ADMIN_ORIGIN", "WORKER_INTERNAL_URL", "TYMRA_TEST_MAILPIT_URL"]) {
    const url = connection(environment[name], name, ["http:"]);
    if (!url.port || ["3000", "3100", "3300", "3307", "3400", "8025", "58025"].includes(url.port)) {
      throw new Error(`${name} must use a separate test port.`);
    }
  }
}

function connection(value: string | undefined, name: string, protocols: string[]) {
  let url: URL;
  try { url = new URL(value ?? ""); }
  catch { throw new Error(`${name} must be explicitly configured for the isolated test environment.`); }
  if (!protocols.includes(url.protocol) || !["localhost", "127.0.0.1", "[::1]", "postgres-test", "redis-test"].includes(url.hostname)) {
    throw new Error(`${name} must use a local isolated test target.`);
  }
  return url;
}
