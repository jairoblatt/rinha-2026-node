export interface Payload {
  amount: number;
  customerAvgAmount: number;
  merchantAvgAmount: number;
  kmFromHome: number;
  kmFromCurrent: number;
  txCount24h: number;
  mcc: number;
  minutesSinceLast: number;
  installments: number;
  hour: number;
  dayOfWeek: number;
  isOnline: boolean;
  cardPresent: boolean;
  isUnknownMerchant: boolean;
  hasLastTx: boolean;
}

const COLON = 58;
const QUOTE = 34;
const CLOSE_BRACKET = 93;
const MINUS = 45;
const DOT = 46;
const CHAR_N = 110;

const POW10 = [1, 10, 100, 1000, 10000, 100000, 1000000, 10000000];

let p = 0;
let buf: Buffer = Buffer.alloc(0);

const merchantStarts = new Int32Array(16);
const merchantEnds = new Int32Array(16);

const iso = new Int16Array(5);

const payload: Payload = {
  amount: 0,
  customerAvgAmount: 0,
  merchantAvgAmount: 0,
  kmFromHome: 0,
  kmFromCurrent: 0,
  txCount24h: 0,
  mcc: 0,
  minutesSinceLast: 0,
  installments: 0,
  hour: 0,
  dayOfWeek: 0,
  isOnline: false,
  cardPresent: false,
  isUnknownMerchant: false,
  hasLastTx: false,
};

function toNextValue(): void {
  const len = buf.length;
  while (p < len) {
    const c = buf[p];
    if (c === COLON) {
      p++;
      while (p < len && buf[p] <= 32) p++;
      return;
    }
    if (c === QUOTE) {
      p++;
      while (p < len && buf[p] !== QUOTE) p++;
      p++;
    } else {
      p++;
    }
  }
}

function skipString(): void {
  const len = buf.length;
  if (p < len && buf[p] === QUOTE) p++;
  while (p < len && buf[p] !== QUOTE) p++;
  p++;
}

function scanU32(): number {
  const len = buf.length;
  let v = 0;
  while (p < len) {
    const c = buf[p];
    if (c < 48 || c > 57) break;
    v = (v * 10 + c - 48) | 0;
    p++;
  }
  return v;
}

function scanF32(): number {
  const len = buf.length;
  let neg = false;
  if (p < len && buf[p] === MINUS) {
    neg = true;
    p++;
  }

  let intPart = 0;
  while (p < len && buf[p] >= 48 && buf[p] <= 57) {
    intPart = (intPart * 10 + buf[p] - 48) | 0;
    p++;
  }

  let v = intPart;
  if (p < len && buf[p] === DOT) {
    p++;
    let frac = 0;
    let digits = 0;
    while (p < len && buf[p] >= 48 && buf[p] <= 57) {
      if (digits < 7) {
        frac = frac * 10 + (buf[p] - 48);
        digits++;
      }
      p++;
    }
    if (digits > 0) v += frac / POW10[digits];
  }

  return neg ? -v : v;
}

function scanBool(): boolean {
  const isTrue = p < buf.length && buf[p] === 116;
  p += isTrue ? 4 : 5;
  return isTrue;
}

function scanMcc(): number {
  const len = buf.length;
  if (p < len && buf[p] === QUOTE) p++;
  const v = scanU32();
  if (p < len && buf[p] === QUOTE) p++;
  return v;
}

function scanIso(): void {
  const len = buf.length;
  if (p < len && buf[p] === QUOTE) p++;
  const base = p;
  if (len - base < 20) return;
  iso[0] =
    (buf[base] - 48) * 1000 + (buf[base + 1] - 48) * 100 + (buf[base + 2] - 48) * 10 + (buf[base + 3] - 48);
  iso[1] = (buf[base + 5] - 48) * 10 + (buf[base + 6] - 48);
  iso[2] = (buf[base + 8] - 48) * 10 + (buf[base + 9] - 48);
  iso[3] = (buf[base + 11] - 48) * 10 + (buf[base + 12] - 48);
  iso[4] = (buf[base + 14] - 48) * 10 + (buf[base + 15] - 48);
  p += 20;
  while (p < len && buf[p] !== QUOTE) p++;
  p++;
}

function dayOfWeek(y: number, m: number, d: number): number {
  const T = [0, 3, 2, 5, 0, 3, 5, 1, 4, 6, 2, 4];
  const ya = m < 3 ? y - 1 : y;
  return (((ya + ((ya / 4) | 0) - ((ya / 100) | 0) + ((ya / 400) | 0) + T[m - 1] + d) % 7) + 6) % 7;
}

function daysSinceEpoch(y: number, m: number, d: number): number {
  if (m <= 2) y--;
  const era = ((y >= 0 ? y : y - 399) / 400) | 0;
  const yoe = y - era * 400;
  const mm = m > 2 ? m - 3 : m + 9;
  const doy = (((153 * mm + 2) / 5) | 0) + d - 1;
  const doe = yoe * 365 + ((yoe / 4) | 0) - ((yoe / 100) | 0) + doy;
  return era * 146097 + doe - 719468;
}

function minutesBetween(
  y1: number,
  mo1: number,
  d1: number,
  h1: number,
  mi1: number,
  y2: number,
  mo2: number,
  d2: number,
  h2: number,
  mi2: number,
): number {
  const t1 = daysSinceEpoch(y1, mo1, d1) * 1440 + h1 * 60 + mi1;
  const t2 = daysSinceEpoch(y2, mo2, d2) * 1440 + h2 * 60 + mi2;
  return t2 > t1 ? t2 - t1 : 0;
}

export function parse(buffer: Buffer): Payload {
  buf = buffer;
  p = 0;

  toNextValue();
  skipString();

  toNextValue();
  toNextValue();
  payload.amount = scanF32();

  toNextValue();
  payload.installments = scanU32();

  toNextValue();
  scanIso();
  const reqY = iso[0],
    reqMo = iso[1],
    reqD = iso[2],
    reqH = iso[3],
    reqMin = iso[4];
  payload.hour = reqH;
  payload.dayOfWeek = dayOfWeek(reqY, reqMo, reqD);

  toNextValue();
  toNextValue();
  payload.customerAvgAmount = scanF32();

  toNextValue();
  payload.txCount24h = scanU32();

  toNextValue();
  p++;
  let mc = 0;
  const len = buf.length;
  while (p < len && buf[p] !== CLOSE_BRACKET) {
    if (buf[p] === QUOTE) {
      p++;
      merchantStarts[mc] = p;
      while (p < len && buf[p] !== QUOTE) p++;
      merchantEnds[mc] = p;
      if (mc < 16) mc++;
      p++;
    } else {
      p++;
    }
  }
  if (p < len) p++;

  toNextValue();
  toNextValue();
  if (p < len && buf[p] === QUOTE) p++;
  const midStart = p;
  while (p < len && buf[p] !== QUOTE) p++;
  const midEnd = p;
  p++;

  toNextValue();
  payload.mcc = scanMcc();

  toNextValue();
  payload.merchantAvgAmount = scanF32();

  toNextValue();
  toNextValue();
  payload.isOnline = scanBool();

  toNextValue();
  payload.cardPresent = scanBool();

  toNextValue();
  payload.kmFromHome = scanF32();

  toNextValue();
  payload.hasLastTx = p < len && buf[p] !== CHAR_N;

  if (payload.hasLastTx) {
    toNextValue();
    scanIso();
    const ltY = iso[0],
      ltMo = iso[1],
      ltD = iso[2],
      ltH = iso[3],
      ltMin = iso[4];

    toNextValue();
    payload.kmFromCurrent = scanF32();
    payload.minutesSinceLast = minutesBetween(ltY, ltMo, ltD, ltH, ltMin, reqY, reqMo, reqD, reqH, reqMin);
  } else {
    payload.kmFromCurrent = 0;
    payload.minutesSinceLast = 0;
  }

  const midLen = midEnd - midStart;
  payload.isUnknownMerchant = true;
  for (let i = 0; i < mc; i++) {
    const sLen = merchantEnds[i] - merchantStarts[i];
    if (sLen !== midLen) continue;
    let match = true;
    for (let j = 0; j < sLen; j++) {
      if (buf[merchantStarts[i] + j] !== buf[midStart + j]) {
        match = false;
        break;
      }
    }
    if (match) {
      payload.isUnknownMerchant = false;
      break;
    }
  }

  return payload;
}
