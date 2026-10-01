# syntax=docker/dockerfile:1

# Pinned exactly (Node and Alpine), so the same commit always builds the same image. Version bumps
# arrive as their own commits (later: Dependabot/Renovate PRs), tested in CI like any other change.
ARG NODE_VERSION=24.21.0
ARG ALPINE_VERSION=3.24
# Must match "packageManager" in package.json. If they drift, pnpm's devEngines onFail: "download"
# would fetch a different pnpm in the middle of the build.
ARG PNPM_VERSION=12.3.4

################################################################################
# Alpine (musl) instead of Debian slim (glibc): ~90 MB smaller. Node's musl builds are
# "Experimental" tier (glibc Linux is Tier 1), which is acceptable because no runtime dependency
# is a native addon (pg is pure JS). If a native module ever breaks here, switch to -slim.
FROM node:${NODE_VERSION}-alpine${ALPINE_VERSION} AS base

# Set working directory for all build stages.
WORKDIR /usr/src/app

# Install pnpm. Only the build stages need it: the runtime stage starts from a fresh base.
RUN --mount=type=cache,target=/root/.npm \
    npm install -g pnpm@${PNPM_VERSION}

################################################################################
# Create a stage for installing production dependencies.
FROM base AS deps

# Bind-mount the manifests instead of copying them, so they don't become a layer of their own, and
# keep pnpm's store in a cache mount that persists between builds but never lands in the image.
# .pnpmfile.cjs is required: the lockfile records its checksum, and --frozen-lockfile fails without it.
RUN --mount=type=bind,source=package.json,target=package.json \
    --mount=type=bind,source=pnpm-lock.yaml,target=pnpm-lock.yaml \
    --mount=type=bind,source=pnpm-workspace.yaml,target=pnpm-workspace.yaml \
    --mount=type=bind,source=.pnpmfile.cjs,target=.pnpmfile.cjs \
    --mount=type=cache,target=/root/.local/share/pnpm/store \
    pnpm install --prod --frozen-lockfile

################################################################################
# Create a stage for building the application.
FROM deps AS build

# Add the devDependencies on top of the prod ones: tsc (TypeScript) is needed to build.
RUN --mount=type=bind,source=package.json,target=package.json \
    --mount=type=bind,source=pnpm-lock.yaml,target=pnpm-lock.yaml \
    --mount=type=bind,source=pnpm-workspace.yaml,target=pnpm-workspace.yaml \
    --mount=type=bind,source=.pnpmfile.cjs,target=.pnpmfile.cjs \
    --mount=type=cache,target=/root/.local/share/pnpm/store \
    pnpm install --frozen-lockfile

# Copy the rest of the source files. This comes after the install, so editing src/ doesn't
# reinstall dependencies, and .dockerignore keeps the context to what the build needs.
COPY . .
# Run the build script.
RUN pnpm run build

################################################################################
# Create a new stage to run the application with minimal runtime dependencies
# where the necessary files are copied from the build stage.
FROM node:${NODE_VERSION}-alpine${ALPINE_VERSION} AS final

WORKDIR /usr/src/app

# Use production node environment by default.
ENV NODE_ENV=production

# Run the application as a non-root user. Files copied below stay owned by root, so the app can
# read its own code but not modify it.
USER node

# package.json holds "type": "module"; without it Node loads dist/*.js as CommonJS and every
# import fails.
COPY package.json .

# Copy the production dependencies from the deps stage and also
# the built application from the build stage into the image.
COPY --from=deps /usr/src/app/node_modules ./node_modules
COPY --from=build /usr/src/app/dist ./dist

# Expose the port that the application listens on.
EXPOSE 5000

# Exec form, so node runs as PID 1 and receives ECS's SIGTERM directly (graceful shutdown).
CMD ["node", "--enable-source-maps", "dist/index.js"]
