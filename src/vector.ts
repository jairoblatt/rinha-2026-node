import type { Payload } from "./parse";

const vec = new Float32Array(14);

function mccRisk(mcc: number): number {
  switch (mcc) {
    case 5411:
      return 0.15;
    case 5812:
      return 0.3;
    case 5912:
      return 0.2;
    case 5944:
      return 0.45;
    case 7801:
      return 0.8;
    case 7802:
      return 0.75;
    case 7995:
      return 0.85;
    case 4511:
      return 0.35;
    case 5311:
      return 0.25;
    case 5999:
      return 0.5;
    default:
      return 0.5;
  }
}

export function vectorize(p: Payload): Float32Array {
  let v: number;
  v = p.amount / 10_000;

  vec[0] = (((v > 1 ? 1 : v) * 10000 + 0.5) | 0) * 0.0001;
  v = p.installments / 12;

  vec[1] = (((v > 1 ? 1 : v) * 10000 + 0.5) | 0) * 0.0001;
  v = p.customerAvgAmount > 0 ? p.amount / p.customerAvgAmount / 10 : 1;

  vec[2] = (((v > 1 ? 1 : v < 0 ? 0 : v) * 10000 + 0.5) | 0) * 0.0001;
  vec[3] = (((p.hour / 23) * 10000 + 0.5) | 0) * 0.0001;
  vec[4] = (((p.dayOfWeek / 6) * 10000 + 0.5) | 0) * 0.0001;

  if (p.hasLastTx) {
    v = p.minutesSinceLast / 1440;
    vec[5] = (((v > 1 ? 1 : v) * 10000 + 0.5) | 0) * 0.0001;
    v = p.kmFromCurrent / 1000;
    vec[6] = (((v > 1 ? 1 : v) * 10000 + 0.5) | 0) * 0.0001;
  } else {
    vec[5] = -1;
    vec[6] = -1;
  }

  v = p.kmFromHome / 1000;
  vec[7] = (((v > 1 ? 1 : v) * 10000 + 0.5) | 0) * 0.0001;

  v = p.txCount24h / 20;

  vec[8] = (((v > 1 ? 1 : v) * 10000 + 0.5) | 0) * 0.0001;
  vec[9] = p.isOnline ? 1 : 0;
  vec[10] = p.cardPresent ? 1 : 0;
  vec[11] = p.isUnknownMerchant ? 1 : 0;
  vec[12] = mccRisk(p.mcc);

  v = p.merchantAvgAmount / 10_000;

  vec[13] = (((v > 1 ? 1 : v) * 10000 + 0.5) | 0) * 0.0001;

  return vec;
}
