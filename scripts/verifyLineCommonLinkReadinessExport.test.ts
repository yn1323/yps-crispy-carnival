import { describe, expect, it } from "vitest";
import {
  type LineCommonLinkVerificationInput,
  verifyLineCommonLinkReadiness,
} from "./verifyLineCommonLinkReadinessExport";

const NOW = Date.UTC(2026, 7, 13);

function canonicalFixture(): LineCommonLinkVerificationInput {
  return {
    organizations: [{ _id: "org", isDeleted: false }],
    shops: [{ _id: "shop", organizationId: "org", operatingStatus: "active", isDeleted: false }],
    people: [{ _id: "person", organizationId: "org", status: "active", lineLinkGeneration: 1 }],
    staffs: [
      {
        _id: "staff",
        shopId: "shop",
        organizationId: "org",
        organizationPersonId: "person",
        isDeleted: false,
      },
    ],
    legacyAccounts: [],
    providerUsers: [
      { _id: "provider", lineUserId: "secret-line-id", following: true, stateVersion: 1, isDeleted: false },
    ],
    personLinks: [
      {
        _id: "link",
        organizationId: "org",
        organizationPersonId: "person",
        lineProviderUserId: "provider",
        generation: 1,
        isDeleted: false,
      },
    ],
    lineLinkTokens: [],
    notificationOutbox: [],
    fanoutJobs: [],
  };
}

describe("verifyLineCommonLinkReadiness", () => {
  it("active所属のcanonical linkにlegacy projectionがなければ公開を停止する", () => {
    const report = verifyLineCommonLinkReadiness(canonicalFixture(), NOW);

    expect(report).toMatchObject({ ok: false, rolloutPath: "blocked" });
    expect(report.anomalies.activeCanonicalLinkWithoutExactLegacyProjection).toBe(1);
    expect(JSON.stringify(report)).not.toContain("secret-line-id");
    expect(report.scheduledCallerCheck).toBe("required_from_deployment");
  });

  it("LINE未連携の単店舗データをzero経路と判定する", () => {
    const input = canonicalFixture();
    input.providerUsers = [];
    input.personLinks = [];
    input.people[0].lineLinkGeneration = undefined;

    const report = verifyLineCommonLinkReadiness(input, NOW);

    expect(report).toMatchObject({ ok: true, rolloutPath: "zero" });
    expect(Object.values(report.anomalies).every((count) => count === 0)).toBe(true);
  });

  it("正常なlegacy counterpartが残る場合は異常ではなくstaged経路にする", () => {
    const input = canonicalFixture();
    input.legacyAccounts.push({
      _id: "legacy",
      staffId: "staff",
      shopId: "shop",
      lineUserId: "secret-line-id",
      following: true,
      isDeleted: false,
    });

    const report = verifyLineCommonLinkReadiness(input, NOW);

    expect(report).toMatchObject({ ok: true, rolloutPath: "staged" });
    expect(report.counts.activeLegacyAccounts).toBe(1);
    expect(report.anomalies.legacyWithoutCanonicalCounterpart).toBe(0);
  });

  it("backfill前の正常なlegacy rowだけなら変換対象としてstaged経路にする", () => {
    const input = canonicalFixture();
    input.providerUsers = [];
    input.personLinks = [];
    input.people[0].lineLinkGeneration = undefined;
    input.legacyAccounts.push({
      _id: "legacy",
      staffId: "staff",
      shopId: "shop",
      lineUserId: "secret-line-id",
      following: true,
      isDeleted: false,
    });

    const report = verifyLineCommonLinkReadiness(input, NOW);

    expect(report).toMatchObject({ ok: true, rolloutPath: "staged" });
    expect(report.anomalies.legacyWithoutCanonicalCounterpart).toBe(1);
  });

  it("複数店舗、異なるLINE所有、旧tokenと世代欠損Outboxを有限件数で停止する", () => {
    const input = canonicalFixture();
    input.shops.push({ _id: "shop2", organizationId: "org", operatingStatus: "active", isDeleted: false });
    input.people.push({ _id: "person2", organizationId: "org", status: "active", lineLinkGeneration: 0 });
    input.staffs.push({
      _id: "staff2",
      shopId: "shop2",
      organizationId: "org",
      organizationPersonId: "person2",
      isDeleted: false,
    });
    input.legacyAccounts.push(
      {
        _id: "legacy1",
        staffId: "staff",
        shopId: "shop",
        lineUserId: "shared-line",
        following: true,
        isDeleted: false,
      },
      {
        _id: "legacy2",
        staffId: "staff2",
        shopId: "shop2",
        lineUserId: "shared-line",
        following: false,
        isDeleted: false,
      },
    );
    input.lineLinkTokens.push({ _id: "old-token", expiresAt: NOW + 1, token: "do-not-print" });
    input.lineLinkTokens.push({
      _id: "incomplete-token",
      organizationId: "org",
      expiresAt: NOW + 1,
      token: "do-not-print-either",
    });
    input.notificationOutbox.push(
      { _id: "outbox", channel: "line", status: "pending" },
      {
        _id: "incomplete-outbox",
        channel: "line",
        status: "pending",
        organizationPersonLineGenerationAtEnqueue: 1,
      },
    );

    const report = verifyLineCommonLinkReadiness(input, NOW);

    expect(report).toMatchObject({ ok: false, rolloutPath: "blocked" });
    expect(report.anomalies.organizationsWithMultipleShops).toBe(1);
    expect(report.anomalies.legacyOrganizationLineOwnershipConflict).toBe(1);
    expect(report.anomalies.legacyFriendshipConflict).toBe(1);
    expect(report.counts.oldUnusedTokens).toBe(2);
    expect(report.counts.activeLineOutboxWithoutGeneration).toBe(2);
    expect(report.anomalies.incompleteUnusedTokenSnapshots).toBe(1);
    expect(report.anomalies.incompleteActiveLineOutboxSnapshots).toBe(1);
    expect(JSON.stringify(report)).not.toContain("do-not-print");
  });

  it("Widen前のoperatingStatus欠損店舗をactiveとして複数店舗gateへ数える", () => {
    const input = canonicalFixture();
    input.shops.push({ _id: "legacy-active-shop", organizationId: "org", isDeleted: false });

    const report = verifyLineCommonLinkReadiness(input, NOW);

    expect(report).toMatchObject({ ok: false, rolloutPath: "blocked" });
    expect(report.anomalies.organizationsWithMultipleShops).toBe(1);
  });

  it("archived店舗のstaff履歴を現在の複数店舗所属へ数えない", () => {
    const input = canonicalFixture();
    input.legacyAccounts.push({
      _id: "legacy",
      staffId: "staff",
      shopId: "shop",
      lineUserId: "secret-line-id",
      following: true,
      isDeleted: false,
    });
    input.shops.push({
      _id: "archived-shop",
      organizationId: "org",
      operatingStatus: "archived",
      isDeleted: false,
    });
    input.staffs.push({
      _id: "archived-staff-history",
      shopId: "archived-shop",
      organizationId: "org",
      organizationPersonId: "person",
      isDeleted: false,
    });

    const report = verifyLineCommonLinkReadiness(input, NOW);

    expect(report).toMatchObject({ ok: true, rolloutPath: "staged" });
    expect(report.anomalies.peopleWithMultipleActiveStaffs).toBe(0);
  });

  it("所属0件で保持するcanonical linkにはlegacy projectionを要求しない", () => {
    const input = canonicalFixture();
    input.staffs = [];

    const report = verifyLineCommonLinkReadiness(input, NOW);

    expect(report).toMatchObject({ ok: true, rolloutPath: "zero" });
    expect(report.anomalies.activeCanonicalLinkWithoutExactLegacyProjection).toBe(0);
  });

  it("対象店舗数とは別にstaff履歴のruntime走査上限を停止条件にする", () => {
    const input = canonicalFixture();
    for (let index = 0; index < 100; index += 1) {
      const shopId = `archived-shop-${index}`;
      input.shops.push({
        _id: shopId,
        organizationId: "org",
        operatingStatus: "archived",
        isDeleted: false,
      });
      input.staffs.push({
        _id: `archived-staff-${index}`,
        shopId,
        organizationId: "org",
        organizationPersonId: "person",
        isDeleted: false,
      });
    }

    const report = verifyLineCommonLinkReadiness(input, NOW);

    expect(report).toMatchObject({ ok: false, rolloutPath: "blocked" });
    expect(report.anomalies.peopleWithMultipleActiveStaffs).toBe(0);
    expect(report.anomalies.personStaffHistoryOverLimit).toBe(1);
  });

  it("同じLINE利用者のactive provider重複をcanonical切替前に停止する", () => {
    const input = canonicalFixture();
    input.organizations.push({ _id: "org2", isDeleted: false });
    input.shops.push({ _id: "shop2", organizationId: "org2", operatingStatus: "active", isDeleted: false });
    input.people.push({
      _id: "person2",
      organizationId: "org2",
      status: "active",
      lineLinkGeneration: 1,
    });
    input.staffs.push({
      _id: "staff2",
      shopId: "shop2",
      organizationId: "org2",
      organizationPersonId: "person2",
      isDeleted: false,
    });
    input.providerUsers.push({
      _id: "provider2",
      lineUserId: "secret-line-id",
      following: true,
      stateVersion: 1,
      isDeleted: false,
    });
    input.personLinks.push({
      _id: "link2",
      organizationId: "org2",
      organizationPersonId: "person2",
      lineProviderUserId: "provider2",
      generation: 1,
      isDeleted: false,
    });

    const report = verifyLineCommonLinkReadiness(input, NOW);

    expect(report).toMatchObject({ ok: false, rolloutPath: "blocked" });
    expect(report.anomalies.canonicalProviderUserDuplicate).toBe(1);
    expect(JSON.stringify(report)).not.toContain("secret-line-id");
  });
});
