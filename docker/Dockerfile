FROM node:20
RUN npm install -g pnpm
WORKDIR /app
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml ./
COPY lib/ ./lib/
COPY artifacts/api-server/ ./artifacts/api-server/
COPY artifacts/flychat/ ./artifacts/flychat/
COPY serve.js ./
RUN pnpm install --no-frozen-lockfile
WORKDIR /app/artifacts/api-server
RUN pnpm build
WORKDIR /app/artifacts/flychat
RUN pnpm build
WORKDIR /app
CMD ["sh", "-c", "if [ \"$SERVICE\" = \"frontend\" ]; then node serve.js; else cd /app/artifacts/api-server && node dist/index.cjs; fi"]
