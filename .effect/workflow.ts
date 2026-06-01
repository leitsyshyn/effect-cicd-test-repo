export default {
  workflowId: "workflow:ci",
  name: "CI Pipeline",
  metadata: { owner: "test" },
  units: [
    {
      unitId: "unit:check",
      name: "Type Check & Test",
      command: {
        _tag: "ContainerCommand",
        image: "oven/bun:1",
        command: ["bun", "run", "test"],
        env: { CI: "true" },
      },
    },
    {
      unitId: "unit:build",
      name: "Build",
      command: {
        _tag: "ContainerCommand",
        image: "oven/bun:1",
        command: ["bun", "run", "build"],
        env: { CI: "true" },
      },
      dependsOn: ["unit:check"],
    },
  ],
}
