import uWS from "uWebSockets.js";
import fs from "node:fs";
import { handleFraud, handleReady } from "./handlers";
import { Log } from "./log";

export function startServer(sockPath: string) {
  if (fs.existsSync(sockPath)) {
    fs.unlinkSync(sockPath);
  }

  uWS
    .App()
    .get("/ready", (res) => handleReady(res))
    .post("/fraud-score", (res) => handleFraud(res))
    .listen_unix((token) => {
      if (!token) {
        throw new Error("listen failed");
      }

      fs.chmodSync(sockPath, 0o666);
      Log.info("listening on", sockPath);
    }, sockPath);
}
