import { prisma } from "@tymra/db";
import { testRuntimeEnvironment } from "../test/runtime-environment";
import { stopTestRuntime } from "./compose-runtime";

export default async function globalTeardown() {
  await prisma.$disconnect();
  stopTestRuntime(testRuntimeEnvironment());
}
