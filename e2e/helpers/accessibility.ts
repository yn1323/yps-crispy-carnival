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
  const unexpectedViolations = results.violations
    .map((violation) => {
      const knownTargets = new Set(knownRuleGaps[violation.id]?.targets ?? []);
      return {
        ...violation,
        nodes: violation.nodes.filter((node) => !knownTargets.has(node.target.join(" "))),
      };
    })
    .filter((violation) => violation.nodes.length > 0);

  await testInfo.attach("axe-results", {
    body: JSON.stringify({ knownRuleGaps, results }, null, 2),
    contentType: "application/json",
  });

  for (const [ruleId, gap] of Object.entries(knownRuleGaps)) {
    const actualTargets =
      results.violations
        .find((violation) => violation.id === ruleId)
        ?.nodes.map((node) => node.target.join(" "))
        .sort() ?? [];
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
