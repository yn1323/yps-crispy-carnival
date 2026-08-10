import type { Reporter, TestCase, TestError, TestResult, TestStep, WorkerInfo } from "@playwright/test/reporter";
import { sanitizeE2EArtifactErrors } from "../helpers/diagnostics";

/** 標準reporterより先に同じerror objectをredactし、公開reportへ機密値を渡さない。 */
export default class E2EPrivacyReporter implements Reporter {
  onError(error: TestError, _workerInfo?: WorkerInfo) {
    sanitizeE2EArtifactErrors([error]);
  }

  onStepEnd(_test: TestCase, _result: TestResult, step: TestStep) {
    if (step.error) sanitizeE2EArtifactErrors([step.error]);
  }

  onTestEnd(_test: TestCase, result: TestResult) {
    sanitizeE2EArtifactErrors(result.errors);
  }

  printsToStdio() {
    return false;
  }
}
