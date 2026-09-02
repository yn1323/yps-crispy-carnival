import { describe, expect, it } from "vitest";
import { NOTIFICATION_BASICS_HELP } from "@/src/components/features/HelpCenter/notificationBasicsHelp";
import { buildHelpNotificationBasicsPageHead } from "./notificationBasicsMeta";

describe("buildHelpNotificationBasicsPageHead", () => {
  it("ページ固有の説明をdescription・OG・Twitterへ設定する", () => {
    const { meta } = buildHelpNotificationBasicsPageHead();

    expect(meta).toEqual(
      expect.arrayContaining([
        { name: "description", content: NOTIFICATION_BASICS_HELP.metaDescription },
        { property: "og:description", content: NOTIFICATION_BASICS_HELP.metaDescription },
        { name: "twitter:description", content: NOTIFICATION_BASICS_HELP.metaDescription },
      ]),
    );
  });
});
