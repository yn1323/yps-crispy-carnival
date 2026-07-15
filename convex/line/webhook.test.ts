import type { TestConvex } from "convex-test";
import { convexTest } from "convex-test";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Id } from "../_generated/dataModel";
import { seedShop, seedStaffLineAccount } from "../_test/seed";
import { modules, schema } from "../_test/setup.test-helper";
import { LINE_WEBHOOK_BODY_MAX_BYTES, LINE_WEBHOOK_EVENT_MAX_COUNT } from "../constants";

const CHANNEL_SECRET = "test-line-channel-secret";
const externalFetchMock = vi.fn();

describe("line/webhook", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.stubEnv("LINE_MESSAGING_CHANNEL_SECRET", CHANNEL_SECRET);
    vi.stubGlobal("fetch", externalFetchMock);
    externalFetchMock.mockClear();
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
    const rawBody = lineBody([{ type: "follow", source: { userId: target.lineUserId } }]);

    const response = await t.fetch("/line/webhook", {
      method: "POST",
      body: rawBody,
      headers: await signedHeaders(rawBody),
    });

    expect(response.status).toBe(200);
    const state = await lineState(t, target.accountId);
    expect(state.account).toMatchObject({ following: true });
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
      Array.from({ length: LINE_WEBHOOK_EVENT_MAX_COUNT }, (_, index) => ({ type: `unknown_${index}` })),
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
});

function lineBody(events: unknown[]) {
  return JSON.stringify({ destination: "U_destination", events });
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
    const staffId = await ctx.db.insert("staffs", {
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
