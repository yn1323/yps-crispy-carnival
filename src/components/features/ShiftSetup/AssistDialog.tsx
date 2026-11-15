import { chakra, Field, Stack, Text } from "@chakra-ui/react";
import { type FormEvent, useState } from "react";
import { SHIFT_SETUP_ASSIST_SITUATION_MAX_LENGTH } from "@/convex/constants";
import { Dialog } from "@/src/components/ui/Dialog";
import { Textarea } from "@/src/components/ui/FormControls";
import type { DialogState } from "./types";

const FORM_ID = "shift-setup-assist-form";

type Props = {
  dialog: DialogState & { isRunning: boolean; message?: string };
  /** すでに型がある場合は、下書きで置き換わることを伝える。 */
  hasTemplates: boolean;
  onRequest: (situation: string) => void;
};

export function AssistDialog({ dialog, hasTemplates, onRequest }: Props) {
  return (
    <Dialog
      title="AIで下書きを作る"
      isOpen={dialog.isOpen}
      onOpenChange={dialog.onOpenChange}
      onClose={dialog.close}
      formId={FORM_ID}
      submitLabel="下書きを作る"
      isLoading={dialog.isRunning}
      mobileFullScreen
      maxW={{ md: "560px" }}
      maxH={{ md: "85dvh" }}
      bodyProps={{ px: { base: 4, lg: 6 }, pt: 2, pb: { base: 4, lg: 5 } }}
    >
      <AssistForm
        key={dialog.isOpen ? "open" : "closed"}
        disabled={dialog.isRunning}
        message={dialog.message}
        hasTemplates={hasTemplates}
        onRequest={onRequest}
      />
    </Dialog>
  );
}

type FormProps = {
  disabled: boolean;
  message?: string;
  hasTemplates: boolean;
  onRequest: (situation: string) => void;
};

function AssistForm({ disabled, message, hasTemplates, onRequest }: FormProps) {
  const [situation, setSituation] = useState("");

  const handleSubmit = (event: FormEvent) => {
    event.preventDefault();
    onRequest(situation);
  };

  return (
    <chakra.form id={FORM_ID} noValidate onSubmit={handleSubmit}>
      <Stack gap={4}>
        <Text fontSize="sm" color="fg.muted" lineHeight="tall">
          店の状況を書くと、曜日ごとの必要人数の下書きを作ります。
          <br />
          下書きは表に入るだけで、保存するまで設定は変わりません。
        </Text>

        <Field.Root>
          <Field.Label>店の状況</Field.Label>
          <Textarea
            value={situation}
            maxLength={SHIFT_SETUP_ASSIST_SITUATION_MAX_LENGTH}
            rows={5}
            placeholder="平日は昼が混みます。金曜と土日は夜まで忙しく、キッチンに2人ほしいです。"
            bg="white"
            disabled={disabled}
            onChange={(event) => setSituation(event.target.value)}
          />
          <Text fontSize="xs" color="fg.muted" alignSelf="flex-end" fontVariantNumeric="tabular-nums">
            {situation.length}/{SHIFT_SETUP_ASSIST_SITUATION_MAX_LENGTH}文字
          </Text>
        </Field.Root>

        {message && (
          <Text
            role="alert"
            fontSize="sm"
            fontWeight="semibold"
            color="red.600"
            lineHeight="tall"
            whiteSpace="pre-line"
          >
            {message}
          </Text>
        )}

        {hasTemplates && (
          <Text fontSize="sm" color="orange.700" lineHeight="tall" bg="orange.50" borderRadius="md" px={3} py={2.5}>
            いまの型は下書きで置き換わります。
            <br />
            保存する前なら「元に戻す」で取り消せます。
          </Text>
        )}
      </Stack>
    </chakra.form>
  );
}
