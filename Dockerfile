ARG NODE_VERSION=12.x

FROM gcr.io/connectedcars-staging/node-builder.master:$NODE_VERSION as builder

WORKDIR /app

USER builder

# Copy application code.
COPY --chown=builder:builder . /app

RUN npm ci

# Run ci checks
RUN npm run ci-audit

RUN npm run ci-jest

RUN npm run ci-eslint
