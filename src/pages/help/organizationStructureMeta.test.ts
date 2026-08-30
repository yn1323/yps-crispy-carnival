import { describe, expect, it } from "vitest";
import { ORGANIZATION_STRUCTURE_HELP } from "@/src/components/features/HelpCenter/organizationStructureHelp";
import { buildHelpOrganizationStructurePageHead } from "./organizationStructureMeta";

describe("buildHelpOrganizationStructurePageHead", () => {
  it("ページ固有の説明をdescription・OG・Twitterへ設定する", () => {
    const { meta } = buildHelpOrganizationStructurePageHead();

    expect(meta).toEqual(
      expect.arrayContaining([
        { name: "description", content: ORGANIZATION_STRUCTURE_HELP.metaDescription },
        { property: "og:description", content: ORGANIZATION_STRUCTURE_HELP.metaDescription },
        { name: "twitter:description", content: ORGANIZATION_STRUCTURE_HELP.metaDescription },
      ]),
    );
  });
});
