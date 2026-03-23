FROM node:20-alpine
RUN npm install -g pnpm
WORKDIR /app
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml ./
COPY lib/ ./lib/
COPY artifacts/api-server/ ./artifacts/api-server/
RUN pnpm install --no-frozen-lockfile
WORKDIR /app/artifacts/api-server
RUN pnpm build
CMD ["node", "dist/index.cjs"]
# cache bust Mon Mar 23 11:07:11 AST 2026
