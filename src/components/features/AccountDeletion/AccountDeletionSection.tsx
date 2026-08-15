import { useQuery } from "convex/react";
import { Component, type ReactNode } from "react";
import { api } from "@/convex/_generated/api";
import { DeletionActionSection, DeletionActionSectionSkeleton } from "@/src/components/shared/DeletionActionSection";
import { todayJST } from "@/src/domains/shift/date";
import { AccountDeletionDialog } from "./AccountDeletionDialog";
import type { AccountDeletionBlockedPreview, AccountDeletionPreview, AccountDeletionReadyPreview } from "./types";
import { useAccountDeletionController } from "./useAccountDeletionController";

export function AccountDeletionSection() {
  return (
    <AccountDeletionPreviewErrorBoundary fallback={<AccountDeletionSectionError />}>
      <ConnectedAccountDeletionSection />
    </AccountDeletionPreviewErrorBoundary>
  );
}

function ConnectedAccountDeletionSection() {
  const preview = useQuery(api.accountDeletion.queries.getDeletionPreview, { asOfDate: todayJST() });
  const controller = useAccountDeletionController({ currentPreview: preview, requiresPreview: true });

  return (
    <>
      <AccountDeletionSectionView preview={preview} onOpen={controller.open} />
      <AccountDeletionDialog {...controller} />
    </>
  );
}

type ViewProps = {
  preview?: AccountDeletionPreview;
  onOpen: () => void;
};

export function AccountDeletionSectionView({ preview, onOpen }: ViewProps) {
  if (preview === undefined) {
    return <DeletionActionSectionSkeleton titleWidth="220px" descriptionLines={2} actionWidth="152px" />;
  }

  if (preview.status === "blocked") {
    const guidance = getBlockedGuidance(preview);
    return (
      <DeletionActionSection
        title="アカウントの利用を終了する"
        description="現在の所属と削除できる範囲を確認してから手続きを開始します。"
        actionLabel="削除内容を確認"
        canDelete={false}
        disabledReason={guidance.message}
        onDelete={onOpen}
      ></DeletionActionSection>
    );
  }

  return (
    <DeletionActionSection
      title="アカウントの利用を終了する"
      description={getReadyDescription(preview)}
      actionLabel="削除内容を確認"
      canDelete
      onDelete={onOpen}
    />
  );
}

function AccountDeletionSectionError() {
  return (
    <DeletionActionSection
      title="アカウントの利用を終了する"
      description="削除できる内容を読み込めませんでした。"
      actionLabel="削除内容を確認"
      canDelete={false}
      disabledReason="ページを再読み込みして、もう一度お試しください。"
      onDelete={() => undefined}
    />
  );
}

function getReadyDescription(preview: AccountDeletionReadyPreview): string {
  switch (preview.action) {
    case "accountOnly":
      return "ログインに使うアカウントを削除します。削除後は、このアカウントでシフトリを利用できません。";
    case "leaveOrganization":
      return `「${preview.organization.name}」から退出し、ログインアカウントを削除します。組織と店舗は、ほかの管理者が引き続き利用できます。`;
    case "deleteOrganization":
      return `「${preview.organization.name}」と全${preview.organization.shopCount}店舗の利用を終了し、ログインアカウントを削除します。`;
  }
}

function getBlockedGuidance(preview: AccountDeletionBlockedPreview): {
  message: string;
  showContactLink: boolean;
} {
  const { reason } = preview;

  switch (reason) {
    case "multipleOrganizations":
      return {
        message:
          "複数の組織に所属しているため、この画面からは削除できません。\n組織設定で組織を一つずつ削除するか、別の管理者へ引き継ぎ、組織の所属を1つ以下にしてください。",
        showContactLink: true,
      };
    case "billingContactTransferRequired":
      return {
        message: "請求連絡先を別の管理者へ変更してから、もう一度お試しください。",
        showContactLink: false,
      };
    case "recoveryManagerTransferRequired":
      return {
        message: "復旧担当者を別の管理者へ変更してから、もう一度お試しください。",
        showContactLink: false,
      };
    case "tooManyAssociatedRecords":
      return {
        message: "関連する履歴・アクセス情報が多いため、この画面からは削除できません。",
        showContactLink: true,
      };
    case "tooManyFutureAssignments":
      return {
        message: "将来のシフト割り当てが多いため、この画面からは削除できません。先に将来の割り当てを整理してください。",
        showContactLink: false,
      };
    case "deletionAlreadyRequested":
      return {
        message: "アカウントの削除はすでに受け付けています。完了までしばらくお待ちください。",
        showContactLink: false,
      };
    case "providerConfigurationUnavailable":
    case "unavailable":
      return {
        message: "現在、アカウントを削除できません。時間をおいて、もう一度お試しください。",
        showContactLink: true,
      };
    case "organizationDeletionUnavailable":
      return {
        message: "組織または店舗の終了手続きをこの画面から進められません。",
        showContactLink: true,
      };
    case "inconsistentAssociation":
      return {
        message: "所属情報を確認できないため、この画面からは削除できません。",
        showContactLink: true,
      };
    default: {
      const exhaustiveReason: never = reason;
      void exhaustiveReason;
      return {
        message: "所属情報を確認できないため、この画面からは削除できません。",
        showContactLink: true,
      };
    }
  }
}

type ErrorBoundaryProps = {
  children: ReactNode;
  fallback: ReactNode;
};

class AccountDeletionPreviewErrorBoundary extends Component<ErrorBoundaryProps, { hasError: boolean }> {
  state = { hasError: false };

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  render() {
    return this.state.hasError ? this.props.fallback : this.props.children;
  }
}
