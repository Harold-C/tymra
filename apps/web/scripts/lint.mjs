import { ESLint } from "eslint";

const eslint = new ESLint({
  cwd: new URL("..", import.meta.url).pathname,
  cache: true,
  cacheLocation: "node_modules/.cache/eslint/.eslintcache",
  cacheStrategy: "content",
  errorOnUnmatchedPattern: false,
});
const results = await eslint.lintFiles([
  "app",
  "components",
  "i18n",
  "lib",
  "middleware.ts",
  "tailwind.config.ts",
]);
const formatter = await eslint.loadFormatter("stylish");
const output = formatter.format(results);
const errorCount = results.reduce((total, result) => total + result.errorCount, 0);
const warningCount = results.reduce((total, result) => total + result.warningCount, 0);
const exitCode = errorCount === 0 && warningCount === 0 ? 0 : 1;

if (output) {
  process.stdout.write(`${output}\n`, () => process.exit(exitCode));
} else {
  process.exit(exitCode);
}
