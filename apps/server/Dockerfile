# Server Dockerfile for development (monorepo-aware)
FROM node:20

WORKDIR /app

# Copy root package.json and workspace definitions
COPY package.json ./
COPY packages/shared-types/package.json ./packages/shared-types/

# Copy app package.json
COPY apps/server/package.json ./apps/server/

# Install dependencies (workspaces resolved)
RUN npm install

# Copy source code
COPY tsconfig.base.json ./
COPY packages/shared-types/ ./packages/shared-types/
COPY apps/server/ ./apps/server/

WORKDIR /app/apps/server

EXPOSE 8899

CMD ["npm", "run", "dev"]