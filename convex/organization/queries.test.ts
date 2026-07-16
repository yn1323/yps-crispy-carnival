import { convexTest } from "convex-test";
import { describe, expect, it } from "vitest";
import { api, internal } from "../_generated/api";
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
      const invitationId = await ctx.db.insert("organizationInvitations", {
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
      return { ...base, invitationId };
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
      "currentShopName",
      "freeManagerExchangeCandidates",
      "freeSelection",
      "managerInvitationMode",
      "managerInvitations",
      "organizationName",
      "people",
      "shops",
    ]);
    expect(result).toMatchObject({
      organizationName: "設定対象店事業者",
      currentShopName: "設定対象店",
      canAddShop: true,
      canInviteManager: true,
      canUpdateOrganizationName: true,
      managerInvitationMode: "addition",
      freeManagerExchangeCandidates: [],
      billing: {
        state: "pro",
        currentPlan: "pro",
        peopleUsage: { current: 1, max: 15 },
        shopUsage: { current: 1, max: 5 },
      },
      people: [
        {
          id: ids.personId,
          managerRole: "active",
          canRemoveManagerRole: false,
          countsTowardPeopleLimit: true,
        },
      ],
      shops: [{ id: ids.shopId, status: "active", canArchive: true }],
      managerInvitations: [{ id: ids.invitationId, email: "invitee@example.com", status: "pending" }],
      freeSelection: {
        selectedManagerId: ids.personId,
        selectedShopId: ids.shopId,
        managerCandidates: [{ id: ids.personId, projectedPeopleCount: 1 }],
        shopCandidates: [{ id: ids.shopId, name: "設定対象店" }],
      },
    });
    expect(JSON.stringify(result)).not.toContain("never-return-this-digest");
    expect(Object.keys(result?.managerInvitations[0] ?? {}).sort()).toEqual([
      "canResend",
      "canRevoke",
      "email",
      "expiresAt",
      "id",
      "status",
    ]);
  });

  it("Outbox作成前に失敗した管理者招待を送信失敗として投影する", async () => {
    const t = convexTest(schema, modules);
    const ids = await t.run(async (ctx) => {
      const base = await seedOrganizationManagerShop(ctx, {
        subject: "settings_invitation_enqueue_failed",
        shopName: "招待失敗店",
        plan: "pro",
      });
      const now = Date.now();
      const invitationId = await ctx.db.insert("organizationInvitations", {
        organizationId: base.organizationId,
        email: "failed@example.com",
        emailNormalized: "failed@example.com",
        tokenDigest: "failed-invitation-digest",
        status: "pending",
        purpose: "managerAddition",
        inviterMemberId: base.memberId,
        reservedSeat: true,
        version: 1,
        expiresAt: now + 86_400_000,
        createdAt: now,
        updatedAt: now,
      });
      return { ...base, invitationId };
    });
    await t.mutation(internal.notificationOutbox.mutations.recordDeliveryEvent, {
      eventType: "enqueue_failed",
      organizationId: ids.organizationId,
      organizationInvitationId: ids.invitationId,
      organizationInvitationVersion: 1,
      channel: "email",
      dedupeKey: `email:organizationManagerInvitation:${ids.invitationId}:1`,
      notificationContext: "organizationInvitation.enqueueManagerInvitation",
      errorMessage: "enqueue failed",
    });

    const result = await t
      .withIdentity({ subject: "settings_invitation_enqueue_failed" })
      .query(api.organization.queries.getSettings, { shopId: ids.shopId });

    expect(result?.managerInvitations.find((invitation) => invitation.id === ids.invitationId)).toMatchObject({
      status: "sendFailed",
      statusDetail: "メールを送信できませんでした。アドレスを確認して再送してください。",
      canResend: true,
      canRevoke: true,
    });
    expect(await t.run(async (ctx) => await ctx.db.query("notificationOutbox").collect())).toHaveLength(0);

    await t.run(async (ctx) => {
      const now = Date.now();
      await ctx.db.insert("notificationOutbox", {
        channel: "email",
        status: "pending",
        dedupeKey: `email:organizationManagerInvitation:${ids.invitationId}:1`,
        organizationId: ids.organizationId,
        organizationInvitationId: ids.invitationId,
        organizationInvitationVersion: 1,
        purpose: "business",
        payload: {
          kind: "organizationManagerInvitationEmail",
          from: "シフトリ <noreply@example.com>",
          to: "failed@example.com",
          context: "organizationInvitation.enqueueManagerInvitation",
        },
        attemptCount: 0,
        nextRunAt: now,
        createdAt: now,
        updatedAt: now,
      });
    });

    const afterSuccessfulRetry = await t
      .withIdentity({ subject: "settings_invitation_enqueue_failed" })
      .query(api.organization.queries.getSettings, { shopId: ids.shopId });
    expect(
      afterSuccessfulRetry?.managerInvitations.find((invitation) => invitation.id === ids.invitationId),
    ).toMatchObject({
      status: "pending",
      canResend: true,
      canRevoke: true,
    });

    await t.run(async (ctx) => {
      await ctx.db.patch(ids.invitationId, { version: 2, updatedAt: Date.now() });
    });
    const afterVersionRotation = await t
      .withIdentity({ subject: "settings_invitation_enqueue_failed" })
      .query(api.organization.queries.getSettings, { shopId: ids.shopId });
    expect(
      afterVersionRotation?.managerInvitations.find((invitation) => invitation.id === ids.invitationId)?.status,
    ).toBe("pending");
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

  it("Freeでは既存スタッフだけを管理者交代候補にし、承認待ち中の重複招待を止める", async () => {
    const t = convexTest(schema, modules);
    const ids = await t.run(async (ctx) => {
      const base = await seedOrganizationManagerShop(ctx, {
        subject: "settings_free_exchange_actor",
        shopName: "Free交代店",
        plan: "free",
      });
      const now = Date.now();
      const targetPersonId = await ctx.db.insert("organizationPeople", {
        organizationId: base.organizationId,
        name: "交代候補スタッフ",
        email: "exchange@example.com",
        emailNormalized: "exchange@example.com",
        status: "active",
        createdAt: now,
        updatedAt: now,
      });
      await ctx.db.insert("staffs", {
        shopId: base.shopId,
        organizationId: base.organizationId,
        organizationPersonId: targetPersonId,
        name: "交代候補スタッフ",
        email: "exchange@example.com",
        emailNormalized: "exchange@example.com",
        isDeleted: false,
      });
      return { ...base, targetPersonId };
    });
    const asManager = t.withIdentity({ subject: "settings_free_exchange_actor" });

    const before = await asManager.query(api.organization.queries.getSettings, { shopId: ids.shopId });
    expect(before).toMatchObject({
      managerInvitationMode: "freeManagerExchange",
      canInviteManager: true,
      freeManagerExchangeCandidates: [
        { id: ids.targetPersonId, name: "交代候補スタッフ", email: "exchange@example.com" },
      ],
    });
    expect(before?.billing).toMatchObject({
      canManagePlan: true,
      canUpdatePaymentMethod: false,
      paymentMethodDisabledReason: "Freeでは支払い方法の登録はありません。有料プランを契約するときに登録します。",
      canUpdateBillingEmail: true,
    });

    const invitationId = await t.run(async (ctx) => {
      const now = Date.now();
      return await ctx.db.insert("organizationInvitations", {
        organizationId: ids.organizationId,
        email: "exchange@example.com",
        emailNormalized: "exchange@example.com",
        tokenDigest: "free-exchange-pending",
        status: "pending",
        purpose: "freeManagerExchange",
        inviterMemberId: ids.memberId,
        reservedSeat: false,
        version: 1,
        expiresAt: now + 86_400_000,
        createdAt: now,
        updatedAt: now,
      });
    });
    const pending = await asManager.query(api.organization.queries.getSettings, { shopId: ids.shopId });

    expect(pending?.canInviteManager).toBe(false);
    expect(pending?.inviteManagerDisabledReason).toContain("承認");
    expect(pending?.managerInvitations.find((invitation) => invitation.id === invitationId)).toMatchObject({
      status: "pending",
      canResend: true,
      canRevoke: true,
    });
  });

  it("期限切れの管理者追加招待は現在の契約と枠を満たす場合だけ再送可能とする", async () => {
    const t = convexTest(schema, modules);
    const ids = await t.run(async (ctx) => {
      const base = await seedOrganizationManagerShop(ctx, {
        subject: "settings_expired_resend",
        shopName: "期限切れ店",
        plan: "pro",
      });
      const now = Date.now();
      const invitationId = await ctx.db.insert("organizationInvitations", {
        organizationId: base.organizationId,
        email: "expired@example.com",
        emailNormalized: "expired@example.com",
        tokenDigest: "expired-resend",
        status: "expired",
        purpose: "managerAddition",
        inviterMemberId: base.memberId,
        reservedSeat: false,
        version: 2,
        expiresAt: now - 1,
        expiredAt: now - 1,
        createdAt: now - 86_400_000,
        updatedAt: now,
      });
      return { ...base, invitationId };
    });

    const result = await t
      .withIdentity({ subject: "settings_expired_resend" })
      .query(api.organization.queries.getSettings, { shopId: ids.shopId });

    expect(result?.managerInvitations.find((invitation) => invitation.id === ids.invitationId)).toMatchObject({
      status: "expired",
      canResend: true,
      canRevoke: false,
    });
  });

  it("承認前に上限または人物状態が変わった招待を画面上で区別する", async () => {
    const t = convexTest(schema, modules);
    const ids = await t.run(async (ctx) => {
      const base = await seedOrganizationManagerShop(ctx, {
        subject: "settings_invitation_drift",
        shopName: "招待状態店",
        plan: "pro",
      });
      const now = Date.now();
      for (let index = 0; index < 14; index += 1) {
        const email = `manager-${index}@example.com`;
        const userId = await seedUser(ctx, `settings_invitation_manager_${index}`, email);
        const personId = await ctx.db.insert("organizationPeople", {
          organizationId: base.organizationId,
          userId,
          name: `追加管理者${index}`,
          email,
          emailNormalized: email,
          status: "active",
          createdAt: now,
          updatedAt: now,
        });
        await ctx.db.insert("organizationMembers", {
          organizationId: base.organizationId,
          personId,
          userId,
          status: "active",
          createdAt: now,
          updatedAt: now,
        });
      }
      const limitInvitationId = await ctx.db.insert("organizationInvitations", {
        organizationId: base.organizationId,
        email: "waiting@example.com",
        emailNormalized: "waiting@example.com",
        tokenDigest: "limit-state-invitation",
        status: "pending",
        purpose: "managerAddition",
        inviterMemberId: base.memberId,
        reservedSeat: true,
        version: 1,
        expiresAt: now + 86_400_000,
        createdAt: now,
        updatedAt: now,
      });
      const conflictInvitationId = await ctx.db.insert("organizationInvitations", {
        organizationId: base.organizationId,
        email: "settings_invitation_drift@example.com",
        emailNormalized: "settings_invitation_drift@example.com",
        tokenDigest: "conflict-state-invitation",
        status: "pending",
        purpose: "managerAddition",
        inviterMemberId: base.memberId,
        reservedSeat: false,
        version: 1,
        expiresAt: now + 86_400_000,
        createdAt: now,
        updatedAt: now,
      });
      return { ...base, limitInvitationId, conflictInvitationId };
    });

    const result = await t
      .withIdentity({ subject: "settings_invitation_drift" })
      .query(api.organization.queries.getSettings, { shopId: ids.shopId });

    expect(result?.managerInvitations.find((invitation) => invitation.id === ids.limitInvitationId)).toMatchObject({
      status: "limitReached",
      canResend: false,
      canRevoke: true,
    });
    expect(result?.managerInvitations.find((invitation) => invitation.id === ids.conflictInvitationId)).toMatchObject({
      status: "conflict",
      canResend: false,
      canRevoke: true,
    });
  });

  it("アーカイブ済みの操作中店舗ではスタッフ所属の削除capabilityを返さない", async () => {
    const t = convexTest(schema, modules);
    const ids = await t.run(async (ctx) => {
      const base = await seedOrganizationManagerShop(ctx, {
        subject: "settings_archived_staff",
        shopName: "アーカイブ店",
        plan: "pro",
      });
      const staffId = await ctx.db.insert("staffs", {
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
      return { ...base, staffId };
    });

    const result = await t
      .withIdentity({ subject: "settings_archived_staff" })
      .query(api.organization.queries.getSettings, { shopId: ids.shopId });

    expect(result?.people.find((person) => person.id === ids.personId)).toMatchObject({
      currentShopStaffId: ids.staffId,
      canRemoveFromCurrentShop: false,
      removeFromCurrentShopDisabledReason: "アーカイブ済み店舗の所属は変更できません。再稼働してから操作してください。",
    });
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
    expect(result?.canInviteManager).toBe(false);
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
    expect(result?.shops.every((shop) => !shop.canArchive && !shop.canReactivate)).toBe(true);
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
    expect(result?.canInviteManager).toBe(false);
    expect(result?.shops[0]).toMatchObject({ canArchive: false, canReactivate: false });
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
    expect(result?.shops[0]).toMatchObject({ canArchive: true });
  });

  it("契約制限中は復旧担当者にアーカイブと復旧用契約操作だけを許可する", async () => {
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
      shopUsage: { current: 1, max: 1 },
      canManagePlan: true,
      canUpdatePaymentMethod: true,
      canUpdateBillingEmail: true,
    });
    expect(result?.canAddShop).toBe(false);
    expect(result?.canInviteManager).toBe(false);
    expect(result?.shops.find((shop) => shop.id === ids.shopId)).toMatchObject({ canArchive: true });
    expect(result?.shops.find((shop) => shop.id === ids.suspendedShopId)).toMatchObject({
      canReactivate: false,
    });
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

  it("将来シフトがある人物は削除を止め、影響する日時・店舗・募集期間を返す", async () => {
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
      futureAssignments: [
        {
          date: "2099-01-03",
          startTime: "10:00",
          endTime: "18:00",
          shopName: "将来割当店",
          periodStart: "2099-01-01",
          periodEnd: "2099-01-15",
        },
      ],
      hasMoreFutureAssignments: false,
    });
  });

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
