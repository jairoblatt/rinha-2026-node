import uWS from "uWebSockets.js";
import { parse } from "./parse";
import { vectorize } from "./vector";
import {
  EMPTY_BODY,
  FRAUD_BODIES,
  CONTENT_TYPE_KEY,
  CONTENT_TYPE_JSON,
  CONTENT_LENGTH_KEY,
  CONTENT_LENGTH_ZERO,
} from "./response";
import { initKnn, knnFraudCount } from "../core/index";

initKnn();

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

    const vec = vectorize(parse(Buffer.from(chunk)));
    const score = knnFraudCount(
      vec[0],
      vec[1],
      vec[2],
      vec[3],
      vec[4],
      vec[5],
      vec[6],
      vec[7],
      vec[8],
      vec[9],
      vec[10],
      vec[11],
      vec[12],
      vec[13],
    );

    res.cork(() => {
      res.writeHeader(CONTENT_TYPE_KEY, CONTENT_TYPE_JSON).end(FRAUD_BODIES[score]);
    });
  });
}
