import { Box, Text } from "@chakra-ui/react";
import type { Meta, StoryObj } from "@storybook/react-vite";
import { useRef, useState } from "react";
import { expect, fireEvent, userEvent, waitFor, within } from "storybook/test";
import { createDeferred } from "@/src/devtools/createDeferred";
import { useSingleFlight } from "@/src/hooks/useSingleFlight";
import { AccountDeletionDialog } from "./AccountDeletionDialog";
import { AccountDeletionTrigger, type AccountDeletionVariant } from "./AccountDeletionTrigger";
import type { AccountDeletionErrorState, AccountDeletionReadyPreview } from "./types";

type PreviewProps = {
  variant: AccountDeletionVariant;
  initialOpen?: boolean;
  isRunning?: boolean;
  error?: AccountDeletionErrorState | null;
  preview?: AccountDeletionReadyPreview;
  isPreviewStale?: boolean;
  showTrigger?: boolean;
  countSubmissions?: boolean;
};

function AccountDeletionPreview({
  variant,
  initialOpen = false,
  isRunning = false,
  error = null,
  preview,
  isPreviewStale = false,
  showTrigger = true,
  countSubmissions = false,
}: PreviewProps) {
  const [isOpen, setIsOpen] = useState(initialOpen);
  const [submissionCount, setSubmissionCount] = useState(0);
  const pendingSubmission = useRef<ReturnType<typeof createDeferred> | null>(null);
  const { run, isRunning: isSubmitting } = useSingleFlight(async () => {
    if (!countSubmissions) return;

    setSubmissionCount((current) => current + 1);
    const submission = createDeferred();
    pendingSubmission.current = submission;
    await submission.promise;
    if (pendingSubmission.current === submission) pendingSubmission.current = null;
  });
  const effectiveRunning = isRunning || isSubmitting;
  const close = () => {
    if (!effectiveRunning) setIsOpen(false);
  };

  return (
    <Box bg="gray.50" minH="100vh" p={{ base: 4, md: 8 }}>
      {showTrigger ? <AccountDeletionTrigger variant={variant} onOpen={() => setIsOpen(true)} /> : null}
      {submissionCount > 0 ? <Text data-testid="submission-count">送信回数: {submissionCount}</Text> : null}
      {countSubmissions ? (
        <button
          type="button"
          hidden
          data-testid="release-account-deletion-submission"
          onClick={() => pendingSubmission.current?.resolve()}
        >
          削除処理を完了する
        </button>
      ) : null}
      <AccountDeletionDialog
        isOpen={isOpen}
        isRunning={effectiveRunning}
        isPreviewStale={isPreviewStale}
        preview={preview}
        error={error}
        onClose={close}
        onOpenChange={({ open }) => {
          if (open) setIsOpen(true);
          else close();
        }}
        onSubmit={() => {
          void run();
        }}
      />
    </Box>
  );
}

const meta = {
  title: "Features/AccountDeletion",
  component: AccountDeletionPreview,
  parameters: { layout: "fullscreen" },
  args: {
    variant: "setup",
  },
} satisfies Meta<typeof AccountDeletionPreview>;

export default meta;
type Story = StoryObj<typeof meta>;

export const SetupTrigger: Story = {};

export const SetupTriggerMobile: Story = {
  tags: ["vrt-mobile1"],
  globals: { viewport: { value: "mobile1", isRotated: false } },
};

export const LegacyTrigger: Story = {
  args: { variant: "legacy" },
};

export const DialogReady: Story = {
  args: { initialOpen: true, showTrigger: false },
};

export const DialogLeaveOrganization: Story = {
  args: {
    initialOpen: true,
    showTrigger: false,
    preview: {
      status: "ready",
      action: "leaveOrganization",
      previewFingerprint: "preview-leave",
      organization: { name: "サンプル運営会社", shopCount: 3 },
      futureAssignmentCount: 4,
    },
  },
};

export const DialogDeleteOrganization: Story = {
  args: {
    initialOpen: true,
    showTrigger: false,
    preview: {
      status: "ready",
      action: "deleteOrganization",
      previewFingerprint: "preview-delete",
      organization: { name: "サンプル運営会社", shopCount: 3 },
    },
  },
};

export const DialogPreviewStale: Story = {
  args: {
    ...DialogLeaveOrganization.args,
    isPreviewStale: true,
  },
};

export const DialogRunning: Story = {
  args: { initialOpen: true, isRunning: true, showTrigger: false },
};

export const DialogError: Story = {
  args: {
    initialOpen: true,
    showTrigger: false,
    error: {
      message: "所属情報が更新されたため、アカウントを削除できません。\n画面を更新して、最新の内容をご確認ください。",
      showContactLink: false,
    },
  },
};

export const DialogGeneralError: Story = {
  args: {
    initialOpen: true,
    showTrigger: false,
    error: {
      message: "アカウントの削除を受け付けられませんでした。\n時間をおいて、もう一度お試しください。",
      showContactLink: true,
    },
  },
};

export const GeneralErrorContactBehavior: Story = {
  args: DialogGeneralError.args,
  parameters: { screenshot: { skip: true } },
  play: async () => {
    const body = within(document.body);
    const dialog = await body.findByRole("alertdialog", { name: "アカウントを削除" });
    await expect(within(dialog).getByRole("link", { name: "お問い合わせへ" })).toHaveAttribute("href", "/contact");
  },
};

export const DialogMobile: Story = {
  args: DialogDeleteOrganization.args,
  tags: ["vrt-mobile1"],
  globals: { viewport: { value: "mobile1", isRotated: false } },
};

export const OpenAndCancelBehavior: Story = {
  parameters: { screenshot: { skip: true } },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const body = within(document.body);

    await userEvent.click(canvas.getByRole("button", { name: "アカウントを削除" }));
    const dialog = await body.findByRole("alertdialog", { name: "アカウントを削除" });
    await userEvent.click(within(dialog).getByRole("button", { name: "キャンセル" }));
    await waitFor(() => expect(body.queryByRole("alertdialog", { name: "アカウントを削除" })).not.toBeInTheDocument());
  },
};

export const DoubleSubmitBehavior: Story = {
  args: { initialOpen: true, showTrigger: false, countSubmissions: true },
  parameters: { screenshot: { skip: true } },
  play: async () => {
    const body = within(document.body);
    const dialog = await body.findByRole("alertdialog", { name: "アカウントを削除" });
    const submit = within(dialog).getByRole("button", { name: "アカウントを削除" });

    fireEvent.click(submit);
    fireEvent.click(submit);

    await expect(await body.findByTestId("submission-count")).toHaveTextContent("送信回数: 1");
    await expect(submit).toBeDisabled();

    fireEvent.click(body.getByTestId("release-account-deletion-submission"));
    await waitFor(() => expect(submit).toBeEnabled());
  },
};

export const RunningCloseLockBehavior: Story = {
  args: { initialOpen: true, isRunning: true, showTrigger: false },
  parameters: { screenshot: { skip: true } },
  play: async () => {
    const body = within(document.body);
    const dialog = await body.findByRole("alertdialog", { name: "アカウントを削除" });

    await expect(within(dialog).queryByRole("button", { name: "閉じる" })).not.toBeInTheDocument();
    await expect(within(dialog).getByRole("button", { name: "キャンセル" })).toBeDisabled();
    await expect(within(dialog).getByRole("button", { name: "アカウントを削除" })).toBeDisabled();
    await expect(body.getByRole("alertdialog", { name: "アカウントを削除" })).toBeInTheDocument();
  },
};
