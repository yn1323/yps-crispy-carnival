import { v } from "convex/values";
import { observedInternalMutation as internalMutation } from "../_lib/errorObservability";
import { legacyAnalyticsStepArgs } from "./nightly";

// 予約済みresetの残りを吸収する。初期化やデータ削除は実行しない。
export const processPage = internalMutation({
  args: legacyAnalyticsStepArgs,
  returns: v.null(),
  handler: async () => null,
});
