import { startServer } from "./server";
import { Log } from "./log";

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

startServer(process.env.SOCK || "/tmp/app.sock");
