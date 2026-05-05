FROM rust:1-slim-bookworm AS rust-builder
WORKDIR /build
COPY core/Cargo.toml core/build.rs ./
COPY core/src ./src
COPY core/data ./data
RUN RUSTFLAGS="-C target-feature=+avx2,+fma" cargo build --release

FROM node:24-trixie-slim AS deps
WORKDIR /app
COPY package*.json ./
RUN npm ci --omit=dev

FROM node:24-trixie-slim
WORKDIR /app
ENV NODE_ENV=production
COPY --from=deps /app/node_modules ./node_modules
COPY --from=rust-builder /build/target/release/librinha_knn.so ./core/rinha-knn.node
COPY core/index.ts ./core/
COPY src ./src
COPY tsconfig.json ./
CMD ["node_modules/.bin/tsx", "src/main.ts"]
