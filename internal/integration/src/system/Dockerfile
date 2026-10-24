FROM oven/bun:1.3.6@sha256:f20d9cf365ab35529384f1717687c739c92e6f39157a35a95ef06f4049a10e4a AS bun

FROM mcr.microsoft.com/playwright:v1.63.0-noble@sha256:eff16c30e6f3f4af0a03fa4b706120d5e9b0891c344a27d64559aff5900a4a27 AS system-tools
USER root
RUN apt-get update -qq && apt-get install -y --no-install-recommends libnss3-tools=2:3.98-1ubuntu0.2
COPY --from=bun /usr/local/bin/bun /usr/local/bin/bun
RUN ln -s bun /usr/local/bin/bunx && mkdir /proof && chown pwuser:pwuser /proof
USER pwuser
WORKDIR /proof

FROM system-tools AS system-proof
COPY --chown=pwuser:pwuser . .
RUN bun install --frozen-lockfile --registry=https://registry.npmjs.org --ignore-scripts
RUN bunx turbo run build --filter=@plainworks/testkit --filter=@plainworks/http --filter=@plainworks/connect --filter=@plainworks/channel --output-logs=errors-only
ENTRYPOINT ["bun", "internal/integration/src/system/proof.ts"]
