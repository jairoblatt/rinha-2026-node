export const FRAUD_BODY_0 = Buffer.from('{"approved":true,"fraud_score":0.0}');
export const FRAUD_BODY_1 = Buffer.from('{"approved":true,"fraud_score":0.2}');
export const FRAUD_BODY_2 = Buffer.from('{"approved":true,"fraud_score":0.4}');
export const FRAUD_BODY_3 = Buffer.from('{"approved":false,"fraud_score":0.6}');
export const FRAUD_BODY_4 = Buffer.from('{"approved":false,"fraud_score":0.8}');
export const FRAUD_BODY_5 = Buffer.from('{"approved":false,"fraud_score":1.0}');

export const EMPTY_BODY = Buffer.alloc(0);

export const CONTENT_TYPE_KEY = Buffer.from("Content-Type");
export const CONTENT_TYPE_JSON = Buffer.from("application/json");

export const CONTENT_LENGTH_KEY = Buffer.from("Content-Length");
export const CONTENT_LENGTH_ZERO = Buffer.from("0");
