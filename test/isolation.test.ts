import { describe, expect, it } from "vitest";
import { assertIsolatedComposeEnvironment, assertIsolatedTestEnvironment } from "./isolation";

const environment = () => ({
  TYMRA_TEST_DISPOSABLE: "YES", TYMRA_TEST_DATABASE_NAME: "tymra_test",
  DATABASE_URL: "postgresql://tymra:test-only@127.0.0.1:55434/tymra_test",
  REDIS_URL: "redis://127.0.0.1:56380", COMPOSE_PROJECT_NAME: "tymra-test",
  PUBLIC_ORIGIN: "http://localhost:43307", ADMIN_ORIGIN: "http://127.0.0.1:43307",
  WORKER_INTERNAL_URL: "http://127.0.0.1:43407", TYMRA_TEST_MAILPIT_URL: "http://127.0.0.1:58027",
});

describe("test target isolation", () => {
  it("accepts the dedicated local test targets", () => expect(assertIsolatedComposeEnvironment(environment())).toBeUndefined());
  it.each([
    {}, { TYMRA_TEST_DISPOSABLE: "NO" }, { DATABASE_URL: undefined },
    { DATABASE_URL: "postgresql://tymra:test-only@127.0.0.1:5433/tymra_dev" },
    { DATABASE_URL: "postgresql://tymra:test-only@production.example/tymra_test" },
    { TYMRA_TEST_DATABASE_NAME: "tymra_dev" }, { REDIS_URL: "redis://127.0.0.1:6379" },
  ])("rejects missing or unsafe targets before writes", (override) => {
    const candidate = Object.keys(override).length ? { ...environment(), ...override } : {};
    expect(() => assertIsolatedTestEnvironment(candidate)).toThrow();
  });
  it.each([{ COMPOSE_PROJECT_NAME: "tymra" }, { PUBLIC_ORIGIN: "https://tymra.test" }, { WORKER_INTERNAL_URL: "http://127.0.0.1:3100" }])(
    "rejects the normal application runtime", (override) => expect(() => assertIsolatedComposeEnvironment({ ...environment(), ...override })).toThrow(),
  );
  it("does not expose credentials in validation errors", () => {
    try { assertIsolatedTestEnvironment({ ...environment(), DATABASE_URL: "postgresql://tymra:private-password@remote.example/tymra" }); }
    catch (error) { expect(String(error)).not.toContain("private-password"); }
  });
});
