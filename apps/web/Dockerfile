# Web Dockerfile for development (monorepo-aware)
FROM node:20

WORKDIR /app

# Copy root package.json and workspace definitions
COPY package.json ./
COPY packages/shared-types/package.json ./packages/shared-types/

# Copy app package.json
COPY apps/web/package.json ./apps/web/

# Install dependencies (workspaces resolved)
RUN npm install

# Copy source code
COPY tsconfig.base.json ./
COPY packages/shared-types/ ./packages/shared-types/
COPY apps/web/ ./apps/web/

WORKDIR /app/apps/web

EXPOSE 3000

CMD ["npm", "run", "dev"]