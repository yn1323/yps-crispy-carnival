import type { Meta, StoryObj } from "@storybook/react-vite";
import { useRef, useState } from "react";
import { expect, fireEvent, userEvent, waitFor, within } from "storybook/test";
import { StaffLayout } from "@/src/components/templates/StaffLayout";
import { createDeferred } from "@/src/devtools/createDeferred";
import { useSingleFlight } from "@/src/hooks/useSingleFlight";
import type { StaffLegalConsentPageData } from "../types";
import { StaffLegalConsentView } from "./index";

const documents = {
  terms: {
    title: "スタッフ向け利用規約",
    documentVersion: "staff-terms-doc-2026-08-26",
    requiredConsentVersion: "staff-terms-consent-2026-05-09",
    path: "/terms/staff",
  },
  privacy: {
    title: "スタッフ向けプライバシーポリシー",
    documentVersion: "staff-privacy-doc-2026-08-26-2",
    requiredConsentVersion: "staff-privacy-consent-2026-08-26",
    path: "/privacy/staff",
  },
};

const okData: StaffLegalConsentPageData = {
  status: "ok",
  staffName: "田中 太郎",
  shopName: "居酒屋さくら",
  expiresAt: Date.now() + 30 * 24 * 60 * 60 * 1000,
  documents,
};

const meta = {
  title: "features/StaffLegalConsent/ConsentView",
  component: StaffLegalConsentView,
  parameters: {
    layout: "fullscreen",
  },
  decorators: [
    (Story) => (
      <StaffLayout shopName="居酒屋さくら">
        <Story />
      </StaffLayout>
    ),
  ],
} satisfies Meta<typeof StaffLegalConsentView>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  args: {
    data: okData,
    onAccept: async () => {},
  },
};

export const ConsentBehavior: Story = {
  parameters: { screenshot: { skip: true } },
  args: Default.args,
  render: () => <ConsentBehaviorStory />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const submit = canvas.getByRole("button", { name: "同意する" });

    await userEvent.click(submit);
    await expect(canvas.getByText("利用規約とプライバシーポリシーに同意してください")).toBeVisible();
    await expect(canvas.getByTestId("legal-consent-submit-count")).toHaveTextContent("0");

    await userEvent.click(canvas.getByRole("checkbox"));
    fireEvent.click(submit);
    fireEvent.click(submit);

    await expect(canvas.getByTestId("legal-consent-submit-count")).toHaveTextContent("1");
    await expect(submit).toBeDisabled();

    fireEvent.click(canvas.getByTestId("release-legal-consent-submission"));
    await waitFor(() => expect(submit).toBeEnabled());
  },
};

export const Accepted: Story = {
  args: {
    data: {
      status: "accepted",
      staffName: "田中 太郎",
      shopName: "居酒屋さくら",
      documents,
    },
  },
};

export const Expired: Story = {
  args: {
    data: {
      status: "expired",
      documents,
    },
  },
};

function ConsentBehaviorStory() {
  const [submitCount, setSubmitCount] = useState(0);
  const pendingSubmission = useRef<ReturnType<typeof createDeferred> | null>(null);
  const { run: handleAccept, isRunning: isSubmitting } = useSingleFlight(async () => {
    setSubmitCount((count) => count + 1);
    const submission = createDeferred();
    pendingSubmission.current = submission;
    await submission.promise;
    if (pendingSubmission.current === submission) pendingSubmission.current = null;
  });

  return (
    <>
      <StaffLegalConsentView data={okData} isSubmitting={isSubmitting} onAccept={handleAccept} />
      <output data-testid="legal-consent-submit-count" hidden>
        {submitCount}
      </output>
      <button
        data-testid="release-legal-consent-submission"
        type="button"
        hidden
        onClick={() => pendingSubmission.current?.resolve()}
      />
    </>
  );
}
