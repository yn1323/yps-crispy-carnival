import type { WithoutSystemFields } from "convex/server";
import type { Doc, Id, TableNames } from "../_generated/dataModel";
import type { MutationCtx } from "../_generated/server";
import { generateDateRange } from "../_lib/dateFormat";
import type { ShiftSubmissionPattern } from "../_lib/submissionPattern";
import { generateUUID } from "../_lib/uuid";
import { getLegalConsentVersions } from "../legal/documents";
import { upsertOrganizationPersonLineLink } from "../line/service";
import { buildConfirmationSnapshotSignature } from "../notification/confirmationSnapshots";
import {
  buildDevelopmentSeedRecruitmentWindows,
  DEVELOPMENT_SEED_SCENARIO_KEYS,
  type DevelopmentSeedRecruitmentWindow,
  type DevelopmentSeedRecruitmentWindowKey,
  type DevelopmentSeedScenario,
  type DevelopmentSeedScenarioKey,
  getDevelopmentSeedScenario,
  ownerAuthTokenIdentifier,
  POLICY_RESTRICTED_EXTRA_MANAGER_AUTH_TOKEN_IDENTIFIERS,
  PRIMARY_SEED_AUTH_TOKEN_IDENTIFIER,
  READ_ONLY_SEED_AUTH_TOKEN_IDENTIFIER,
} from "./catalog";

type SeedDocument<Table extends TableNames> = WithoutSystemFields<Doc<Table>>;

class SeedWriter {
  insertedCount = 0;

  constructor(private readonly ctx: MutationCtx) {}

  async insert<Table extends TableNames>(table: Table, value: SeedDocument<Table>): Promise<Id<Table>> {
    const id = await this.ctx.db.insert(table, value);
    this.insertedCount += 1;
    return id;
  }

  async upsertPersonLineLink(args: Parameters<typeof upsertOrganizationPersonLineLink>[1]): Promise<void> {
    await upsertOrganizationPersonLineLink(this.ctx, args);
    this.insertedCount += 1;
  }
}

type SeedStaff = {
  staffId: Id<"staffs">;
  personId: Id<"organizationPeople">;
  email: string;
  excludedFromShift: boolean;
};

type SeedShop = {
  shopId: Id<"shops">;
  pattern: ShiftSubmissionPattern;
  positions: Id<"positions">[];
  staffs: SeedStaff[];
};

function seedEmail(localPart: string): string {
  return `${localPart}@seed.example.test`;
}

function personName(index: number): string {
  if (index === 0) return "[SEED] 提出済み";
  if (index === 1) return "[SEED] 全休希望";
  if (index === 2) return "[SEED] 未提出";
  return "[SEED] シフト対象外";
}

export async function seedDevelopmentActors(ctx: MutationCtx): Promise<{ createdCount: number }> {
  const existing = await ctx.db
    .query("users")
    .withIndex("by_authTokenIdentifier", (q) => q.eq("authTokenIdentifier", PRIMARY_SEED_AUTH_TOKEN_IDENTIFIER))
    .unique();
  if (existing) throw new Error("Development seed actors already exist; clear all tables before seeding");

  const writer = new SeedWriter(ctx);
  await writer.insert("users", {
    authTokenIdentifier: PRIMARY_SEED_AUTH_TOKEN_IDENTIFIER,
    name: "[SEED] 管理者A（Clerk置換対象）",
    email: seedEmail("primary-manager"),
    emailNormalized: seedEmail("primary-manager"),
    role: "manager",
    isDeleted: false,
  });

  for (const key of DEVELOPMENT_SEED_SCENARIO_KEYS) {
    if (key === "free-capacity") continue;
    await writer.insert("users", {
      authTokenIdentifier: ownerAuthTokenIdentifier(key),
      name: `[SEED] ${key} 管理者B`,
      email: seedEmail(`owner-${key}`),
      emailNormalized: seedEmail(`owner-${key}`),
      role: "manager",
      isDeleted: false,
    });
  }

  await writer.insert("users", {
    authTokenIdentifier: READ_ONLY_SEED_AUTH_TOKEN_IDENTIFIER,
    name: "[SEED] 閲覧管理者",
    email: seedEmail("readonly-manager"),
    emailNormalized: seedEmail("readonly-manager"),
    role: "manager",
    isDeleted: false,
  });
  for (const [index, authTokenIdentifier] of POLICY_RESTRICTED_EXTRA_MANAGER_AUTH_TOKEN_IDENTIFIERS.entries()) {
    const ordinal = index + 1;
    await writer.insert("users", {
      authTokenIdentifier,
      name: `[SEED] 利用条件制限・管理者${ordinal}`,
      email: seedEmail(`policy-restricted-manager-${ordinal}`),
      emailNormalized: seedEmail(`policy-restricted-manager-${ordinal}`),
      role: "manager",
      isDeleted: false,
    });
  }
  return { createdCount: writer.insertedCount };
}

async function requireSeedUser(ctx: MutationCtx, authTokenIdentifier: string) {
  const user = await ctx.db
    .query("users")
    .withIndex("by_authTokenIdentifier", (q) => q.eq("authTokenIdentifier", authTokenIdentifier))
    .unique();
  if (!user) throw new Error("Development seed actors must be created before scenarios");
  return user;
}

async function insertPersonAndMember(
  writer: SeedWriter,
  organizationId: Id<"organizations">,
  user: Doc<"users">,
  status: "active" | "readOnly",
  now: number,
) {
  const personId = await writer.insert("organizationPeople", {
    organizationId,
    userId: user._id,
    name: user.name,
    email: user.email,
    emailNormalized: user.emailNormalized ?? user.email.toLowerCase(),
    status: "active",
    lineLinkGeneration: 0,
    createdAt: now,
    updatedAt: now,
  });
  const memberId = await writer.insert("organizationMembers", {
    organizationId,
    personId,
    userId: user._id,
    status,
    createdAt: now,
    updatedAt: now,
  });
  return { personId, memberId };
}

async function insertStaffPeople(
  writer: SeedWriter,
  scenario: DevelopmentSeedScenario,
  organizationId: Id<"organizations">,
  now: number,
): Promise<Array<{ personId: Id<"organizationPeople">; name: string; email: string; excludedFromShift: boolean }>> {
  const count = scenario.key === "free-capacity" || scenario.key === "payment-restricted" ? 4 : 3;
  const people = [];
  for (let index = 0; index < count; index += 1) {
    const email = seedEmail(`${scenario.key}-staff-${index + 1}`);
    const name = personName(index);
    const personId = await writer.insert("organizationPeople", {
      organizationId,
      name,
      email,
      emailNormalized: email,
      status: "active",
      lineLinkGeneration: 0,
      createdAt: now,
      updatedAt: now,
    });
    people.push({ personId, name, email, excludedFromShift: index === 3 });
  }
  return people;
}

async function insertShopGraph(
  writer: SeedWriter,
  scenario: DevelopmentSeedScenario,
  organizationId: Id<"organizations">,
  staffPeople: Awaited<ReturnType<typeof insertStaffPeople>>,
): Promise<SeedShop[]> {
  const shops: SeedShop[] = [];
  for (let shopIndex = 0; shopIndex < scenario.shopNames.length; shopIndex += 1) {
    const pattern = scenario.shopPatterns[shopIndex];
    const shopId = await writer.insert("shops", {
      organizationId,
      // 支払い・利用条件による契約制限はbilling stateだけで表し、店舗停止とは混同しない。
      operatingStatus: "active",
      name: scenario.shopNames[shopIndex],
      regularClosedDays: [],
      submissionPattern: pattern,
      isDeleted: false,
    });

    const positions: Id<"positions">[] = [];
    const staffs: SeedStaff[] = [];
    if (scenario.dataProfile !== "billingOnly") {
      positions.push(
        await writer.insert("positions", {
          shopId,
          name: "[SEED] 通常",
          color: "#64748b",
          sortOrder: 0,
          isDefault: true,
          isDeleted: false,
        }),
      );
      if (scenario.key === "standard-operations") {
        positions.push(
          await writer.insert("positions", {
            shopId,
            name: "[SEED] リーダー",
            color: "#0f766e",
            sortOrder: 1,
            isDefault: false,
            isDeleted: false,
          }),
        );
      }

      for (const person of staffPeople) {
        const staffId = await writer.insert("staffs", {
          shopId,
          organizationId,
          organizationPersonId: person.personId,
          name: person.name,
          email: person.email,
          emailNormalized: person.email,
          excludedFromShift: person.excludedFromShift,
          isDeleted: false,
        });
        staffs.push({
          staffId,
          personId: person.personId,
          email: person.email,
          excludedFromShift: person.excludedFromShift,
        });
      }
    }
    shops.push({ shopId, pattern, positions, staffs });
  }
  return shops;
}

async function insertSubmissionGraph(
  writer: SeedWriter,
  recruitmentId: Id<"recruitments">,
  pattern: ShiftSubmissionPattern,
  staffs: SeedStaff[],
  date: string,
  now: number,
) {
  const submittedStaffs = staffs.filter((staff) => !staff.excludedFromShift).slice(0, 2);
  for (let index = 0; index < submittedStaffs.length; index += 1) {
    const staff = submittedStaffs[index];
    const submissionId = await writer.insert("shiftSubmissions", {
      recruitmentId,
      staffId: staff.staffId,
      firstSubmittedAt: now - 60 * 60 * 1000,
      submittedAt: now - 30 * 60 * 1000,
    });
    if (index === 1) continue;
    if (pattern.kind === "dateOnly") {
      await writer.insert("shiftSubmissionDates", {
        submissionId,
        recruitmentId,
        staffId: staff.staffId,
        date,
      });
    } else {
      const option = pattern.kind === "shiftType" ? pattern.options[0] : undefined;
      await writer.insert("shiftSubmissionSlots", {
        submissionId,
        recruitmentId,
        staffId: staff.staffId,
        date,
        startTime: option?.startTime ?? "10:00",
        endTime: option?.endTime ?? "18:00",
        ...(option ? { optionId: option.id } : {}),
      });
    }
  }
  return submittedStaffs.length;
}

async function insertRecruitment(
  writer: SeedWriter,
  shop: SeedShop,
  window: DevelopmentSeedRecruitmentWindow,
  now: number,
  options: { withAssignments: boolean; withSnapshot?: boolean },
) {
  const recruitmentId = await writer.insert("recruitments", {
    shopId: shop.shopId,
    periodStart: window.periodStart,
    periodEnd: window.periodEnd,
    deadline: window.deadline,
    shopClosedDates: [],
    status: window.status,
    ...(window.status === "confirmed" ? { confirmedAt: now - 2 * 60 * 60 * 1000 } : {}),
    isDeleted: false,
    submissionPattern: shop.pattern,
    ...(options.withAssignments ? { draftSavedAt: now - 90 * 60 * 1000 } : {}),
  });

  const activeStaffs = shop.staffs.filter((staff) => !staff.excludedFromShift);
  const firstDate = generateDateRange(window.periodStart, window.periodEnd)[0];
  const submittedCount = await insertSubmissionGraph(writer, recruitmentId, shop.pattern, activeStaffs, firstDate, now);
  await writer.insert("recruitmentStats", {
    recruitmentId,
    shopId: shop.shopId,
    submittedCount,
    activeStaffCountSnapshot: activeStaffs.length,
    updatedAt: now,
  });

  const assignments: Array<{
    date: string;
    startTime: string;
    endTime: string;
    positionId: Id<"positions">;
    optionId?: string;
  }> = [];
  if (options.withAssignments && activeStaffs[0] && shop.positions[0]) {
    const option = shop.pattern.kind === "shiftType" ? shop.pattern.options[1] : undefined;
    const assignment = {
      date: firstDate,
      startTime: option?.startTime ?? "09:00",
      endTime: option?.endTime ?? "17:00",
      positionId: shop.positions[1] ?? shop.positions[0],
      ...(option ? { optionId: option.id } : {}),
    };
    await writer.insert("shiftAssignments", {
      recruitmentId,
      staffId: activeStaffs[0].staffId,
      ...assignment,
    });
    assignments.push(assignment);
  }

  if (options.withSnapshot && activeStaffs[0] && assignments[0]) {
    const { optionId: _currentOptionId, ...snapshotAssignment } = assignments[0];
    const snapshotOption = shop.pattern.kind === "shiftType" ? shop.pattern.options[0] : undefined;
    const snapshotAssignments = [
      {
        ...snapshotAssignment,
        startTime: snapshotOption?.startTime ?? "09:00",
        endTime: snapshotOption?.endTime ?? "17:00",
        ...(snapshotOption ? { optionId: snapshotOption.id } : {}),
      },
    ];
    await writer.insert("shiftConfirmationSnapshots", {
      recruitmentId,
      staffId: activeStaffs[0].staffId,
      signature: buildConfirmationSnapshotSignature(snapshotAssignments),
      assignments: snapshotAssignments,
      sentAt: now - 3 * 60 * 60 * 1000,
      updatedAt: now - 3 * 60 * 60 * 1000,
    });
  }
  return recruitmentId;
}

async function seedOperationalData(
  writer: SeedWriter,
  scenario: DevelopmentSeedScenario,
  shops: SeedShop[],
  today: string,
  now: number,
) {
  const windows = buildDevelopmentSeedRecruitmentWindows(today);
  const recruitmentIds: Id<"recruitments">[] = [];
  if (scenario.key === "standard-operations") {
    const keys = Object.keys(windows) as DevelopmentSeedRecruitmentWindowKey[];
    for (const key of keys) {
      recruitmentIds.push(
        await insertRecruitment(writer, shops[0], windows[key], now, {
          withAssignments: windows[key].status === "confirmed" || key === "actionRequired",
        }),
      );
    }
    recruitmentIds.push(
      await insertRecruitment(writer, shops[1], windows.currentConfirmed, now, { withAssignments: true }),
    );
    recruitmentIds.push(
      await insertRecruitment(writer, shops[2], windows.currentConfirmed, now, { withAssignments: true }),
    );
  } else if (scenario.key === "free-capacity") {
    recruitmentIds.push(await insertRecruitment(writer, shops[0], windows.recruiting, now, { withAssignments: false }));
  } else if (scenario.key === "pro-notifications") {
    recruitmentIds.push(
      await insertRecruitment(writer, shops[0], windows.currentConfirmed, now, {
        withAssignments: true,
        withSnapshot: true,
      }),
    );
    recruitmentIds.push(
      await insertRecruitment(writer, shops[0], windows.actionRequired, now, {
        withAssignments: false,
      }),
    );
  } else {
    recruitmentIds.push(
      await insertRecruitment(writer, shops[0], windows.currentConfirmed, now, { withAssignments: true }),
    );
  }
  return recruitmentIds;
}

async function seedRegistrationData(
  writer: SeedWriter,
  scenario: DevelopmentSeedScenario,
  firstShopId: Id<"shops">,
  existingStaffEmail: string,
  now: number,
) {
  if (scenario.key !== "free-capacity" && scenario.key !== "trial-ending") return;
  const legalVersions = getLegalConsentVersions("staff");
  const email = seedEmail(`${scenario.key}-approval-pending`);
  await writer.insert("staffRegistrationRequests", {
    shopId: firstShopId,
    name: scenario.key === "free-capacity" ? "[SEED] 上限で承認不可" : "[SEED] 承認可能",
    email,
    emailNormalized: email,
    status: "pending",
    ...legalVersions,
    consentedAt: now - 60 * 60 * 1000,
    createdAt: now - 60 * 60 * 1000,
  });
  if (scenario.key === "trial-ending") {
    await writer.insert("staffRegistrationRequests", {
      shopId: firstShopId,
      name: "[SEED] 既存スタッフのため承認不可",
      email: existingStaffEmail,
      emailNormalized: existingStaffEmail,
      status: "pending",
      ...legalVersions,
      consentedAt: now - 2 * 60 * 60 * 1000,
      createdAt: now - 2 * 60 * 60 * 1000,
    });
    await writer.insert("shopRegistrationLinks", {
      shopId: firstShopId,
      token: generateUUID(),
      createdAt: now - 24 * 60 * 60 * 1000,
    });
  }
}

async function seedConsentData(
  ctx: MutationCtx,
  writer: SeedWriter,
  scenario: DevelopmentSeedScenario,
  firstShopId: Id<"shops">,
  primaryUserId: Id<"users">,
  now: number,
) {
  if (scenario.dataProfile === "billingOnly") return;
  const legalVersions = getLegalConsentVersions("manager");
  const consent = {
    subjectType: "user" as const,
    userId: primaryUserId,
    shopId: firstShopId,
    ...legalVersions,
    consentedAt: now - 2 * 24 * 60 * 60 * 1000,
    method: "manager_setup",
  };
  const existingState = await ctx.db
    .query("legalConsentStates")
    .withIndex("by_userId", (q) => q.eq("userId", primaryUserId))
    .unique();
  if (existingState) {
    await ctx.db.patch(existingState._id, consent);
  } else {
    await writer.insert("legalConsentStates", consent);
  }
  await writer.insert("legalConsentEvents", consent);
}

async function seedCustomStaffOrder(
  writer: SeedWriter,
  scenario: DevelopmentSeedScenario,
  organizationId: Id<"organizations">,
  managerPersonIds: readonly Id<"organizationPeople">[],
  staffPeople: Awaited<ReturnType<typeof insertStaffPeople>>,
  shops: SeedShop[],
  today: string,
  now: number,
) {
  if (scenario.key !== "standard-operations") return;
  await writer.insert("organizationStaffOrderStates", {
    organizationId,
    revision: 1,
    activatedAt: now,
    updatedAt: now,
  });
  const orderedPersonIds = [...[...staffPeople].reverse().map((person) => person.personId), ...managerPersonIds];
  for (const [displayOrder, organizationPersonId] of orderedPersonIds.entries()) {
    await writer.insert("organizationStaffOrderEntries", {
      organizationId,
      organizationPersonId,
      displayOrder,
    });
  }
  for (const shop of shops) {
    for (const staff of shop.staffs) {
      const displayOrder = orderedPersonIds.indexOf(staff.personId);
      await writer.insert("shopStaffOrderEntries", {
        organizationId,
        shopId: shop.shopId,
        staffId: staff.staffId,
        organizationPersonId: staff.personId,
        displayOrder,
      });
    }
  }
  await writer.insert("dashboardAnnouncements", {
    organizationId,
    title: "[SEED] 開発データのお知らせ",
    bodyHtml: "<p>このお知らせは開発用seedです。</p>",
    displayDate: today,
    isPublished: true,
    isDeleted: false,
  });
}

async function seedLineAndNotificationData(
  writer: SeedWriter,
  scenario: DevelopmentSeedScenario,
  organizationId: Id<"organizations">,
  firstShop: SeedShop,
  confirmedRecruitmentId: Id<"recruitments">,
  openRecruitmentId: Id<"recruitments">,
  now: number,
) {
  if (scenario.key !== "pro-notifications") return;
  for (let index = 0; index < 2; index += 1) {
    const staff = firstShop.staffs[index];
    const following = index === 0;
    const lineUserId = `U_SEED_${following ? "FOLLOWING" : "BLOCKED"}_00${index + 1}`;
    const providerUserId = await writer.insert("lineProviderUsers", {
      lineUserId,
      following,
      stateVersion: 1,
      friendshipObservedAt: now - 24 * 60 * 60 * 1000,
      friendshipObservationSource: "oauth",
      isDeleted: false,
    });
    await writer.upsertPersonLineLink({
      organizationId,
      organizationPersonId: staff.personId,
      lineProviderUserId: providerUserId,
      linkedAt: now - 24 * 60 * 60 * 1000,
    });
    await writer.insert("staffLineAccounts", {
      staffId: staff.staffId,
      shopId: firstShop.shopId,
      lineUserId,
      linkedAt: now - 24 * 60 * 60 * 1000,
      following,
      isDeleted: false,
    });
  }
  await writer.insert("lineQuotaStatus", {
    checkedAt: now,
    totalQuota: 5000,
    consumed: 125,
    remaining: 4875,
    status: "normal",
    plan: "light",
  });

  const failedContext = "notification.sendRecruitmentNotificationEmails";
  const failedOutboxId = await writer.insert("notificationOutbox", {
    channel: "email",
    status: "failed",
    dedupeKey: "seed-business-confirmation-failed",
    shopId: firstShop.shopId,
    organizationId,
    purpose: "business",
    recruitmentId: openRecruitmentId,
    staffId: firstShop.staffs[0].staffId,
    notificationContext: failedContext,
    deliverySuppressed: true,
    payload: {
      kind: "email",
      from: "noreply@seed.example.test",
      to: firstShop.staffs[0].email,
      subject: "[SEED] シフト募集",
      html: "<p>開発用通知です。</p>",
      context: failedContext,
      suppressDelivery: true,
    },
    attemptCount: 3,
    nextRunAt: now - 60 * 60 * 1000,
    lastError: "seed_provider_failure",
    failedAt: now - 60 * 60 * 1000,
    terminalAt: now - 60 * 60 * 1000,
    createdAt: now - 2 * 60 * 60 * 1000,
    updatedAt: now - 60 * 60 * 1000,
  });
  const failedEventId = await writer.insert("notificationDeliveryEvents", {
    eventType: "final_failed",
    createdAt: now - 60 * 60 * 1000,
    expiresAt: now + 30 * 24 * 60 * 60 * 1000,
    shopId: firstShop.shopId,
    organizationId,
    recruitmentId: openRecruitmentId,
    staffId: firstShop.staffs[0].staffId,
    outboxId: failedOutboxId,
    channel: "email",
    dedupeKey: "seed-business-confirmation-failed",
    notificationContext: failedContext,
    attemptCount: 3,
    errorMessage: "seed_provider_failure",
    errorName: "SeedDeliveryError",
  });
  await writer.insert("notificationHistory", {
    outboxId: failedOutboxId,
    shopId: firstShop.shopId,
    staffId: firstShop.staffs[0].staffId,
    channel: "email",
    notificationKind: "shiftRecruitment",
    displayTitle: "[SEED] シフト募集（失敗）",
    sendStatus: "failed",
    deliveryStatus: "failed",
    requestedAt: now - 2 * 60 * 60 * 1000,
    failedAt: now - 60 * 60 * 1000,
    deliveryStatusAt: now - 60 * 60 * 1000,
    updatedAt: now - 60 * 60 * 1000,
  });
  await writer.insert("notificationFailureInbox", {
    failureKey: "seed-business-open-failure",
    sourceType: "outbox",
    status: "open",
    shopId: firstShop.shopId,
    recruitmentId: openRecruitmentId,
    staffId: firstShop.staffs[0].staffId,
    outboxId: failedOutboxId,
    channel: "email",
    dedupeKey: "seed-business-confirmation-failed",
    notificationContext: failedContext,
    firstFailedAt: now - 60 * 60 * 1000,
    lastFailedAt: now - 60 * 60 * 1000,
    lastEventId: failedEventId,
    attemptCount: 3,
    lastError: "seed_provider_failure",
    errorName: "SeedDeliveryError",
    createdAt: now - 60 * 60 * 1000,
    updatedAt: now - 60 * 60 * 1000,
  });

  const sentContext = "notification.sendConfirmationEmail";
  const sentOutboxId = await writer.insert("notificationOutbox", {
    channel: "email",
    status: "sent",
    dedupeKey: "seed-business-confirmation-sent",
    shopId: firstShop.shopId,
    organizationId,
    purpose: "business",
    recruitmentId: confirmedRecruitmentId,
    staffId: firstShop.staffs[0].staffId,
    notificationContext: sentContext,
    deliverySuppressed: true,
    payload: {
      kind: "email",
      from: "noreply@seed.example.test",
      to: firstShop.staffs[0].email,
      subject: "[SEED] 確定シフト",
      html: "<p>開発用通知です。</p>",
      context: sentContext,
      suppressDelivery: true,
    },
    attemptCount: 1,
    nextRunAt: now - 4 * 60 * 60 * 1000,
    sentAt: now - 4 * 60 * 60 * 1000,
    terminalAt: now - 4 * 60 * 60 * 1000,
    createdAt: now - 5 * 60 * 60 * 1000,
    updatedAt: now - 4 * 60 * 60 * 1000,
  });
  await writer.insert("notificationHistory", {
    outboxId: sentOutboxId,
    shopId: firstShop.shopId,
    staffId: firstShop.staffs[0].staffId,
    channel: "email",
    notificationKind: "shiftConfirmation",
    displayTitle: "[SEED] 確定シフト（配信済み）",
    sendStatus: "sent",
    deliveryStatus: "delivered",
    requestedAt: now - 5 * 60 * 60 * 1000,
    sentAt: now - 4 * 60 * 60 * 1000,
    deliveredAt: now - 3 * 60 * 60 * 1000,
    deliveryStatusAt: now - 3 * 60 * 60 * 1000,
    updatedAt: now - 3 * 60 * 60 * 1000,
  });
  await writer.insert("notificationFailureInbox", {
    failureKey: "seed-business-resolved-failure",
    sourceType: "outbox",
    status: "resolved",
    shopId: firstShop.shopId,
    recruitmentId: confirmedRecruitmentId,
    staffId: firstShop.staffs[0].staffId,
    outboxId: sentOutboxId,
    channel: "email",
    dedupeKey: "seed-business-confirmation-sent",
    notificationContext: sentContext,
    firstFailedAt: now - 6 * 60 * 60 * 1000,
    lastFailedAt: now - 6 * 60 * 60 * 1000,
    resolvedAt: now - 3 * 60 * 60 * 1000,
    resolutionKind: "sent",
    createdAt: now - 6 * 60 * 60 * 1000,
    updatedAt: now - 3 * 60 * 60 * 1000,
  });
}

export async function seedDevelopmentScenarioGraph(
  ctx: MutationCtx,
  key: DevelopmentSeedScenarioKey,
  today: string,
): Promise<{ insertedCount: number }> {
  const scenario = getDevelopmentSeedScenario(key);
  const duplicate = (await ctx.db.query("organizations").take(DEVELOPMENT_SEED_SCENARIO_KEYS.length + 1)).find(
    (organization) => organization.name === scenario.organizationName,
  );
  if (duplicate) throw new Error("Development seed scenario already exists; clear all tables before retrying");

  const primaryUser = await requireSeedUser(ctx, PRIMARY_SEED_AUTH_TOKEN_IDENTIFIER);
  const ownerUser = await requireSeedUser(ctx, ownerAuthTokenIdentifier(key));
  const now = Date.now();
  const writer = new SeedWriter(ctx);
  const organizationId = await writer.insert("organizations", {
    createdByUserId: ownerUser._id,
    name: scenario.organizationName,
    billingEmail: seedEmail(`billing-${key}`),
    billingEmailNormalized: seedEmail(`billing-${key}`),
    billingEmailSyncKey: `seed-${key}`,
    isDeleted: false,
    createdAt: now,
    updatedAt: now,
  });

  const primaryMembership = await insertPersonAndMember(writer, organizationId, primaryUser, "active", now);
  let ownerMembership = primaryMembership;
  if (ownerUser._id !== primaryUser._id) {
    ownerMembership = await insertPersonAndMember(writer, organizationId, ownerUser, "active", now);
  }
  const managerPersonIds = [primaryMembership.personId, ownerMembership.personId].filter(
    (personId, index, values) => values.indexOf(personId) === index,
  );
  if (key === "standard-operations") {
    const readOnlyUser = await requireSeedUser(ctx, READ_ONLY_SEED_AUTH_TOKEN_IDENTIFIER);
    const readOnlyMembership = await insertPersonAndMember(writer, organizationId, readOnlyUser, "readOnly", now);
    managerPersonIds.push(readOnlyMembership.personId);
  }
  if (key === "policy-restricted") {
    for (const authTokenIdentifier of POLICY_RESTRICTED_EXTRA_MANAGER_AUTH_TOKEN_IDENTIFIERS) {
      const managerUser = await requireSeedUser(ctx, authTokenIdentifier);
      const managerMembership = await insertPersonAndMember(writer, organizationId, managerUser, "active", now);
      managerPersonIds.push(managerMembership.personId);
    }
  }

  const staffPeople =
    scenario.dataProfile === "billingOnly" ? [] : await insertStaffPeople(writer, scenario, organizationId, now);
  const shops = await insertShopGraph(writer, scenario, organizationId, staffPeople);
  const canonicalBillingState = scenario.billingState(now);
  await writer.insert("organizationBillingStates", {
    organizationId,
    state: canonicalBillingState,
    version: 1,
    createdAt: now,
    updatedAt: now,
  });

  let recruitmentIds: Id<"recruitments">[] = [];
  if (scenario.dataProfile !== "billingOnly") {
    recruitmentIds = await seedOperationalData(writer, scenario, shops, today, now);
    await seedRegistrationData(writer, scenario, shops[0].shopId, shops[0].staffs[0].email, now);
    await seedConsentData(ctx, writer, scenario, shops[0].shopId, primaryUser._id, now);
    await seedCustomStaffOrder(writer, scenario, organizationId, managerPersonIds, staffPeople, shops, today, now);
    if (scenario.key === "pro-notifications") {
      await seedLineAndNotificationData(
        writer,
        scenario,
        organizationId,
        shops[0],
        recruitmentIds[0],
        recruitmentIds[1],
        now,
      );
    }
  }
  return { insertedCount: writer.insertedCount };
}
