import { startServer } from "./server";

startServer(process.env.SOCK || "/tmp/app.sock");
