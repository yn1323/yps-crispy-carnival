import { convexTest } from "convex-test";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { api, internal } from "../_generated/api";
import type { Id } from "../_generated/dataModel";
import { resetResendEmailQueueForTest } from "../_lib/resend";
import { MANAGER_SUBJECT, SCENARIO_NOW, type ScenarioTest, seedStaff } from "../_test/scenarioBuilders";
import { createScenario } from "../_test/scenarioFixtures";
import { getTestOrganizationId, seedCanonicalStaffLineRecipient, seedManagerShop } from "../_test/seed";
import { modules, schema } from "../_test/setup.test-helper";
import { NOTIFICATION_OUTBOX_ENQUEUE_DELAY_MS } from "../constants";

const RAW_WEBHOOK_SECRET = "test-resend-webhook-secret";
const WEBHOOK_SECRET = `whsec_${bytesToBase64(new TextEncoder().encode(RAW_WEBHOOK_SECRET))}`;

describe("スタッフ通知履歴シナリオ", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(SCENARIO_NOW);
    vi.stubEnv("DEBUG_NOTIFY_FAIL", "");
    vi.stubEnv("NOTIFICATION_DELIVERY_MODE", "");
    vi.stubEnv("RESEND_API_KEY", "resend-token");
    vi.stubEnv("RESEND_WEBHOOK_SECRET", WEBHOOK_SECRET);
    resetResendEmailQueueForTest();
  });

  afterEach(() => {
    resetResendEmailQueueForTest();
    vi.useRealTimers();
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  it("メール送信受付からResend配信完了までをスタッフ履歴へ反映する", async () => {
    const fetchMock = vi.fn<typeof globalThis.fetch>(
      async () => new Response(JSON.stringify({ id: "email_history_delivered" }), { status: 200 }),
    );
    vi.stubGlobal("fetch", fetchMock);
    const t = convexTest(schema, modules);
    const ids = await t.run(async (ctx) => {
      const { shopId } = await seedManagerShop(ctx, {
        subject: MANAGER_SUBJECT,
        email: "history-manager@example.com",
        shopName: "通知履歴店舗",
      });
      const staffId = await seedStaff(ctx, {
        shopId,
        name: "履歴確認スタッフ",
        email: "history-staff@example.com",
      });
      return { shopId, staffId };
    });

    const enqueueResult = await t.mutation(internal.notificationOutbox.mutations.enqueue, {
      channel: "email",
      shopId: ids.shopId,
      staffId: ids.staffId,
      history: {
        notificationKind: "test.history",
        displayTitle: "シフト募集のお知らせ",
      },
      dedupeKey: "email:test:history-delivered",
      payload: {
        kind: "email",
        from: "シフトリ <noreply@example.com>",
        to: "history-staff@example.com",
        subject: "シフト募集のお知らせ",
        html: "<p>本文は履歴へ保存しない</p>",
        context: "test.notificationHistory",
      },
    });
    expect(enqueueResult).not.toBeNull();

    await vi.advanceTimersByTimeAsync(NOTIFICATION_OUTBOX_ENQUEUE_DELAY_MS);
    await t.action(internal.notificationOutbox.actions.processPending, {});

    const sentPage = await listHistory(t, ids);
    expect(sentPage.page).toEqual([
      {
        _id: expect.any(String),
        requestedAt: SCENARIO_NOW,
        sentAt: SCENARIO_NOW + NOTIFICATION_OUTBOX_ENQUEUE_DELAY_MS,
        channel: "email",
        displayTitle: "シフト募集のお知らせ",
        displayStatus: "sent",
      },
    ]);

    const outboxId = enqueueResult?.outboxId;
    if (!outboxId) throw new Error("notification outbox was not created");
    const deliveredAt = Date.now() + 1_000;
    const rawBody = JSON.stringify({
      type: "email.delivered",
      created_at: new Date(deliveredAt).toISOString(),
      data: {
        created_at: new Date(Date.now()).toISOString(),
        email_id: "email_history_delivered",
        from: "noreply@example.com",
        to: ["history-staff@example.com"],
        subject: "保存しない件名",
        tags: { shiftori_outbox_id: outboxId },
      },
    });
    const response = await t.fetch("/resend/webhook", {
      method: "POST",
      body: rawBody,
      headers: await signedHeaders("svix_history_delivered", rawBody),
    });
    expect(response.status).toBe(200);

    const deliveredPage = await listHistory(t, ids);
    expect(deliveredPage.page).toHaveLength(1);
    expect(deliveredPage.page[0]).toMatchObject({
      channel: "email",
      displayTitle: "シフト募集のお知らせ",
      displayStatus: "delivered",
    });
  });

  it("LINE quota fallbackはLINE失敗とメール送信を別の履歴として残す", async () => {
    const fetchMock = vi.fn<typeof globalThis.fetch>(
      async () => new Response(JSON.stringify({ id: "email_history_fallback" }), { status: 200 }),
    );
    vi.stubGlobal("fetch", fetchMock);
    const t = convexTest(schema, modules);
    const ids = await t.run(async (ctx) => {
      const { shopId } = await seedManagerShop(ctx, {
        subject: MANAGER_SUBJECT,
        email: "fallback-manager@example.com",
        shopName: "Fallback履歴店舗",
      });
      const staffId = await seedStaff(ctx, {
        shopId,
        name: "Fallbackスタッフ",
        email: "fallback-staff@example.com",
      });
      const lineRecipient = await seedCanonicalStaffLineRecipient(ctx, {
        staffId,
        lineUserId: "U_history_fallback",
      });
      await ctx.db.insert("lineQuotaStatus", {
        checkedAt: Date.now(),
        totalQuota: 200,
        consumed: 200,
        remaining: 0,
        status: "exceeded",
        plan: "communication",
      });
      return { shopId, staffId, lineRecipient };
    });

    await t.mutation(internal.notificationOutbox.mutations.enqueue, {
      channel: "line",
      shopId: ids.shopId,
      staffId: ids.staffId,
      history: {
        notificationKind: "test.lineFallback",
        displayTitle: "シフト提出のお願い",
      },
      organizationPersonLineLinkId: ids.lineRecipient.organizationPersonLineLinkId,
      organizationPersonLineGenerationAtEnqueue: ids.lineRecipient.generation,
      dedupeKey: "line:test:history-fallback",
      payload: {
        kind: "line",
        toUserId: "U_history_fallback",
        text: "LINE通知本文",
        fallbackEmail: {
          dedupeKey: "email:test:history-fallback",
          history: {
            notificationKind: "test.lineFallback",
            displayTitle: "シフト提出のお願い（メール）",
          },
          payload: {
            kind: "email",
            from: "シフトリ <noreply@example.com>",
            to: "fallback-staff@example.com",
            subject: "シフト提出のお願い（メール）",
            html: "<p>Fallback本文</p>",
            context: "test.lineFallback",
          },
        },
      },
    });

    await vi.advanceTimersByTimeAsync(NOTIFICATION_OUTBOX_ENQUEUE_DELAY_MS);
    await t.action(internal.notificationOutbox.actions.processPending, {});

    const fallbackQueued = await listHistory(t, ids);
    expect(projectHistory(fallbackQueued.page)).toEqual([
      { channel: "email", displayStatus: "queued", displayTitle: "シフト提出のお願い（メール）" },
      { channel: "line", displayStatus: "failed", displayTitle: "シフト提出のお願い" },
    ]);

    await vi.advanceTimersByTimeAsync(NOTIFICATION_OUTBOX_ENQUEUE_DELAY_MS);
    await t.action(internal.notificationOutbox.actions.processPending, {});

    const fallbackSent = await listHistory(t, ids);
    expect(projectHistory(fallbackSent.page)).toEqual([
      { channel: "email", displayStatus: "sent", displayTitle: "シフト提出のお願い（メール）" },
      { channel: "line", displayStatus: "failed", displayTitle: "シフト提出のお願い" },
    ]);
  });

  it("スタッフ削除は100件を超える履歴をscheduled batchで削除し、再実行しても再出現させない", async () => {
    const t = convexTest(schema, modules);
    const scenario = createScenario(t);
    const asManager = scenario.manager(MANAGER_SUBJECT);
    const ids = await t.run(async (ctx) => {
      const { organizationId, shopId } = await seedManagerShop(ctx, {
        subject: MANAGER_SUBJECT,
        email: "cleanup-manager@example.com",
        shopName: "履歴削除店舗",
      });
      const staffId = await seedStaff(ctx, {
        shopId,
        name: "履歴削除スタッフ",
        email: "cleanup-staff@example.com",
      });
      for (let index = 0; index < 101; index += 1) {
        const outboxId = await ctx.db.insert("notificationOutbox", {
          channel: "email",
          status: "sent",
          dedupeKey: `email:test:history-cleanup:${index}`,
          organizationId,
          shopId,
          staffId,
          purpose: "business",
          notificationContext: "test.historyCleanup",
          deliverySuppressed: false,
          payload: {
            kind: "email",
            from: "シフトリ <noreply@example.com>",
            to: "cleanup-staff@example.com",
            subject: `通知${index}`,
            html: "<p>本文</p>",
            context: "test.historyCleanup",
          },
          attemptCount: 1,
          nextRunAt: SCENARIO_NOW,
          sentAt: SCENARIO_NOW,
          createdAt: SCENARIO_NOW + index,
          updatedAt: SCENARIO_NOW + index,
        });
        await ctx.db.insert("notificationHistory", {
          outboxId,
          shopId,
          staffId,
          channel: "email",
          notificationKind: "test.historyCleanup",
          displayTitle: `通知${index}`,
          sendStatus: "sent",
          deliveryStatus: "unknown",
          requestedAt: SCENARIO_NOW + index,
          sentAt: SCENARIO_NOW + index,
          updatedAt: SCENARIO_NOW + index,
        });
      }
      return { shopId, staffId };
    });

    await asManager.removePersonFromShop(ids.staffId);
    const hiddenPage = await listHistory(t, ids);
    expect(hiddenPage.page).toEqual([]);

    await t.finishAllScheduledFunctions(vi.runAllTimers);
    await expect(t.run(async (ctx) => ctx.db.query("notificationHistory").collect())).resolves.toEqual([]);

    await t.mutation(internal.notificationOutbox.mutations.deleteStaffNotificationHistoryBatch, ids);
    await expect(t.run(async (ctx) => ctx.db.query("notificationHistory").collect())).resolves.toEqual([]);
  });
});

async function listHistory(t: ScenarioTest, ids: { shopId: Id<"shops">; staffId: Id<"staffs"> }) {
  return await t
    .withIdentity({ subject: MANAGER_SUBJECT })
    .query(api.notificationOutbox.queries.listStaffNotificationHistory, {
      expectedOrganizationId: await getTestOrganizationId(t, ids.shopId),
      shopId: ids.shopId,
      staffId: ids.staffId,
      paginationOpts: { numItems: 20, cursor: null },
    });
}

function projectHistory(page: Array<{ channel: "email" | "line"; displayStatus: string; displayTitle: string }>) {
  return page
    .map(({ channel, displayStatus, displayTitle }) => ({ channel, displayStatus, displayTitle }))
    .sort((a, b) => a.channel.localeCompare(b.channel));
}

async function signedHeaders(id: string, rawBody: string) {
  const timestamp = String(Math.floor(Date.now() / 1_000));
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(RAW_WEBHOOK_SECRET),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signature = new Uint8Array(
    await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(`${id}.${timestamp}.${rawBody}`)),
  );
  return {
    "content-type": "application/json; charset=utf-8",
    "svix-id": id,
    "svix-timestamp": timestamp,
    "svix-signature": `v1,${bytesToBase64(signature)}`,
  };
}

function bytesToBase64(bytes: Uint8Array) {
  let binary = "";
  for (let index = 0; index < bytes.length; index += 1) binary += String.fromCharCode(bytes[index]);
  return btoa(binary);
}
