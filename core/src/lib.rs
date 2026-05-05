mod data;
mod knn;

use napi_derive::napi;

#[napi]
pub fn init_knn() {
    data::init();
    knn::warmup();
}

#[napi]
#[allow(clippy::too_many_arguments)]
pub fn knn_fraud_count(
    v0: f64,
    v1: f64,
    v2: f64,
    v3: f64,
    v4: f64,
    v5: f64,
    v6: f64,
    v7: f64,
    v8: f64,
    v9: f64,
    v10: f64,
    v11: f64,
    v12: f64,
    v13: f64,
) -> u8 {
    let q: [f32; 14] = [
        v0 as f32, v1 as f32, v2 as f32, v3 as f32, v4 as f32, v5 as f32, v6 as f32, v7 as f32,
        v8 as f32, v9 as f32, v10 as f32, v11 as f32, v12 as f32, v13 as f32,
    ];
    knn::knn5_fraud_count(&q, data::dataset())
}
