import uWS from "uWebSockets.js";
import { parse } from "./parse";
import { vectorize } from "./vector";
import {
  EMPTY_BODY,
  FRAUD_BODY_0,
  CONTENT_TYPE_KEY,
  CONTENT_TYPE_JSON,
  CONTENT_LENGTH_KEY,
  CONTENT_LENGTH_ZERO,
} from "./response";

export function handleReady(res: uWS.HttpResponse): void {
  res.onAborted(() => {});

  res.cork(() => {
    res.writeHeader(CONTENT_LENGTH_KEY, CONTENT_LENGTH_ZERO).end(EMPTY_BODY);
  });
}

export function handleFraud(res: uWS.HttpResponse): void {
  res.onAborted(() => {});

  res.onData((chunk, isLast) => {
    if (!isLast) {
      return;
    }

    const payload = vectorize(parse(Buffer.from(chunk)));

    res.cork(() => {
      res.writeHeader(CONTENT_TYPE_KEY, CONTENT_TYPE_JSON).end(FRAUD_BODY_0);
    });
  });
}
