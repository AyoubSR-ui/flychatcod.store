FROM node:20-alpine
ARG CACHEBUST=1
RUN npm install -g pnpm
WORKDIR /app
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml ./
COPY lib/ ./lib/
COPY artifacts/api-server/ ./artifacts/api-server/
RUN pnpm install --no-frozen-lockfile
WORKDIR /app/artifacts/api-server
RUN pnpm build
CMD ["node", "--max-http-header-size=65536", "dist/index.cjs"]
# force rebuild Tue Mar 24 21:49:32 AST 2026
