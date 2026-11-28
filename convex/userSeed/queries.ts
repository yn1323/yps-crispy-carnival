import { v } from "convex/values";
import { observedInternalQuery as internalQuery } from "../_lib/errorObservability";
import { assertUserSeedEnabled } from "./guard";
import { listSeedableUsers, listUserSeedOrganizations } from "./service";

/**
 * 確認用データを入れられる管理者ユーザーと、そのユーザーの組織を返す。
 * CLIを実行した開発者が、入れる先のユーザーを選ぶために使う。
 */
export const listUsers = internalQuery({
  args: {},
  returns: v.array(
    v.object({
      userId: v.id("users"),
      name: v.string(),
      email: v.string(),
      organizations: v.array(
        v.object({
          organizationId: v.id("organizations"),
          name: v.string(),
          canDelete: v.boolean(),
          reason: v.union(v.string(), v.null()),
        }),
      ),
    }),
  ),
  handler: async (ctx) => {
    assertUserSeedEnabled();
    const users = await listSeedableUsers(ctx);
    return await Promise.all(
      users.map(async (user) => ({
        userId: user._id,
        name: user.name,
        email: user.email,
        organizations: (await listUserSeedOrganizations(ctx, user._id)).map((entry) => ({
          organizationId: entry.organization._id,
          name: entry.organization.name,
          canDelete: entry.canDelete,
          reason: entry.reason,
        })),
      })),
    );
  },
});
