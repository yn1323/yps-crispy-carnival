import type { Reporter, TestCase, TestError, TestResult, TestStep, WorkerInfo } from "@playwright/test/reporter";
import { sanitizeDiagnosticMessage, sanitizeE2EArtifactErrors } from "../helpers/diagnostics";

function sanitizeStep(step: TestStep) {
  Reflect.set(step, "title", sanitizeDiagnosticMessage(step.title));
  if (step.error) sanitizeE2EArtifactErrors([step.error]);
}

/** 標準reporterより先にstep titleとerrorをredactし、公開reportへ機密値を渡さない。 */
export default class E2EPrivacyReporter implements Reporter {
  onError(error: TestError, _workerInfo?: WorkerInfo) {
    sanitizeE2EArtifactErrors([error]);
  }

  onStepBegin(_test: TestCase, _result: TestResult, step: TestStep) {
    sanitizeStep(step);
  }

  onStepEnd(_test: TestCase, _result: TestResult, step: TestStep) {
    sanitizeStep(step);
  }

  onTestEnd(_test: TestCase, result: TestResult) {
    sanitizeE2EArtifactErrors(result.errors);
  }

  printsToStdio() {
    return false;
  }
}
