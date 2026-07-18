import { convexTest } from "convex-test";
import { describe, expect, it } from "vitest";
import { api } from "../_generated/api";
import type { Id } from "../_generated/dataModel";
import { seedOrganizationManagerShop, seedUser } from "../_test/seed";
import { modules, schema } from "../_test/setup.test-helper";

describe("organization/queries.getSettings", () => {
  it("事業者設定を画面用DTOへ投影し、tokenや内部状態を返さない", async () => {
    const t = convexTest(schema, modules);
    const ids = await t.run(async (ctx) => {
      const base = await seedOrganizationManagerShop(ctx, {
        subject: "settings_actor",
        shopName: "設定対象店",
        plan: "pro",
      });
      const now = Date.now();
      await ctx.db.insert("organizationInvitations", {
        organizationId: base.organizationId,
        email: "invitee@example.com",
        emailNormalized: "invitee@example.com",
        tokenDigest: "never-return-this-digest",
        status: "pending",
        inviterMemberId: base.memberId,
        reservedSeat: true,
        version: 1,
        expiresAt: now + 86_400_000,
        createdAt: now,
        updatedAt: now,
      });
      return base;
    });

    const result = await t
      .withIdentity({ subject: "settings_actor" })
      .query(api.organization.queries.getSettings, { shopId: ids.shopId });

    expect(result).not.toBeNull();
    expect(Object.keys(result ?? {}).sort()).toEqual([
      "billing",
      "canAddShop",
      "canInviteManager",
      "canUpdateOrganizationName",
      "freeManagerExchangeCandidates",
      "managerInvitationMode",
      "managerInvitations",
      "organizationName",
      "people",
      "shops",
    ]);
    expect(result).toMatchObject({
      organizationName: "設定対象店事業者",
      canAddShop: true,
      canInviteManager: true,
      managerInvitationMode: "addition",
      freeManagerExchangeCandidates: [],
      managerInvitations: [
        {
          id: expect.any(String),
          email: "invitee@example.com",
          status: "pending",
          canResend: true,
          canRevoke: true,
        },
      ],
      canUpdateOrganizationName: true,
      billing: {
        state: "pro",
        currentPlan: "pro",
        isComplimentary: false,
        peopleUsage: { current: 1, max: 15 },
        shopUsage: { current: 1, max: 5 },
      },
      people: [
        {
          id: ids.personId,
          managerRole: "active",
          isStaff: false,
          isLineConnected: false,
          shopNames: [],
          canRemoveManagerRole: false,
        },
      ],
      shops: [
        {
          id: ids.shopId,
          staffCount: expect.any(Number),
          canDelete: false,
        },
      ],
    });
    expect(JSON.stringify(result)).not.toContain("never-return-this-digest");
    expect(result).not.toHaveProperty("freeSelection");
    expect(result).not.toHaveProperty("currentShopName");
  });

  it("削除済みstaff履歴で利用人数に含む店舗未所属ユーザーを一覧へ残す", async () => {
    const t = convexTest(schema, modules);
    const ids = await t.run(async (ctx) => {
      const base = await seedOrganizationManagerShop(ctx, {
        subject: "settings_unassigned_staff",
        shopName: "所属確認店",
        plan: "business",
      });
      const now = Date.now();
      const unassignedPersonId = await ctx.db.insert("organizationPeople", {
        organizationId: base.organizationId,
        name: "店舗未所属スタッフ",
        email: "unassigned-staff@example.com",
        emailNormalized: "unassigned-staff@example.com",
        status: "active",
        createdAt: now,
        updatedAt: now,
      });
      await ctx.db.insert("staffs", {
        shopId: base.shopId,
        organizationId: base.organizationId,
        organizationPersonId: unassignedPersonId,
        name: "店舗未所属スタッフ",
        email: "unassigned-staff@example.com",
        emailNormalized: "unassigned-staff@example.com",
        isDeleted: true,
      });
      await ctx.db.insert("organizationPeople", {
        organizationId: base.organizationId,
        name: "利用人数対象外",
        email: "uncounted-person@example.com",
        emailNormalized: "uncounted-person@example.com",
        status: "active",
        createdAt: now,
        updatedAt: now,
      });
      return { ...base, unassignedPersonId };
    });

    const result = await t
      .withIdentity({ subject: "settings_unassigned_staff" })
      .query(api.organization.queries.getSettings, { shopId: ids.shopId });

    expect(result?.billing.peopleUsage).toEqual({ current: 2, max: 30 });
    expect(
      result?.people.map(({ id, isStaff, managerRole, shopNames }) => ({ id, isStaff, managerRole, shopNames })),
    ).toEqual([
      { id: ids.personId, isStaff: false, managerRole: "active", shopNames: [] },
      { id: ids.unassignedPersonId, isStaff: false, managerRole: "none", shopNames: [] },
    ]);
  });

  it("同じ人物のいずれかの有効スタッフがLINEフォロー中なら連携済みだけを返す", async () => {
    const t = convexTest(schema, modules);
    const ids = await t.run(async (ctx) => {
      const base = await seedOrganizationManagerShop(ctx, {
        subject: "settings_line_connected",
        shopName: "LINE設定店",
        plan: "pro",
      });
      const now = Date.now();
      const personId = await ctx.db.insert("organizationPeople", {
        organizationId: base.organizationId,
        name: "LINEスタッフ",
        email: "line-staff@example.com",
        emailNormalized: "line-staff@example.com",
        status: "active",
        createdAt: now,
        updatedAt: now,
      });
      const staffId = await ctx.db.insert("staffs", {
        shopId: base.shopId,
        organizationId: base.organizationId,
        organizationPersonId: personId,
        name: "LINEスタッフ",
        email: "line-staff@example.com",
        emailNormalized: "line-staff@example.com",
        isDeleted: false,
      });
      const lineAccountId = await ctx.db.insert("staffLineAccounts", {
        staffId,
        shopId: base.shopId,
        lineUserId: "line-user-settings",
        linkedAt: now,
        following: true,
        isDeleted: false,
      });
      return { ...base, lineAccountId, personId };
    });

    const result = await t
      .withIdentity({ subject: "settings_line_connected" })
      .query(api.organization.queries.getSettings, { shopId: ids.shopId });

    const person = result?.people.find((candidate) => candidate.id === ids.personId);
    expect(person).toMatchObject({ isStaff: true, isLineConnected: true });
    expect(person).not.toHaveProperty("lineUserId");

    await t.run(async (ctx) => await ctx.db.patch(ids.lineAccountId, { following: false }));
    const unfollowedResult = await t
      .withIdentity({ subject: "settings_line_connected" })
      .query(api.organization.queries.getSettings, { shopId: ids.shopId });
    expect(unfollowedResult?.people.find((candidate) => candidate.id === ids.personId)).toMatchObject({
      isLineConnected: false,
    });
  });

  it("既存人物には期限内のissued招待がある時だけ再送可能状態を返す", async () => {
    const t = convexTest(schema, modules);
    const ids = await t.run(async (ctx) => {
      const base = await seedOrganizationManagerShop(ctx, {
        subject: "settings_manager_invitation",
        plan: "pro",
      });
      const now = Date.now();
      const personId = await ctx.db.insert("organizationPeople", {
        organizationId: base.organizationId,
        name: "招待中の人物",
        email: "invited-person@example.com",
        emailNormalized: "invited-person@example.com",
        status: "active",
        createdAt: now,
        updatedAt: now,
      });
      await ctx.db.insert("staffs", {
        shopId: base.shopId,
        organizationId: base.organizationId,
        organizationPersonId: personId,
        name: "招待中の人物",
        email: "invited-person@example.com",
        emailNormalized: "invited-person@example.com",
        isDeleted: false,
      });
      const invitationId = await ctx.db.insert("organizationInvitations", {
        organizationId: base.organizationId,
        email: "invited-person@example.com",
        emailNormalized: "invited-person@example.com",
        invitedName: "招待中の人物",
        tokenDigest: "issued-invitation-digest",
        status: "issued",
        purpose: "managerAddition",
        targetPersonId: personId,
        inviterMemberId: base.memberId,
        reservedSeat: true,
        version: 1,
        expiresAt: now + 86_400_000,
        createdAt: now,
        updatedAt: now,
      });
      return { ...base, invitationId, personId };
    });

    const result = await t
      .withIdentity({ subject: "settings_manager_invitation" })
      .query(api.organization.queries.getSettings, { shopId: ids.shopId });
    expect(result?.people.find((person) => person.id === ids.personId)).toMatchObject({
      managerRole: "none",
      isStaff: true,
      hasManagerInvitation: true,
    });

    await t.run(async (ctx) => {
      await ctx.db.patch(ids.invitationId, { status: "expired", expiredAt: Date.now(), reservedSeat: false });
    });
    const expiredResult = await t
      .withIdentity({ subject: "settings_manager_invitation" })
      .query(api.organization.queries.getSettings, { shopId: ids.shopId });
    expect(expiredResult?.people.find((person) => person.id === ids.personId)).toMatchObject({
      managerRole: "none",
      isStaff: true,
      hasManagerInvitation: false,
    });
  });

  it("店舗所属も管理者権限もないlegacy招待人物は一覧から隠し、再送情報は保持する", async () => {
    const t = convexTest(schema, modules);
    const ids = await t.run(async (ctx) => {
      const base = await seedOrganizationManagerShop(ctx, {
        subject: "settings_legacy_orphan_invitation",
        plan: "pro",
      });
      const now = Date.now();
      const personId = await ctx.db.insert("organizationPeople", {
        organizationId: base.organizationId,
        name: "旧招待人物",
        email: "legacy-invitee@example.com",
        emailNormalized: "legacy-invitee@example.com",
        status: "active",
        createdAt: now,
        updatedAt: now,
      });
      const invitationId = await ctx.db.insert("organizationInvitations", {
        organizationId: base.organizationId,
        email: "legacy-invitee@example.com",
        emailNormalized: "legacy-invitee@example.com",
        invitedName: "旧招待人物",
        tokenDigest: "legacy-issued-invitation-digest",
        status: "issued",
        purpose: "managerAddition",
        targetPersonId: personId,
        inviterMemberId: base.memberId,
        reservedSeat: true,
        version: 1,
        expiresAt: now + 86_400_000,
        createdAt: now,
        updatedAt: now,
      });
      return { ...base, invitationId, personId };
    });

    const result = await t
      .withIdentity({ subject: "settings_legacy_orphan_invitation" })
      .query(api.organization.queries.getSettings, { shopId: ids.shopId });

    expect(result?.people.find((person) => person.id === ids.personId)).toBeUndefined();
    expect(result?.managerInvitations.find((invitation) => invitation.id === ids.invitationId)).toMatchObject({
      status: "pending",
      canResend: true,
      canRevoke: true,
    });
  });

  it("無償BusinessをBusiness権限と料金なしの最小DTOへ投影する", async () => {
    const t = convexTest(schema, modules);
    const ids = await t.run(async (ctx) => {
      const seeded = await seedOrganizationManagerShop(ctx, {
        subject: "settings_complimentary_business",
        shopName: "無償Business店舗",
        complimentary: true,
      });
      await ctx.db.patch(seeded.organizationId, {
        migrationSourceShopId: seeded.shopId,
        updatedAt: Date.now(),
      });
      return seeded;
    });

    const result = await t
      .withIdentity({ subject: "settings_complimentary_business" })
      .query(api.organization.queries.getSettings, { shopId: ids.shopId });

    expect(result).toMatchObject({
      canAddShop: true,
      billing: {
        state: "business",
        currentPlan: "business",
        isComplimentary: true,
        peopleUsage: { current: 1, max: 30 },
        shopUsage: { current: 1, max: 5 },
        canManagePlan: false,
        canUpdatePaymentMethod: false,
        canUpdateBillingEmail: false,
        canScheduleFree: false,
      },
    });
    expect(result?.billing).not.toHaveProperty("nextEvent");
    expect(result?.billing.managePlanDisabledReason).toBeUndefined();
    expect(result?.billing.paymentMethodDisabledReason).toBeUndefined();
    expect(result?.billing.billingEmailDisabledReason).toBeUndefined();
    expect(result?.billing).not.toHaveProperty("migrationSourceShopId");
    expect(result?.billing).not.toHaveProperty("kind");
  });

  it("複数管理者のスタッフ兼任者には管理者権限だけを外すcapabilityを返す", async () => {
    const t = convexTest(schema, modules);
    const ids = await t.run(async (ctx) => {
      const base = await seedOrganizationManagerShop(ctx, {
        subject: "settings_role_removal_actor",
        shopName: "権限設定店",
        plan: "pro",
      });
      const now = Date.now();
      const secondUserId = await seedUser(ctx, "settings_role_removal_target", "target@example.com");
      const secondPersonId = await ctx.db.insert("organizationPeople", {
        organizationId: base.organizationId,
        userId: secondUserId,
        name: "スタッフ兼管理者",
        email: "target@example.com",
        emailNormalized: "target@example.com",
        status: "active",
        createdAt: now,
        updatedAt: now,
      });
      await ctx.db.insert("organizationMembers", {
        organizationId: base.organizationId,
        personId: secondPersonId,
        userId: secondUserId,
        status: "active",
        createdAt: now,
        updatedAt: now,
      });
      await ctx.db.insert("staffs", {
        shopId: base.shopId,
        organizationId: base.organizationId,
        organizationPersonId: secondPersonId,
        name: "スタッフ兼管理者",
        email: "target@example.com",
        emailNormalized: "target@example.com",
        isDeleted: false,
      });
      return { ...base, secondPersonId };
    });

    const result = await t
      .withIdentity({ subject: "settings_role_removal_actor" })
      .query(api.organization.queries.getSettings, { shopId: ids.shopId });

    expect(result?.people.find((person) => person.id === ids.secondPersonId)).toMatchObject({
      managerRole: "active",
      isStaff: true,
      canRemoveManagerRole: true,
    });
    expect(result?.people.find((person) => person.id === ids.personId)).toMatchObject({
      canRemoveManagerRole: false,
      managerRoleRemovalDisabledReason: "請求先メールアドレスを変更してから管理者権限を外してください。",
    });
  });

  it("操作元店舗の状態に依存せずグループ全体のDTOを返す", async () => {
    const t = convexTest(schema, modules);
    const ids = await t.run(async (ctx) => {
      const base = await seedOrganizationManagerShop(ctx, {
        subject: "settings_archived_staff",
        shopName: "アーカイブ店",
        plan: "pro",
      });
      await ctx.db.insert("staffs", {
        shopId: base.shopId,
        organizationId: base.organizationId,
        organizationPersonId: base.personId,
        userId: base.userId,
        name: "管理者",
        email: "settings_archived_staff@example.com",
        emailNormalized: "settings_archived_staff@example.com",
        isDeleted: false,
      });
      await ctx.db.patch(base.shopId, { operatingStatus: "archived" });
      return base;
    });

    const result = await t
      .withIdentity({ subject: "settings_archived_staff" })
      .query(api.organization.queries.getSettings, { shopId: ids.shopId });

    expect(result).not.toHaveProperty("currentShopName");
    expect(result?.people.find((person) => person.id === ids.personId)).toMatchObject({
      isStaff: true,
      shopNames: ["アーカイブ店"],
    });
    expect(result?.people.find((person) => person.id === ids.personId)).not.toHaveProperty("currentShopStaffId");
  });

  it("readOnly管理者は事業者全体を閲覧できるが、操作capabilityを受け取らない", async () => {
    const t = convexTest(schema, modules);
    const ids = await t.run(async (ctx) => {
      const base = await seedOrganizationManagerShop(ctx, {
        subject: "settings_readonly",
        shopName: "閲覧店舗",
        plan: "pro",
      });
      await ctx.db.patch(base.memberId, { status: "readOnly" });
      await ctx.db.insert("shops", {
        organizationId: base.organizationId,
        operatingStatus: "archived",
        name: "履歴店舗",
        submissionPattern: { kind: "time", startTime: "09:00", endTime: "22:00" },
        regularClosedDays: [],
        isDeleted: false,
      });
      return base;
    });

    const result = await t
      .withIdentity({ subject: "settings_readonly" })
      .query(api.organization.queries.getSettings, { shopId: ids.shopId });

    expect(result?.shops).toHaveLength(2);
    expect(result?.canAddShop).toBe(false);
    expect(result?.billing).toMatchObject({
      canManagePlan: false,
      managePlanDisabledReason: "閲覧のみの管理者はこの操作を行えません。",
      canUpdatePaymentMethod: false,
      paymentMethodDisabledReason: "閲覧のみの管理者はこの操作を行えません。",
      canUpdateBillingEmail: false,
      billingEmailDisabledReason: "閲覧のみの管理者はこの操作を行えません。",
      canScheduleFree: false,
    });
    expect(result?.people.every((person) => !person.canRemove)).toBe(true);
    expect(result?.shops.every((shop) => !shop.canDelete)).toBe(true);
  });

  it("readOnly管理者には期限切れ・送信失敗・競合招待で実行不能な操作を案内しない", async () => {
    const t = convexTest(schema, modules);
    const ids = await t.run(async (ctx) => {
      const base = await seedOrganizationManagerShop(ctx, {
        subject: "settings_readonly_invitation",
        plan: "pro",
      });
      const now = Date.now();
      const inviterUserId = await seedUser(ctx, "settings_active_inviter", "active-inviter@example.com");
      const inviterPersonId = await ctx.db.insert("organizationPeople", {
        organizationId: base.organizationId,
        userId: inviterUserId,
        name: "招待元管理者",
        email: "active-inviter@example.com",
        emailNormalized: "active-inviter@example.com",
        status: "active",
        createdAt: now,
        updatedAt: now,
      });
      const inviterMemberId = await ctx.db.insert("organizationMembers", {
        organizationId: base.organizationId,
        personId: inviterPersonId,
        userId: inviterUserId,
        status: "active",
        createdAt: now,
        updatedAt: now,
      });
      const expiredInvitationId = await ctx.db.insert("organizationInvitations", {
        organizationId: base.organizationId,
        email: "expired-invitee@example.com",
        emailNormalized: "expired-invitee@example.com",
        tokenDigest: "settings-readonly-expired-digest",
        status: "expired",
        purpose: "managerAddition",
        inviterMemberId,
        reservedSeat: false,
        version: 1,
        expiresAt: now - 1,
        expiredAt: now,
        createdAt: now - 1_000,
        updatedAt: now,
      });
      const sendFailedInvitationId = await ctx.db.insert("organizationInvitations", {
        organizationId: base.organizationId,
        email: "send-failed-invitee@example.com",
        emailNormalized: "send-failed-invitee@example.com",
        tokenDigest: "settings-readonly-send-failed-digest",
        status: "pending",
        purpose: "managerAddition",
        inviterMemberId,
        reservedSeat: false,
        version: 1,
        expiresAt: now + 86_400_000,
        createdAt: now,
        updatedAt: now,
      });
      await ctx.db.insert("notificationOutbox", {
        channel: "email",
        status: "failed",
        dedupeKey: "organization-manager-invitation:readonly-send-failed:1",
        organizationId: base.organizationId,
        organizationInvitationId: sendFailedInvitationId,
        organizationInvitationVersion: 1,
        purpose: "business",
        payload: {
          kind: "organizationManagerInvitationEmail",
          from: "シフトリ <noreply@example.com>",
          to: "send-failed-invitee@example.com",
          context: "organizationInvitation.managerInvite",
        },
        attemptCount: 1,
        nextRunAt: now,
        lastError: "test failure",
        failedAt: now,
        createdAt: now,
        updatedAt: now,
      });
      await ctx.db.insert("organizationPeople", {
        organizationId: base.organizationId,
        name: "削除済み競合対象",
        email: "conflict-invitee@example.com",
        emailNormalized: "conflict-invitee@example.com",
        status: "removed",
        createdAt: now,
        updatedAt: now,
      });
      const conflictInvitationId = await ctx.db.insert("organizationInvitations", {
        organizationId: base.organizationId,
        email: "conflict-invitee@example.com",
        emailNormalized: "conflict-invitee@example.com",
        tokenDigest: "settings-readonly-conflict-digest",
        status: "pending",
        purpose: "managerAddition",
        inviterMemberId,
        reservedSeat: false,
        version: 1,
        expiresAt: now + 86_400_000,
        createdAt: now,
        updatedAt: now,
      });
      await ctx.db.patch(base.memberId, { status: "readOnly", updatedAt: now });
      return { ...base, expiredInvitationId, sendFailedInvitationId, conflictInvitationId };
    });

    const result = await t
      .withIdentity({ subject: "settings_readonly_invitation" })
      .query(api.organization.queries.getSettings, { shopId: ids.shopId });

    expect(result?.managerInvitations.find((invitation) => invitation.id === ids.expiredInvitationId)).toMatchObject({
      status: "expired",
      statusDetail: "この招待は再送できません。権限、利用者、契約状態を確認してください。",
      canResend: false,
      canRevoke: false,
    });
    expect(result?.managerInvitations.find((invitation) => invitation.id === ids.sendFailedInvitationId)).toMatchObject(
      {
        status: "sendFailed",
        statusDetail: "この招待は再送できません。権限、利用者、契約状態を確認してください。",
        canResend: false,
        canRevoke: false,
      },
    );
    expect(result?.managerInvitations.find((invitation) => invitation.id === ids.conflictInvitationId)).toMatchObject({
      status: "conflict",
      statusDetail: "招待後に利用者または契約の状態が変わりました。権限、利用者、契約状態を確認してください。",
      canResend: false,
      canRevoke: false,
    });
  });

  it("対象未固定の招待と同じメールのremoved人物がいる場合はconflictとして再送を止める", async () => {
    const t = convexTest(schema, modules);
    const ids = await t.run(async (ctx) => {
      const base = await seedOrganizationManagerShop(ctx, {
        subject: "settings_removed_invitee",
        plan: "pro",
      });
      const now = Date.now();
      await ctx.db.insert("organizationPeople", {
        organizationId: base.organizationId,
        name: "削除済み招待対象",
        email: "removed-invitee@example.com",
        emailNormalized: "removed-invitee@example.com",
        status: "removed",
        createdAt: now,
        updatedAt: now,
      });
      const invitationId = await ctx.db.insert("organizationInvitations", {
        organizationId: base.organizationId,
        email: "removed-invitee@example.com",
        emailNormalized: "removed-invitee@example.com",
        tokenDigest: "settings-removed-invitee-digest",
        status: "pending",
        purpose: "managerAddition",
        inviterMemberId: base.memberId,
        reservedSeat: false,
        version: 1,
        expiresAt: now + 86_400_000,
        createdAt: now,
        updatedAt: now,
      });
      return { ...base, invitationId };
    });

    const result = await t
      .withIdentity({ subject: "settings_removed_invitee" })
      .query(api.organization.queries.getSettings, { shopId: ids.shopId });

    expect(result?.managerInvitations.find((invitation) => invitation.id === ids.invitationId)).toMatchObject({
      status: "conflict",
      canResend: false,
      canRevoke: true,
    });
  });

  it("対象未固定の招待と同じメールの人物が全statusで重複する場合はconflictとして再送を止める", async () => {
    const t = convexTest(schema, modules);
    const ids = await t.run(async (ctx) => {
      const base = await seedOrganizationManagerShop(ctx, {
        subject: "settings_duplicate_invitee",
        plan: "pro",
      });
      const now = Date.now();
      await ctx.db.insert("organizationPeople", {
        organizationId: base.organizationId,
        name: "有効な招待対象",
        email: "duplicate-invitee@example.com",
        emailNormalized: "duplicate-invitee@example.com",
        status: "active",
        createdAt: now,
        updatedAt: now,
      });
      await ctx.db.insert("organizationPeople", {
        organizationId: base.organizationId,
        name: "削除済みの同一メール人物",
        email: "duplicate-invitee@example.com",
        emailNormalized: "duplicate-invitee@example.com",
        status: "removed",
        createdAt: now,
        updatedAt: now,
      });
      const invitationId = await ctx.db.insert("organizationInvitations", {
        organizationId: base.organizationId,
        email: "duplicate-invitee@example.com",
        emailNormalized: "duplicate-invitee@example.com",
        tokenDigest: "settings-duplicate-invitee-digest",
        status: "pending",
        purpose: "managerAddition",
        inviterMemberId: base.memberId,
        reservedSeat: false,
        version: 1,
        expiresAt: now + 86_400_000,
        createdAt: now,
        updatedAt: now,
      });
      return { ...base, invitationId };
    });

    const result = await t
      .withIdentity({ subject: "settings_duplicate_invitee" })
      .query(api.organization.queries.getSettings, { shopId: ids.shopId });

    expect(result?.managerInvitations.find((invitation) => invitation.id === ids.invitationId)).toMatchObject({
      status: "conflict",
      canResend: false,
      canRevoke: true,
    });
  });

  it("契約情報が未移行の事業者はmigrationPendingとして全操作を停止する", async () => {
    const t = convexTest(schema, modules);
    const ids = await t.run(async (ctx) => {
      const base = await seedOrganizationManagerShop(ctx, {
        subject: "settings_migration_pending",
        shopName: "移行待ち店舗",
        plan: "pro",
      });
      const billingState = await ctx.db
        .query("organizationBillingStates")
        .withIndex("by_organizationId", (q) => q.eq("organizationId", base.organizationId))
        .unique();
      if (!billingState) throw new Error("billing state not found");
      await ctx.db.delete(billingState._id);
      return base;
    });

    const result = await t
      .withIdentity({ subject: "settings_migration_pending" })
      .query(api.organization.queries.getSettings, { shopId: ids.shopId });

    expect(result?.billing).toMatchObject({
      state: "migrationPending",
      currentPlan: null,
      isComplimentary: false,
      canManagePlan: false,
      managePlanDisabledReason: "設定の移行が完了するまでお待ちください。",
      canUpdatePaymentMethod: false,
      paymentMethodDisabledReason: "設定の移行が完了するまでお待ちください。",
      canUpdateBillingEmail: false,
      billingEmailDisabledReason: "設定の移行が完了するまでお待ちください。",
      canScheduleFree: false,
    });
    expect(result?.billing.blockedReason).toContain("移行");
    expect(result?.canAddShop).toBe(false);
    expect(result?.shops[0]).toMatchObject({ canDelete: false });
  });

  it("初回請求処理中はFree変更を案内しない", async () => {
    const t = convexTest(schema, modules);
    const ids = await t.run(async (ctx) => {
      const base = await seedOrganizationManagerShop(ctx, {
        subject: "settings_initial_payment_pending",
        shopName: "初回請求待ち店舗",
        plan: "pro",
      });
      const billingState = await ctx.db
        .query("organizationBillingStates")
        .withIndex("by_organizationId", (q) => q.eq("organizationId", base.organizationId))
        .unique();
      if (!billingState) throw new Error("billing state not found");
      await ctx.db.patch(billingState._id, {
        state: { kind: "initialPaymentPending", plan: "pro", startedAt: Date.now() },
        version: 2,
        updatedAt: Date.now(),
      });
      return base;
    });

    const result = await t
      .withIdentity({ subject: "settings_initial_payment_pending" })
      .query(api.organization.queries.getSettings, { shopId: ids.shopId });

    expect(result?.billing).toMatchObject({
      state: "initialPaymentPending",
      canManagePlan: false,
      managePlanDisabledReason: "初回支払いの結果を確認中のため、プランを変更できません。",
      canUpdatePaymentMethod: true,
      canUpdateBillingEmail: true,
      canScheduleFree: false,
    });
  });

  it("Freeからの支払い結果待ちはFree基本権利と操作別の停止理由を返す", async () => {
    const t = convexTest(schema, modules);
    const ids = await t.run(async (ctx) => {
      const base = await seedOrganizationManagerShop(ctx, {
        subject: "settings_pending_free",
        shopName: "Free支払い待ち店舗",
        plan: "free",
      });
      const billingState = await ctx.db
        .query("organizationBillingStates")
        .withIndex("by_organizationId", (q) => q.eq("organizationId", base.organizationId))
        .unique();
      if (!billingState) throw new Error("billing state not found");
      await ctx.db.patch(billingState._id, {
        state: { kind: "pendingActivation", plan: "pro", fallback: "free", startedAt: Date.now() },
        version: 2,
      });
      return base;
    });

    const result = await t
      .withIdentity({ subject: "settings_pending_free" })
      .query(api.organization.queries.getSettings, { shopId: ids.shopId });

    expect(result?.billing).toMatchObject({
      state: "pendingActivation",
      currentPlan: "free",
      targetPlan: "pro",
      canManagePlan: false,
      managePlanDisabledReason: "支払い結果を確認中のため、別のプラン変更はできません。",
      canUpdatePaymentMethod: false,
      paymentMethodDisabledReason: "支払い結果を確認中です。確定後に支払い方法を変更できます。",
      canUpdateBillingEmail: true,
    });
    expect(result?.billing.blockedReason).toContain("Freeの基本機能");
    expect(result?.billing.billingEmailDisabledReason).toBeUndefined();
    expect(result?.canUpdateOrganizationName).toBe(true);
  });

  it("契約制限中からの支払い結果待ちは復旧担当者の権限と制限理由を維持する", async () => {
    const t = convexTest(schema, modules);
    const ids = await t.run(async (ctx) => {
      const base = await seedOrganizationManagerShop(ctx, {
        subject: "settings_pending_restricted",
        shopName: "制限支払い待ち店舗",
        plan: "pro",
      });
      const billingState = await ctx.db
        .query("organizationBillingStates")
        .withIndex("by_organizationId", (q) => q.eq("organizationId", base.organizationId))
        .unique();
      if (!billingState) throw new Error("billing state not found");
      await ctx.db.patch(billingState._id, {
        state: {
          kind: "pendingActivation",
          plan: "business",
          fallback: "restricted",
          restrictedFallbackState: {
            kind: "restricted",
            reason: "paymentGraceExpired",
            previousPlan: "pro",
            recoveryManagerPersonIds: [base.personId],
            previousActiveShopIds: [base.shopId],
            restrictedAt: Date.now() - 1_000,
          },
          startedAt: Date.now(),
        },
        version: 2,
      });
      return base;
    });

    const result = await t
      .withIdentity({ subject: "settings_pending_restricted" })
      .query(api.organization.queries.getSettings, { shopId: ids.shopId });

    expect(result?.billing).toMatchObject({
      state: "pendingActivation",
      currentPlan: null,
      targetPlan: "business",
      canManagePlan: true,
      canUpdatePaymentMethod: true,
      canUpdateBillingEmail: true,
    });
    expect(result?.billing.blockedReason).toContain("支払い猶予");
    expect(result?.shops[0]).toMatchObject({ canDelete: false });
  });

  it("契約制限中は復旧担当者に店舗削除と復旧用契約操作だけを許可する", async () => {
    const t = convexTest(schema, modules);
    const ids = await t.run(async (ctx) => {
      const base = await seedOrganizationManagerShop(ctx, {
        subject: "settings_recovery",
        shopName: "復旧店舗",
        plan: "pro",
      });
      const suspendedShopId = await ctx.db.insert("shops", {
        organizationId: base.organizationId,
        operatingStatus: "planSuspended",
        name: "停止店舗",
        submissionPattern: { kind: "time", startTime: "09:00", endTime: "22:00" },
        regularClosedDays: [],
        isDeleted: false,
      });
      const billingState = await ctx.db
        .query("organizationBillingStates")
        .withIndex("by_organizationId", (q) => q.eq("organizationId", base.organizationId))
        .unique();
      if (!billingState) throw new Error("billing state not found");
      await ctx.db.patch(billingState._id, {
        state: {
          kind: "restricted",
          reason: "freeConditionsNotMet",
          previousPlan: "pro",
          recoveryManagerPersonIds: [base.personId],
          previousActiveShopIds: [base.shopId, suspendedShopId],
          restrictedAt: Date.now(),
        },
      });
      return { ...base, suspendedShopId };
    });

    const result = await t
      .withIdentity({ subject: "settings_recovery" })
      .query(api.organization.queries.getSettings, { shopId: ids.shopId });

    expect(result?.billing).toMatchObject({
      state: "restricted",
      previousPlan: "pro",
      peopleUsage: { current: 1, max: 4 },
      shopUsage: { current: 2, max: 1 },
      canManagePlan: true,
      canUpdatePaymentMethod: true,
      canUpdateBillingEmail: true,
    });
    expect(result?.canAddShop).toBe(false);
    expect(result?.shops.find((shop) => shop.id === ids.shopId)).toMatchObject({ canDelete: true });
    expect(result?.shops.find((shop) => shop.id === ids.suspendedShopId)).toMatchObject({ canDelete: true });
  });

  it("閲覧のみの復旧担当者には店舗削除capabilityを返さない", async () => {
    const t = convexTest(schema, modules);
    const ids = await t.run(async (ctx) => {
      const base = await seedOrganizationManagerShop(ctx, {
        subject: "settings_readonly_recovery",
        shopName: "閲覧復旧店舗",
        plan: "pro",
      });
      const secondShopId = await ctx.db.insert("shops", {
        organizationId: base.organizationId,
        operatingStatus: "active",
        name: "削除候補店舗",
        submissionPattern: { kind: "time", startTime: "09:00", endTime: "22:00" },
        regularClosedDays: [],
        isDeleted: false,
      });
      const billingState = await ctx.db
        .query("organizationBillingStates")
        .withIndex("by_organizationId", (q) => q.eq("organizationId", base.organizationId))
        .unique();
      if (!billingState) throw new Error("billing state not found");
      await ctx.db.patch(base.memberId, { status: "readOnly" });
      await ctx.db.patch(billingState._id, {
        state: {
          kind: "restricted",
          reason: "freeConditionsNotMet",
          previousPlan: "pro",
          recoveryManagerPersonIds: [base.personId],
          previousActiveShopIds: [base.shopId, secondShopId],
          restrictedAt: Date.now(),
        },
      });
      return base;
    });

    const result = await t
      .withIdentity({ subject: "settings_readonly_recovery" })
      .query(api.organization.queries.getSettings, { shopId: ids.shopId });

    expect(result?.shops).toHaveLength(2);
    expect(result?.shops.every((shop) => !shop.canDelete)).toBe(true);
    expect(
      result?.shops.every((shop) => shop.deleteDisabledReason === "閲覧のみの管理者は店舗を削除できません。"),
    ).toBe(true);
  });

  it("複数の復旧担当者がいる場合は最後の一人以外を整理できる", async () => {
    const t = convexTest(schema, modules);
    const ids = await t.run(async (ctx) => {
      const base = await seedOrganizationManagerShop(ctx, {
        subject: "settings_multiple_recovery",
        shopName: "複数復旧店",
        plan: "pro",
      });
      const now = Date.now();
      const secondUserId = await seedUser(ctx, "settings_second_recovery", "second-recovery@example.com");
      const secondPersonId = await ctx.db.insert("organizationPeople", {
        organizationId: base.organizationId,
        userId: secondUserId,
        name: "二人目の復旧担当者",
        email: "second-recovery@example.com",
        emailNormalized: "second-recovery@example.com",
        status: "active",
        createdAt: now,
        updatedAt: now,
      });
      await ctx.db.insert("organizationMembers", {
        organizationId: base.organizationId,
        personId: secondPersonId,
        userId: secondUserId,
        status: "active",
        createdAt: now,
        updatedAt: now,
      });
      const billingState = await ctx.db
        .query("organizationBillingStates")
        .withIndex("by_organizationId", (q) => q.eq("organizationId", base.organizationId))
        .unique();
      if (!billingState) throw new Error("billing state not found");
      await ctx.db.patch(billingState._id, {
        state: {
          kind: "restricted",
          reason: "paymentGraceExpired",
          previousPlan: "pro",
          recoveryManagerPersonIds: [base.personId, secondPersonId],
          previousActiveShopIds: [base.shopId],
          restrictedAt: now,
        },
      });
      return { ...base, secondPersonId };
    });

    const result = await t
      .withIdentity({ subject: "settings_multiple_recovery" })
      .query(api.organization.queries.getSettings, { shopId: ids.shopId });

    expect(result?.people.find((person) => person.id === ids.secondPersonId)).toMatchObject({
      canRemove: true,
    });
  });

  it("将来シフトがある人物は削除を止める", async () => {
    const t = convexTest(schema, modules);
    const ids = await t.run(async (ctx) => {
      const base = await seedOrganizationManagerShop(ctx, {
        subject: "settings_future_assignment",
        shopName: "将来割当店",
        plan: "pro",
      });
      const now = Date.now();
      const personId = await ctx.db.insert("organizationPeople", {
        organizationId: base.organizationId,
        name: "将来割当スタッフ",
        email: "future-assignment@example.com",
        emailNormalized: "future-assignment@example.com",
        status: "active",
        createdAt: now,
        updatedAt: now,
      });
      const staffId = await ctx.db.insert("staffs", {
        shopId: base.shopId,
        organizationId: base.organizationId,
        organizationPersonId: personId,
        name: "将来割当スタッフ",
        email: "future-assignment@example.com",
        emailNormalized: "future-assignment@example.com",
        isDeleted: false,
      });
      const recruitmentId = await ctx.db.insert("recruitments", {
        shopId: base.shopId,
        periodStart: "2099-01-01",
        periodEnd: "2099-01-15",
        deadline: "2098-12-25",
        shopClosedDates: [],
        status: "confirmed",
        confirmedAt: now,
        isDeleted: false,
        submissionPattern: { kind: "time", startTime: "09:00", endTime: "22:00" },
      });
      const positionId = await ctx.db.insert("positions", {
        shopId: base.shopId,
        name: "ホール",
        color: "#0f766e",
        sortOrder: 0,
        isDeleted: false,
      });
      await ctx.db.insert("shiftAssignments", {
        recruitmentId,
        staffId,
        date: "2099-01-03",
        startTime: "10:00",
        endTime: "18:00",
        positionId,
      });
      return { ...base, personId };
    });

    const result = await t
      .withIdentity({ subject: "settings_future_assignment" })
      .query(api.organization.queries.getSettings, { shopId: ids.shopId });

    expect(result?.people.find((person) => person.id === ids.personId)).toMatchObject({
      canRemove: false,
      removeDisabledReason: "将来のシフト割当を解除してから削除してください。",
    });
    expect(result?.people.find((person) => person.id === ids.personId)).not.toHaveProperty("futureAssignments");
  });

  it("招待が100件を超えてもpendingを全件返し、履歴だけを100件に制限する", async () => {
    const t = convexTest(schema, modules);
    const ids = await t.run(async (ctx) => {
      const base = await seedOrganizationManagerShop(ctx, {
        subject: "settings_invitation_history_limit",
        plan: "pro",
      });
      const now = Date.now();
      const pendingInvitationIds: Id<"organizationInvitations">[] = [];
      for (let index = 0; index < 101; index += 1) {
        pendingInvitationIds.push(
          await ctx.db.insert("organizationInvitations", {
            organizationId: base.organizationId,
            email: `pending-${index}@example.com`,
            emailNormalized: `pending-${index}@example.com`,
            tokenDigest: `pending-digest-${index}`,
            status: "pending",
            purpose: "managerAddition",
            inviterMemberId: base.memberId,
            reservedSeat: false,
            version: 1,
            expiresAt: now + 86_400_000,
            createdAt: now + index,
            updatedAt: now + index,
          }),
        );
      }
      for (let index = 0; index < 101; index += 1) {
        await ctx.db.insert("organizationInvitations", {
          organizationId: base.organizationId,
          email: `revoked-${index}@example.com`,
          emailNormalized: `revoked-${index}@example.com`,
          tokenDigest: `revoked-digest-${index}`,
          status: "revoked",
          purpose: "managerAddition",
          inviterMemberId: base.memberId,
          reservedSeat: false,
          version: 1,
          expiresAt: now - 1,
          revokedAt: now + index,
          createdAt: now + index,
          updatedAt: now + index,
        });
      }
      return { ...base, pendingInvitationIds };
    });

    const result = await t
      .withIdentity({ subject: "settings_invitation_history_limit" })
      .query(api.organization.queries.getSettings, { shopId: ids.shopId });

    expect(result?.managerInvitations).toHaveLength(201);
    const returnedInvitationIds = new Set(result?.managerInvitations.map((invitation) => invitation.id));
    for (const invitationId of ids.pendingInvitationIds) {
      expect(returnedInvitationIds.has(invitationId)).toBe(true);
      expect(result?.managerInvitations.find((invitation) => invitation.id === invitationId)).toMatchObject({
        canRevoke: true,
      });
    }
    const pendingInvitationIdSet = new Set<string>(ids.pendingInvitationIds);
    expect(result?.managerInvitations.filter((invitation) => !pendingInvitationIdSet.has(invitation.id))).toHaveLength(
      100,
    );
  }, 15_000);

  it("別事業者のshopIdでは設定内容を返さない", async () => {
    const t = convexTest(schema, modules);
    const otherShopId = await t.run(async (ctx) => {
      await seedOrganizationManagerShop(ctx, { subject: "settings_idor_actor", plan: "pro" });
      const other = await seedOrganizationManagerShop(ctx, { subject: "settings_idor_other", plan: "pro" });
      return other.shopId;
    });

    await expect(
      t
        .withIdentity({ subject: "settings_idor_actor" })
        .query(api.organization.queries.getSettings, { shopId: otherShopId }),
    ).resolves.toBeNull();
  });
});
