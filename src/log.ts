export class Log {
  static info(...args: unknown[]) {
    console.log("[INFO]", ...args);
  }
  static warn(...args: unknown[]) {
    console.warn("[WARN]", ...args);
  }
  static error(...args: unknown[]) {
    console.error("[ERROR]", ...args);
  }
}
