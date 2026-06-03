import {
  Artifact,
  Command,
  Job,
  Policy,
  Report,
  Trigger,
  Workflow,
} from "@effect-cicd/dsl";

export default Workflow.make("workflow:ci").pipe(
  Workflow.named("Demo CI Pipeline"),
  Workflow.metadata({ owner: "test", scenario: "fan-out-fan-in-demo" }),
  Workflow.on(Trigger.githubPush({ branches: ["main"] })),
  Workflow.job(
    Job.make("unit:bootstrap").pipe(
      Job.named("Bootstrap Workspace"),
      Job.image("oven/bun:1"),
      Job.secret("RELEASE_BOT_TOKEN"),
      Job.exec(
        Command.shell(`
          set -eu
          mkdir -p artifacts reports .effect-demo
          echo "Bootstrap token=$RELEASE_BOT_TOKEN"
          echo '{"repo":"effect-cicd-test-repo","pipeline":"demo"}' > artifacts/bootstrap.json
          echo 'Preparing workspace for parallel stages'
          sleep 2
        `),
      ),
      Job.env({ CI: "true" }),
      Job.artifact(
        Artifact.file("bootstrap-context", "artifacts/bootstrap.json", {
          contentType: "application/json",
        }),
      ),
    ),
    Job.make("unit:lint").pipe(
      Job.named("Lint & Static Analysis"),
      Job.image("oven/bun:1"),
      Job.exec(
        Command.shell(`
          set -eu
          echo 'Running lint pass'
          sleep 2
          printf 'lint: ok\nformat: ok\nimports: ok\n' > reports/lint.txt
        `),
      ),
      Job.env({ CI: "true" }),
      Job.dependsOn("unit:bootstrap"),
      Job.report(
        Report.file("lint-report", "reports/lint.txt", {
          contentType: "text/plain",
        }),
      ),
    ),
    Job.make("unit:test").pipe(
      Job.named("Unit Tests"),
      Job.image("oven/bun:1"),
      Job.exec(
        Command.shell(`
          set -eu
          echo 'Executing unit tests'
          sleep 3
          bun run test
          printf '{"suite":"unit","status":"passed"}\n' > reports/unit-tests.json
        `),
      ),
      Job.env({ CI: "true" }),
      Job.dependsOn("unit:bootstrap"),
      Job.report(
        Report.file("unit-tests", "reports/unit-tests.json", {
          format: "json",
          contentType: "application/json",
        }),
      ),
    ),
    Job.make("unit:integration").pipe(
      Job.named("Integration Tests With Retry"),
      Job.image("oven/bun:1"),
      Job.exec(
        Command.shell(`
          set -eu
          mkdir -p .effect-demo reports
          if [ ! -f .effect-demo/integration-retry-marker ]; then
            echo 'First integration attempt fails on purpose to demonstrate retry'
            touch .effect-demo/integration-retry-marker
            sleep 2
            exit 1
          fi
          rm -f .effect-demo/integration-retry-marker
          echo 'Retry attempt succeeded'
          sleep 2
          printf '{"suite":"integration","attempt":"retry","status":"passed"}\n' > reports/integration-tests.json
        `),
      ),
      Job.env({ CI: "true" }),
      Job.dependsOn("unit:bootstrap"),
      Job.retry(
        Policy.retry({ maxAttempts: 2, baseDelayMillis: 1000, jitter: "none" }),
      ),
      Job.report(
        Report.file("integration-tests", "reports/integration-tests.json", {
          format: "json",
          contentType: "application/json",
        }),
      ),
    ),
    Job.make("unit:build-web").pipe(
      Job.named("Build Web Bundle"),
      Job.image("oven/bun:1"),
      Job.exec(
        Command.shell(`
          set -eu
          mkdir -p artifacts
          echo 'Building web bundle'
          sleep 2
          printf '{"target":"web","status":"built"}\n' > artifacts/web-bundle.json
        `),
      ),
      Job.env({ CI: "true" }),
      Job.dependsOn("unit:lint", "unit:test"),
      Job.artifact(
        Artifact.file("web-bundle", "artifacts/web-bundle.json", {
          contentType: "application/json",
        }),
      ),
    ),
    Job.make("unit:build-api").pipe(
      Job.named("Build API Bundle"),
      Job.image("oven/bun:1"),
      Job.exec(
        Command.shell(`
          set -eu
          mkdir -p artifacts
          echo 'Building api bundle'
          sleep 2
          printf '{"target":"api","status":"built"}\n' > artifacts/api-bundle.json
        `),
      ),
      Job.env({ CI: "true" }),
      Job.dependsOn("unit:lint", "unit:integration"),
      Job.artifact(
        Artifact.file("api-bundle", "artifacts/api-bundle.json", {
          contentType: "application/json",
        }),
      ),
    ),
    Job.make("unit:package").pipe(
      Job.named("Assemble Release Manifest"),
      Job.image("oven/bun:1"),
      Job.exec(
        Command.shell(`
          set -eu
          mkdir -p artifacts reports
          echo 'Packaging release artifacts'
          sleep 2
          printf '{"version":"demo-main","includes":["web","api"],"checks":["lint","unit","integration"]}\n' > artifacts/release-manifest.json
          printf 'release package assembled\n' > reports/package-summary.txt
        `),
      ),
      Job.env({ CI: "true" }),
      Job.dependsOn("unit:build-web", "unit:build-api"),
      Job.artifact(
        Artifact.file("release-manifest", "artifacts/release-manifest.json", {
          contentType: "application/json",
        }),
      ),
      Job.report(
        Report.file("package-summary", "reports/package-summary.txt", {
          contentType: "text/plain",
        }),
      ),
    ),
    Job.make("unit:smoke").pipe(
      Job.named("Smoke Test Release"),
      Job.image("oven/bun:1"),
      Job.exec(
        Command.shell(`
          set -eu
          mkdir -p reports
          echo 'Running smoke tests against assembled package'
          sleep 2
          printf '{"smoke":"passed"}\n' > reports/smoke.json
        `),
      ),
      Job.env({ CI: "true" }),
      Job.dependsOn("unit:package"),
      Job.report(
        Report.file("smoke-report", "reports/smoke.json", {
          format: "json",
          contentType: "application/json",
        }),
      ),
    ),
    Job.make("unit:announce").pipe(
      Job.named("Pipeline Summary"),
      Job.image("oven/bun:1"),
      Job.exec(
        Command.shell(`
          set -eu
          mkdir -p reports
          echo 'Demo pipeline completed after fan-out, retry, and fan-in stages'
          sleep 1
          printf 'ready for dashboard demo\n' > reports/summary.txt
        `),
      ),
      Job.env({ CI: "true" }),
      Job.dependsOn("unit:package", "unit:smoke", "unit:integration"),
      Job.report(
        Report.file("pipeline-summary", "reports/summary.txt", {
          contentType: "text/plain",
        }),
      ),
    ),
  ),
);
