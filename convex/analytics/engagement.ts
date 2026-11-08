import type { MutationCtx } from "../_generated/server";
import type { AnalyticsMinStaff } from "../analyticsDashboard/dto";
import { engagedOrganizationMinStaffs, engagedShopMinStaffs, scanBudgetLow } from "../analyticsDashboard/queryHelpers";
import type { AnalyticsEngagedCounts, AnalyticsEngagement } from "./model";
import { ANALYTICS_POLICY } from "./registry";

/**
 * 作成の古い順に、前回確認した作成時刻より後の組織・店舗を数え、満たす人数の区分ごとに加算する。
 * 同じ作成時刻の対象は次のpageで読めないため、境界の時刻では止めない。
 */
async function countPage<D extends { _creationTime: number }>(
  ctx: MutationCtx,
  source: AsyncIterable<D>,
  minStaffsOf: (doc: D) => Promise<AnalyticsMinStaff[]>,
  addMatch: (minStaff: AnalyticsMinStaff) => void,
): Promise<number | null> {
  let checked = 0;
  let last: number | null = null;
  for await (const doc of source) {
    if (
      last !== null &&
      doc._creationTime !== last &&
      (checked >= ANALYTICS_POLICY.engagementTargetsPerPage || (await scanBudgetLow(ctx)))
    )
      return last;
    last = doc._creationTime;
    checked += 1;
    for (const minStaff of await minStaffsOf(doc)) addMatch(minStaff);
  }
  return null;
}

/**
 * 日の終わり（asOf）時点で、直近14日に通知を受け付けた2名以上・6名以上の組織・店舗を1page分数える。
 * 組織を読み終えたら店舗へ進み、店舗を読み終えたらcompleteにする。
 */
export async function countEngagedPage(
  ctx: MutationCtx,
  engagement: AnalyticsEngagement,
  asOf: number,
): Promise<AnalyticsEngagement> {
  const { stage, cursorCreationTime } = engagement;
  if (stage === "complete") return engagement;
  const counts: AnalyticsEngagedCounts = {
    min2: { ...engagement.counts.min2 },
    min6: { ...engagement.counts.min6 },
  };
  const addMatch = (minStaff: AnalyticsMinStaff) => {
    counts[`min${minStaff}`][stage] += 1;
  };
  const nextCursor =
    stage === "organizations"
      ? await countPage(
          ctx,
          ctx.db
            .query("organizations")
            .withIndex("by_creation_time", (q) =>
              cursorCreationTime === undefined ? q : q.gt("_creationTime", cursorCreationTime),
            ),
          (organization) => engagedOrganizationMinStaffs(ctx, organization, asOf),
          addMatch,
        )
      : await countPage(
          ctx,
          ctx.db
            .query("shops")
            .withIndex("by_creation_time", (q) =>
              cursorCreationTime === undefined ? q : q.gt("_creationTime", cursorCreationTime),
            ),
          (shop) => engagedShopMinStaffs(ctx, shop, asOf),
          addMatch,
        );
  if (nextCursor !== null) return { stage, counts, cursorCreationTime: nextCursor };
  return stage === "organizations" ? { stage: "shops", counts } : { stage: "complete", counts };
}
