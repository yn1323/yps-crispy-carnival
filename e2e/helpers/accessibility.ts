import AxeBuilder from "@axe-core/playwright";
import { expect, type Page, type TestInfo } from "@playwright/test";

type AccessibilityOptions = {
  knownRuleGaps?: Record<string, { reason: string; targets: string[] }>;
};

export async function expectNoA11yViolations(
  page: Page,
  testInfo: TestInfo,
  { knownRuleGaps = {} }: AccessibilityOptions = {},
) {
  const results = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"]).analyze();
  const matchedKnownTargets = new Map<string, string[]>();
  const unexpectedViolations = [];

  for (const violation of results.violations) {
    const knownTargets = knownRuleGaps[violation.id]?.targets ?? [];
    const unexpectedNodes = [];

    for (const node of violation.nodes) {
      const actualTarget = node.target.join(" ");
      const knownTarget = await findMatchingKnownTarget(page, actualTarget, knownTargets);
      if (knownTarget) {
        const matchedTargets = matchedKnownTargets.get(violation.id) ?? [];
        matchedTargets.push(knownTarget);
        matchedKnownTargets.set(violation.id, matchedTargets);
      } else {
        unexpectedNodes.push(node);
      }
    }

    if (unexpectedNodes.length > 0) {
      unexpectedViolations.push({ ...violation, nodes: unexpectedNodes });
    }
  }

  await testInfo.attach("axe-results", {
    body: JSON.stringify({ knownRuleGaps, results }, null, 2),
    contentType: "application/json",
  });

  for (const [ruleId, gap] of Object.entries(knownRuleGaps)) {
    const actualTargets = (matchedKnownTargets.get(ruleId) ?? []).sort();
    expect(actualTargets, `既知課題のnodeが変化しています: ${ruleId} (${gap.reason})`).toEqual([...gap.targets].sort());
  }

  expect(
    unexpectedViolations,
    unexpectedViolations
      .map(
        (violation) =>
          `${violation.id}: ${violation.help}\n${violation.nodes.map((node) => `  ${node.target.join(" ")}`).join("\n")}`,
      )
      .join("\n"),
  ).toEqual([]);
}

async function findMatchingKnownTarget(page: Page, actualTarget: string, knownTargets: string[]) {
  const exactTarget = knownTargets.find((knownTarget) => knownTarget === actualTarget);
  if (exactTarget) return exactTarget;

  for (const knownTarget of knownTargets) {
    const pointsToSameElement = await page.evaluate(
      ({ actualTarget, knownTarget }) => {
        try {
          const actualElements = document.querySelectorAll(actualTarget);
          const knownElements = document.querySelectorAll(knownTarget);
          return actualElements.length === 1 && knownElements.length === 1 && actualElements[0] === knownElements[0];
        } catch {
          return false;
        }
      },
      { actualTarget, knownTarget },
    );
    if (pointsToSameElement) return knownTarget;
  }

  return undefined;
}
