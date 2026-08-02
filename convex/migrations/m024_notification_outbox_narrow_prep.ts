import {
  notificationContextForPayload,
  notificationDeliverySuppressedForPayload,
} from "../notificationOutbox/redaction";
import type { NotificationPurpose } from "../notificationOutbox/types";
import { migrations } from "./index";

type NotificationOutboxNarrowPrepPatch = {
  notificationContext?: string;
  deliverySuppressed?: boolean;
  purpose?: NotificationPurpose;
};

/** notificationOutboxの現行writerが必ず保存する3 fieldを、旧rowへ同じ規則で補完する。 */
export const migration = migrations.define({
  table: "notificationOutbox",
  migrateOne: async (ctx, job) => {
    const patch: NotificationOutboxNarrowPrepPatch = {};
    let changed = false;

    if (job.notificationContext === undefined) {
      patch.notificationContext = notificationContextForPayload(job.payload, job.dedupeKey);
      changed = true;
    }
    if (job.deliverySuppressed === undefined) {
      patch.deliverySuppressed = notificationDeliverySuppressedForPayload(job.payload);
      changed = true;
    }
    if (job.purpose === undefined) {
      // enqueue/getNotificationEligibilityが旧rowへ適用している既定値と揃える。
      patch.purpose = "business";
      changed = true;
    }

    if (changed) await ctx.db.patch(job._id, patch);
  },
});
