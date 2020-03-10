ARG NODE_VERSION=12.x

FROM gcr.io/connectedcars-staging/node-builder.master:$NODE_VERSION as builder

WORKDIR /app

USER root

RUN apt-get update && apt-get install -y mysql-server

USER builder

# Copy application code.
COPY --chown=builder:builder . /app

RUN npm ci

RUN npm test

# Run ci checks
RUN npm run ci-audit

RUN npm run ci-jest

RUN npm run ci-eslint
