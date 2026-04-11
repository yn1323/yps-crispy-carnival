import { defineConfig } from "@yn1323/cognac";

export default defineConfig({
  port: 4100,
  git: {
    defaultBranch: "develop",
  },
  ci: {
    maxRetries: 5,
  },
  discussion: {
    maxRounds: 3,
    minPersonas: 2,
    maxPersonas: 4,
  },
  claude: {
    maxTurnsExecution: 30,
    maxTurnsDiscussion: 1,
    stdoutTimeoutMs: 600000,
    processMaxRetries: 2,
  },
});
