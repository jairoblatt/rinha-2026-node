import { startServer } from "./server";

process.on("uncaughtException", (err) => {
  process.stderr.write(`uncaughtException: ${err.stack ?? err.message}\n`);
  process.exit(1);
});

process.on("unhandledRejection", (reason) => {
  process.stderr.write(`unhandledRejection: ${reason instanceof Error ? reason.stack ?? reason.message : String(reason)}\n`);
  process.exit(1);
});

startServer(process.env.SOCK || "/tmp/app.sock");
