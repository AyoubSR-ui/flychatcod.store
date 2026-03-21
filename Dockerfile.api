FROM node:20-alpine

WORKDIR /app

RUN npm install -g pnpm

COPY package.json pnpm-workspace.yaml pnpm-lock.yaml ./
COPY lib/ ./lib/
COPY artifacts/api-server/ ./artifacts/api-server/

RUN pnpm install --no-frozen-lockfile

WORKDIR /app/artifacts/api-server

RUN pnpm build

EXPOSE 8080

CMD ["node", "dist/index.cjs"]
# cache bust Sun Mar 22 02:07:56 AST 2026
