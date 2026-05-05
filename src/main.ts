import fs from "node:fs";
import { startServer } from "./server";
import { Log } from "./log";
import { initKnn } from "../core/index";

process.title = "rinha-api";

process.on("uncaughtException", (err) => {
  Log.error("uncaughtException", err.stack ?? err.message);
  process.exit(1);
});

process.on("unhandledRejection", (reason) => {
  Log.error(
    "unhandledRejection",
    reason instanceof Error ? (reason.stack ?? reason.message) : String(reason),
  );

  process.exit(1);
});

const sockPath = process.env.SOCK || "/tmp/app.sock";

function shutdown(): void {
  try {
    fs.unlinkSync(sockPath);
  } catch {}
  process.exit(0);
}

process.on("SIGTERM", shutdown);
process.on("SIGINT", shutdown);
process.on("SIGHUP", shutdown);

process.on("exit", (code) => {
  Log.info(`process exiting with code ${code}`);
});

const t0 = performance.now();
initKnn();
Log.info(`knn ready in ${(performance.now() - t0).toFixed(2)}ms`);

startServer(sockPath);
