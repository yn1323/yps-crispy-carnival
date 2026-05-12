import { describe, expect, it } from "vitest";
import { collectTargetPreviewMatches, getDeploymentIdentifiers, getTargetNames } from "./deleteConvexPreviews";

describe("deleteConvexPreviews", () => {
  it("matches preview deployments by previewIdentifier and reference", () => {
    const deployments = [
      {
        name: "amicable-ibis-71",
        reference: "preview/pr-426-deploy",
        previewIdentifier: "pr-426-deploy",
        deploymentType: "preview",
      },
      {
        name: "silent-salamander-701",
        reference: "preview/pr-426-e2e",
        previewIdentifier: "pr-426-e2e",
        deploymentType: "preview",
      },
      {
        name: "production-like-123",
        reference: "preview/pr-426-deploy",
        previewIdentifier: "pr-426-deploy",
        deploymentType: "prod",
      },
    ];

    const result = collectTargetPreviewMatches(deployments, ["pr-426-deploy", "pr-426-e2e"]);

    expect(result.missingTargetNames).toEqual([]);
    expect(result.matchesByTarget.get("pr-426-deploy")).toEqual([deployments[0]]);
    expect(result.matchesByTarget.get("pr-426-e2e")).toEqual([deployments[1]]);
  });

  it("reports missing target previews before deleting anything", () => {
    const result = collectTargetPreviewMatches(
      [
        {
          name: "amicable-ibis-71",
          reference: "preview/pr-426-deploy",
          previewIdentifier: "pr-426-deploy",
          deploymentType: "preview",
        },
      ],
      ["pr-426-deploy", "pr-426-e2e"],
    );

    expect(result.missingTargetNames).toEqual(["pr-426-e2e"]);
  });

  it("normalizes preview references to their plain identifiers", () => {
    const identifiers = getDeploymentIdentifiers({
      reference: "preview/pr-426-deploy",
    });

    expect([...identifiers]).toContain("pr-426-deploy");
  });

  it("rejects names outside the expected PR preview pattern", () => {
    expect(() => getTargetNames(["production"])).toThrow(
      "Refusing to delete unexpected Convex preview name: production",
    );
  });
});
