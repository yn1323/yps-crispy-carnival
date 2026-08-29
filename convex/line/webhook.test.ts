import type { TestConvex } from "convex-test";
import { convexTest } from "convex-test";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { internal } from "../_generated/api";
import type { Id } from "../_generated/dataModel";
import { seedStaff } from "../_test/scenarioBuilders";
import { seedShop, seedStaffLineAccount } from "../_test/seed";
import { modules, schema } from "../_test/setup.test-helper";
import {
  LINE_WEBHOOK_BODY_MAX_BYTES,
  LINE_WEBHOOK_EVENT_MAX_COUNT,
  LINE_WEBHOOK_MESSAGE_RECEIPT_PRUNE_BATCH_SIZE,
  LINE_WEBHOOK_MESSAGE_RECEIPT_RETENTION_MS,
} from "../constants";

const CHANNEL_SECRET = "test-line-channel-secret";
const NOW = Date.parse("2026-07-21T00:00:00.000Z");
const externalFetchMock = vi.fn<typeof globalThis.fetch>();

describe("line/webhook", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(NOW);
    vi.stubEnv("LINE_MESSAGING_CHANNEL_SECRET", CHANNEL_SECRET);
    vi.stubEnv("LINE_MESSAGING_CHANNEL_ACCESS_TOKEN", "test-line-access-token");
    vi.stubGlobal("fetch", externalFetchMock);
    externalFetchMock.mockReset();
    externalFetchMock.mockResolvedValue(new Response(null, { status: 200 }));
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  it("署名済みのevents空配列をraw bodyのまま検証して受理する", async () => {
    const t = convexTest(schema, modules);
    const rawBody = '{\n  "destination": "U_destination",\n  "events": [],\n  "note": "店舗😀"\n}\n';

    const response = await t.fetch("/line/webhook", {
      method: "POST",
      body: rawBody,
      headers: await signedHeaders(rawBody),
    });

    expect(response.status).toBe(200);
    await expect(response.text()).resolves.toBe("OK");
    expect(externalFetchMock).not.toHaveBeenCalled();
  });

  it("follow eventを既存dispatchへ渡す", async () => {
    const t = convexTest(schema, modules);
    const target = await seedFollowTarget(t);
    const rawBody = lineBody([
      webhookEvent({ type: "follow", source: { userId: target.lineUserId } }, "follow-accepted", 1_000),
    ]);

    const response = await t.fetch("/line/webhook", {
      method: "POST",
      body: rawBody,
      headers: await signedHeaders(rawBody),
    });

    expect(response.status).toBe(200);
    const state = await lineState(t, target.accountId);
    expect(state.account).toMatchObject({
      following: true,
      lastWebhookEventId: "follow-accepted",
      lastWebhookEventTimestamp: 1_000,
    });
    expect(state.scheduled).toEqual([
      { name: "legal/actions:sendStaffConsentLine", args: [{ staffId: target.staffId }] },
      {
        name: "notification/actions:sendOpenRecruitmentNotificationLinesForStaff",
        args: [{ staffId: target.staffId }],
      },
    ]);
    expect(externalFetchMock).not.toHaveBeenCalled();
  });

  it("JSON以外のContent-Typeを415で拒否し副作用を起こさない", async () => {
    const t = convexTest(schema, modules);
    const target = await seedFollowTarget(t);
    const rawBody = lineBody([{ type: "follow", source: { userId: target.lineUserId } }]);
    const before = await lineState(t, target.accountId);

    const response = await t.fetch("/line/webhook", {
      method: "POST",
      body: rawBody,
      headers: { "content-type": "text/plain", "x-line-signature": await sign(rawBody) },
    });

    expect(response.status).toBe(415);
    await expectLineStateUnchanged(t, target.accountId, before);
  });

  it("Content-Lengthが上限を超えるrequestをstream読取前に413で拒否する", async () => {
    const t = convexTest(schema, modules);
    const target = await seedFollowTarget(t);
    const rawBody = lineBody([{ type: "follow", source: { userId: target.lineUserId } }]);
    const before = await lineState(t, target.accountId);

    const response = await t.fetch("/line/webhook", {
      method: "POST",
      body: rawBody,
      headers: {
        ...(await signedHeaders(rawBody)),
        "content-length": String(LINE_WEBHOOK_BODY_MAX_BYTES + 1),
      },
    });

    expect(response.status).toBe(413);
    await expectLineStateUnchanged(t, target.accountId, before);
  });

  it("Content-Lengthに依存せず実bodyのbyte超過を413で拒否する", async () => {
    const t = convexTest(schema, modules);
    const target = await seedFollowTarget(t);
    const rawBody = JSON.stringify({
      events: [{ type: "follow", source: { userId: target.lineUserId } }],
      padding: "x".repeat(LINE_WEBHOOK_BODY_MAX_BYTES),
    });
    const before = await lineState(t, target.accountId);

    const response = await t.fetch("/line/webhook", {
      method: "POST",
      body: rawBody,
      headers: { ...(await signedHeaders(rawBody)), "content-length": "invalid" },
    });

    expect(response.status).toBe(413);
    await expectLineStateUnchanged(t, target.accountId, before);
  });

  it("100 eventsを受理し101 eventsを副作用なしで413にする", async () => {
    const acceptedTest = convexTest(schema, modules);
    const acceptedBody = lineBody(
      Array.from({ length: LINE_WEBHOOK_EVENT_MAX_COUNT }, (_, index) =>
        webhookEvent({ type: `unknown_${index}` }, `unknown-${index}`, 2_000 + index),
      ),
    );
    const accepted = await acceptedTest.fetch("/line/webhook", {
      method: "POST",
      body: acceptedBody,
      headers: await signedHeaders(acceptedBody),
    });
    expect(accepted.status).toBe(200);

    const rejectedTest = convexTest(schema, modules);
    const target = await seedFollowTarget(rejectedTest);
    const rejectedBody = lineBody(
      Array.from({ length: LINE_WEBHOOK_EVENT_MAX_COUNT + 1 }, () => ({
        type: "follow",
        source: { userId: target.lineUserId },
      })),
    );
    const before = await lineState(rejectedTest, target.accountId);
    const rejected = await rejectedTest.fetch("/line/webhook", {
      method: "POST",
      body: rejectedBody,
      headers: await signedHeaders(rejectedBody),
    });

    expect(rejected.status).toBe(413);
    await expectLineStateUnchanged(rejectedTest, target.accountId, before);
  });

  it("署名不正を401で拒否し副作用を起こさない", async () => {
    const t = convexTest(schema, modules);
    const target = await seedFollowTarget(t);
    const rawBody = lineBody([{ type: "follow", source: { userId: target.lineUserId } }]);
    const before = await lineState(t, target.accountId);

    const response = await t.fetch("/line/webhook", {
      method: "POST",
      body: rawBody,
      headers: { "content-type": "application/json", "x-line-signature": "invalid" },
    });

    expect(response.status).toBe(401);
    await expectLineStateUnchanged(t, target.accountId, before);
  });

  it("署名済みのJSON不正とshape不正を400で拒否する", async () => {
    for (const rawBody of [
      '{"events":',
      "[]",
      JSON.stringify({ events: {} }),
      lineBody([{}]),
      lineBody([{ type: "follow", source: { userId: 123 } }]),
      lineBody([{ type: "message", replyToken: 123 }]),
    ]) {
      const t = convexTest(schema, modules);
      const target = await seedFollowTarget(t);
      const before = await lineState(t, target.accountId);

      const response = await t.fetch("/line/webhook", {
        method: "POST",
        body: rawBody,
        headers: await signedHeaders(rawBody),
      });

      expect(response.status).toBe(400);
      await expectLineStateUnchanged(t, target.accountId, before);
    }
  });

  it("不正UTF-8を400で拒否し副作用を起こさない", async () => {
    const t = convexTest(schema, modules);
    const target = await seedFollowTarget(t);
    const before = await lineState(t, target.accountId);

    const response = await t.fetch("/line/webhook", {
      method: "POST",
      body: new Uint8Array([0xc3, 0x28]),
      headers: { "content-type": "application/json" },
    });

    expect(response.status).toBe(400);
    await expectLineStateUnchanged(t, target.accountId, before);
  });

  it("処理対象eventのidentityまたはprovider timestamp欠落を400で拒否する", async () => {
    for (const event of [
      { type: "follow", source: { userId: "U_webhook_target" }, timestamp: 3_000 },
      { type: "follow", source: { userId: "U_webhook_target" }, webhookEventId: "missing-timestamp" },
    ]) {
      const t = convexTest(schema, modules);
      const target = await seedFollowTarget(t);
      const before = await lineState(t, target.accountId);
      const rawBody = lineBody([event]);

      const response = await t.fetch("/line/webhook", {
        method: "POST",
        body: rawBody,
        headers: await signedHeaders(rawBody),
      });

      expect(response.status).toBe(400);
      await expectLineStateUnchanged(t, target.accountId, before);
    }
  });

  it("同じmessage eventの別HTTP再送ではReply APIを一回だけ呼び、receiptへPIIを保存しない", async () => {
    const t = convexTest(schema, modules);
    const rawBody = lineBody([
      webhookEvent(
        {
          type: "message",
          source: { type: "user", userId: "U_private_source" },
          replyToken: "private-reply-token",
          message: { id: "private-message-id", type: "text", text: "保存してはいけない本文" },
        },
        "message-replay-receipt",
        NOW,
      ),
    ]);

    const firstResponse = await t.fetch("/line/webhook", {
      method: "POST",
      body: rawBody,
      headers: await signedHeaders(rawBody),
    });
    expect(firstResponse.status).toBe(200);
    const rateLimitAfterFirst = await lineWebhookRateLimitState(t);

    const replayResponse = await t.fetch("/line/webhook", {
      method: "POST",
      body: rawBody,
      headers: await signedHeaders(rawBody),
    });
    expect(replayResponse.status).toBe(200);

    expect(externalFetchMock).toHaveBeenCalledTimes(1);
    expect(await lineWebhookRateLimitState(t)).toEqual(rateLimitAfterFirst);
    const receipts = await t.run(async (ctx) => await ctx.db.query("lineWebhookMessageReceipts").collect());
    expect(receipts).toHaveLength(1);
    expect(receipts[0]).toMatchObject({
      webhookEventId: "message-replay-receipt",
      expiresAt: NOW + LINE_WEBHOOK_MESSAGE_RECEIPT_RETENTION_MS,
    });
    expect(Object.keys(receipts[0]).sort()).toEqual(["_creationTime", "_id", "expiresAt", "webhookEventId"]);
    expect(JSON.stringify(receipts[0])).not.toMatch(
      /private-reply-token|private-message-id|private_source|保存してはいけない本文/,
    );
  });

  it("30日境界でreceiptを削除し、その後の古い署名messageもReply APIへ再送しない", async () => {
    const t = convexTest(schema, modules);
    const rawBody = lineBody([
      webhookEvent({ type: "message", replyToken: "boundary-reply-token" }, "message-retention-boundary", NOW),
    ]);
    const firstResponse = await t.fetch("/line/webhook", {
      method: "POST",
      body: rawBody,
      headers: await signedHeaders(rawBody),
    });
    expect(firstResponse.status).toBe(200);
    expect(externalFetchMock).toHaveBeenCalledTimes(1);

    const cutoff = NOW + LINE_WEBHOOK_MESSAGE_RECEIPT_RETENTION_MS;
    await t.run(async (ctx) => {
      await ctx.db.insert("lineWebhookMessageReceipts", {
        webhookEventId: "message-after-retention-boundary",
        expiresAt: cutoff + 1,
      });
    });
    vi.setSystemTime(cutoff);

    await expect(t.mutation(internal.line.mutations.pruneExpiredWebhookMessageReceipts, {})).resolves.toEqual({
      deletedCount: 1,
      hasMore: false,
    });
    const replayResponse = await t.fetch("/line/webhook", {
      method: "POST",
      body: rawBody,
      headers: await signedHeaders(rawBody),
    });
    expect(replayResponse.status).toBe(200);
    expect(externalFetchMock).toHaveBeenCalledTimes(1);
    await expect(
      t.run(async (ctx) =>
        (await ctx.db.query("lineWebhookMessageReceipts").collect()).map((receipt) => receipt.webhookEventId),
      ),
    ).resolves.toEqual(["message-after-retention-boundary"]);
  });

  it("期限切れreceiptを100件に制限して削除し、101件目を予約jobから再開する", async () => {
    const t = convexTest(schema, modules);
    await t.run(async (ctx) => {
      for (let index = 0; index < LINE_WEBHOOK_MESSAGE_RECEIPT_PRUNE_BATCH_SIZE + 1; index += 1) {
        await ctx.db.insert("lineWebhookMessageReceipts", {
          webhookEventId: `expired-message-${index}`,
          expiresAt: NOW,
        });
      }
    });

    await expect(t.mutation(internal.line.mutations.pruneExpiredWebhookMessageReceipts, {})).resolves.toEqual({
      deletedCount: LINE_WEBHOOK_MESSAGE_RECEIPT_PRUNE_BATCH_SIZE,
      hasMore: true,
    });
    const afterFirstBatch = await t.run(async (ctx) => ({
      receipts: await ctx.db.query("lineWebhookMessageReceipts").collect(),
      scheduled: await ctx.db.system.query("_scheduled_functions").collect(),
    }));
    expect(afterFirstBatch.receipts).toHaveLength(1);
    expect(
      afterFirstBatch.scheduled.some(
        (scheduled) => scheduled.name === "line/mutations:pruneExpiredWebhookMessageReceipts",
      ),
    ).toBe(true);

    await t.finishAllScheduledFunctions(vi.runAllTimers);
    await expect(t.run(async (ctx) => await ctx.db.query("lineWebhookMessageReceipts").collect())).resolves.toEqual([]);
  });

  it("同じwebhookEventIdの再送をno-opにして通知jobを増やさない", async () => {
    const t = convexTest(schema, modules);
    const target = await seedFollowTarget(t);
    const rawBody = lineBody([
      webhookEvent({ type: "follow", source: { userId: target.lineUserId } }, "duplicate-follow", 4_000),
    ]);

    const firstResponse = await t.fetch("/line/webhook", {
      method: "POST",
      body: rawBody,
      headers: await signedHeaders(rawBody),
    });
    expect(firstResponse.status).toBe(200);
    const afterFirst = await lineState(t, target.accountId);

    const replayResponse = await t.fetch("/line/webhook", {
      method: "POST",
      body: rawBody,
      headers: await signedHeaders(rawBody),
    });
    expect(replayResponse.status).toBe(200);
    expect(await lineState(t, target.accountId)).toEqual(afterFirst);
    expect(afterFirst.scheduled).toHaveLength(2);
    expect(externalFetchMock).not.toHaveBeenCalled();
  });

  it("新しいunfollowの後に届いた古いfollowで状態を巻き戻さない", async () => {
    const t = convexTest(schema, modules);
    const target = await seedFollowTarget(t);
    const newerBody = lineBody([
      webhookEvent({ type: "unfollow", source: { userId: target.lineUserId } }, "newer-unfollow", 6_000),
    ]);
    const olderBody = lineBody([
      webhookEvent({ type: "follow", source: { userId: target.lineUserId } }, "older-follow", 5_000),
    ]);

    const newerResponse = await t.fetch("/line/webhook", {
      method: "POST",
      body: newerBody,
      headers: await signedHeaders(newerBody),
    });
    expect(newerResponse.status).toBe(200);
    const afterNewer = await lineState(t, target.accountId);
    expect(afterNewer.account).toMatchObject({
      following: false,
      lastWebhookEventId: "newer-unfollow",
      lastWebhookEventTimestamp: 6_000,
    });

    const olderResponse = await t.fetch("/line/webhook", {
      method: "POST",
      body: olderBody,
      headers: await signedHeaders(olderBody),
    });
    expect(olderResponse.status).toBe(200);
    expect(await lineState(t, target.accountId)).toEqual(afterNewer);
    expect(afterNewer.scheduled).toEqual([]);
    expect(externalFetchMock).not.toHaveBeenCalled();
  });

  it("provider timestampが同じeventもIDの決定的な順序で収束する", async () => {
    const t = convexTest(schema, modules);
    const target = await seedFollowTarget(t);
    const firstBody = lineBody([
      webhookEvent({ type: "follow", source: { userId: target.lineUserId } }, "a-follow", 7_000),
    ]);
    const winningBody = lineBody([
      webhookEvent({ type: "unfollow", source: { userId: target.lineUserId } }, "z-unfollow", 7_000),
    ]);
    const staleTieBody = lineBody([
      webhookEvent({ type: "follow", source: { userId: target.lineUserId } }, "b-follow", 7_000),
    ]);

    for (const body of [firstBody, winningBody, staleTieBody]) {
      const response = await t.fetch("/line/webhook", {
        method: "POST",
        body,
        headers: await signedHeaders(body),
      });
      expect(response.status).toBe(200);
    }

    const state = await lineState(t, target.accountId);
    expect(state.account).toMatchObject({
      following: false,
      lastWebhookEventId: "z-unfollow",
      lastWebhookEventTimestamp: 7_000,
    });
    expect(state.scheduled).toHaveLength(2);
    expect(externalFetchMock).not.toHaveBeenCalled();
  });
});

function lineBody(events: unknown[]) {
  return JSON.stringify({ destination: "U_destination", events });
}

function webhookEvent(event: Record<string, unknown>, webhookEventId: string, timestamp: number) {
  return { ...event, webhookEventId, timestamp };
}

async function signedHeaders(rawBody: string) {
  return {
    "content-type": "application/json; charset=utf-8",
    "x-line-signature": await sign(rawBody),
  };
}

async function sign(rawBody: string) {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(CHANNEL_SECRET),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signature = new Uint8Array(await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(rawBody)));
  let binary = "";
  for (const byte of signature) binary += String.fromCharCode(byte);
  return btoa(binary);
}

async function seedFollowTarget(t: TestConvex<typeof schema>) {
  return await t.run(async (ctx) => {
    const shopId = await seedShop(ctx, "Webhook店舗");
    const staffId = await seedStaff(ctx, {
      shopId,
      name: "Webhookスタッフ",
      email: "line-webhook@example.com",
      isDeleted: false,
    });
    const lineUserId = "U_webhook_target";
    const accountId = await seedStaffLineAccount(ctx, {
      shopId,
      staffId,
      lineUserId,
      following: false,
    });
    return { staffId, lineUserId, accountId };
  });
}

async function lineState(t: TestConvex<typeof schema>, accountId: Id<"staffLineAccounts">) {
  return await t.run(async (ctx) => {
    const account = await ctx.db.get(accountId);
    const scheduled = await ctx.db.system.query("_scheduled_functions").collect();
    return {
      account,
      scheduled: scheduled
        .map((job) => ({ name: job.name, args: job.args }))
        .sort((a, b) => a.name.localeCompare(b.name)),
    };
  });
}

async function expectLineStateUnchanged(
  t: TestConvex<typeof schema>,
  accountId: Id<"staffLineAccounts">,
  before: Awaited<ReturnType<typeof lineState>>,
) {
  expect(await lineState(t, accountId)).toEqual(before);
  expect(externalFetchMock).not.toHaveBeenCalled();
}

async function lineWebhookRateLimitState(t: TestConvex<typeof schema>) {
  return await t.run(async (ctx) =>
    ctx.db
      .query("rateLimits")
      .withIndex("name", (q) => q.eq("name", "lineWebhook").eq("key", "global"))
      .collect(),
  );
}
