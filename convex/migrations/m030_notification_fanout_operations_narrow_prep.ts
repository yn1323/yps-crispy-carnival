import { migrations } from "./index";

/** 7月30日の再送Widen前に作成されたfanout operationへ、従来挙動のdiscriminatorを補完する。 */
export const migration = migrations.define({
  table: "notificationFanoutOperations",
  migrateOne: async (_ctx, operation) => {
    if (operation.supersedesActiveOperations !== undefined) return;
    return { supersedesActiveOperations: true };
  },
});
