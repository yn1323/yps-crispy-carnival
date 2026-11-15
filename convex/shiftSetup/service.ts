import type { Doc, Id } from "../_generated/dataModel";
import type { MutationCtx, QueryCtx } from "../_generated/server";
import { POSITION_ACTIVE_LIMIT, SHIFT_DAY_TEMPLATE_LIMIT } from "../constants";

type DbCtx = Pick<QueryCtx | MutationCtx, "db">;

/** 店舗の有効なポジションを、設定した並び順で返す。 */
export async function listActivePositions(ctx: DbCtx, shopId: Id<"shops">): Promise<Doc<"positions">[]> {
  // 既存データの読み取り窓（50件）に合わせて読み、並び順はsortOrderと作成順で安定させる。
  const positions = await ctx.db
    .query("positions")
    .withIndex("by_shopId_isDeleted", (q) => q.eq("shopId", shopId).eq("isDeleted", false))
    .take(50);
  return positions.sort((left, right) => left.sortOrder - right.sortOrder || left._creationTime - right._creationTime);
}

export async function listDayTemplates(ctx: DbCtx, shopId: Id<"shops">): Promise<Doc<"shiftDayTemplates">[]> {
  const templates = await ctx.db
    .query("shiftDayTemplates")
    .withIndex("by_shopId", (q) => q.eq("shopId", shopId))
    .take(SHIFT_DAY_TEMPLATE_LIMIT + 1);
  return templates
    .slice(0, SHIFT_DAY_TEMPLATE_LIMIT)
    .sort((left, right) => left.sortOrder - right.sortOrder || left._creationTime - right._creationTime);
}

/** 削除済みのポジションを指す必要人数を除いた、返却用の区切りを作る。 */
export function toDayTemplateSlotsDto(
  template: Doc<"shiftDayTemplates">,
  activePositionIds: ReadonlySet<Id<"positions">>,
) {
  return template.slots.map((slot) => ({
    key: slot.key,
    requirements: slot.requirements
      .filter((requirement) => activePositionIds.has(requirement.positionId) && requirement.count > 0)
      .map((requirement) => ({ positionId: requirement.positionId, count: requirement.count })),
  }));
}

/**
 * スタッフが入れないポジションのうち、いまも有効なものだけを返す。
 * ポジションの削除で、残ったポジションのすべてが「入れない」になったスタッフは、制限なしとして返す。
 * どこにも入れないスタッフを作らないためである。
 */
export function toUnavailablePositionIdsDto(staff: Doc<"staffs">, activePositionIds: ReadonlySet<Id<"positions">>) {
  const unavailable = (staff.unavailablePositionIds ?? []).filter((positionId) => activePositionIds.has(positionId));
  return unavailable.length >= activePositionIds.size ? [] : unavailable;
}

export const ACTIVE_POSITION_LIMIT_MESSAGE = `ポジションは${POSITION_ACTIVE_LIMIT}件まで登録できます`;
