FROM node:24-trixie-slim AS deps
WORKDIR /app
COPY package*.json ./
RUN npm ci --omit=dev

FROM node:24-trixie-slim
WORKDIR /app
ENV NODE_ENV=production
COPY --from=deps /app/node_modules ./node_modules
COPY src ./src
COPY tsconfig.json ./
CMD ["node_modules/.bin/tsx", "src/main.ts"]
