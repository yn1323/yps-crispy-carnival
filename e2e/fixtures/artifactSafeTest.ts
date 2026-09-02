import { test as base, expect } from "@playwright/test";
import { sanitizeE2EArtifactErrors } from "../helpers/diagnostics";

type E2EArtifactSafeFixtures = {
  e2eArtifactPrivacy: undefined;
};

/** test/hook終了時とfixture teardown時に、直列化済みのtop-level errorをredactする。 */
export const artifactSafeTest = base.extend<E2EArtifactSafeFixtures>({
  e2eArtifactPrivacy: [
    // biome-ignore lint/correctness/noEmptyPattern: Playwright requires fixture destructuring even when unused.
    async ({}, use, testInfo) => {
      try {
        await use(undefined);
      } finally {
        sanitizeE2EArtifactErrors(testInfo.errors);
      }
    },
    { auto: true },
  ],
});

// Playwrightの内部artifact fixtureがteardownへ入る前に、test bodyとhookのerrorを消毒する。
// biome-ignore lint/correctness/noEmptyPattern: Playwright requires hook fixture destructuring even when unused.
artifactSafeTest.afterEach(({}, testInfo) => {
  sanitizeE2EArtifactErrors(testInfo.errors);
});

export { expect };
