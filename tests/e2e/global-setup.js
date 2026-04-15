/* eslint-disable @typescript-eslint/no-require-imports */
const { execSync } = require("child_process");
const path = require("path");

const APP_ROOT = path.resolve(__dirname, "../..");
require("dotenv").config({ path: path.join(APP_ROOT, ".env") });

module.exports = async function globalSetup() {
  execSync("npx tsx prisma/seed.ts", {
    cwd: APP_ROOT,
    stdio: "inherit",
  });
};
