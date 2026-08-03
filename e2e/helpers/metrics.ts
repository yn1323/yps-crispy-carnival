export type E2EMetrics = {
  cliCalls: number;
  occRetries: number;
  pollAttempts: number;
};

let currentMetrics: E2EMetrics = createEmptyMetrics();

function createEmptyMetrics(): E2EMetrics {
  return { cliCalls: 0, occRetries: 0, pollAttempts: 0 };
}

export function resetE2EMetrics() {
  currentMetrics = createEmptyMetrics();
}

export function recordE2EMetric(metric: keyof E2EMetrics) {
  currentMetrics[metric] += 1;
}

export function getE2EMetrics(): E2EMetrics {
  return { ...currentMetrics };
}
