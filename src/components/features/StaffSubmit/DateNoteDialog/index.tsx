import { Field, Flex, Text } from "@chakra-ui/react";
import { useState } from "react";
import { LuX } from "react-icons/lu";
import { SHIFT_DATE_NOTE_MAX_LENGTH } from "@/convex/constants";
import { IconButton } from "@/src/components/ui/Button";
import { Dialog } from "@/src/components/ui/Dialog";
import { Input } from "@/src/components/ui/FormControls";
import { formatDateWithWeekday } from "@/src/domains/shift/date";

const DATE_NOTE_FORM_ID = "date-note-form";

type Props = {
  date: string | null;
  note: string;
  onClose: () => void;
  onSave: (date: string, note: string) => void;
};

/** 日付メモの編集Dialog。フォームの状態だけを更新し、保存は提出ボタンで行う。 */
export function DateNoteDialog({ date, note, onClose, onSave }: Props) {
  if (!date) return null;
  // 開くたびに保存済みのメモから入力を始め、キャンセルした入力を次へ持ち越さない。
  return <DateNoteDialogContent key={date} date={date} initialNote={note} onClose={onClose} onSave={onSave} />;
}

function DateNoteDialogContent({
  date,
  initialNote,
  onClose,
  onSave,
}: {
  date: string;
  initialNote: string;
  onClose: () => void;
  onSave: (date: string, note: string) => void;
}) {
  const [note, setNote] = useState(initialNote);
  const dateLabel = formatDateWithWeekday(date);

  return (
    <Dialog
      title={`${dateLabel}のメモ`}
      isOpen
      onOpenChange={({ open }) => {
        if (!open) onClose();
      }}
      onClose={onClose}
      formId={DATE_NOTE_FORM_ID}
      submitLabel="完了"
      maxW={{ base: "calc(100vw - 24px)", md: "480px" }}
    >
      <form
        id={DATE_NOTE_FORM_ID}
        onSubmit={(event) => {
          event.preventDefault();
          onSave(date, note);
        }}
      >
        <Field.Root>
          <Field.Label>メモ</Field.Label>
          <Flex w="full" gap={2} align="center">
            <Input
              value={note}
              maxLength={SHIFT_DATE_NOTE_MAX_LENGTH}
              placeholder="17時以降なら入れます"
              data-clarity-mask="true"
              onChange={(event) => setNote(event.currentTarget.value)}
            />
            {note.length > 0 && (
              <IconButton
                aria-label="メモを消す"
                size="sm"
                variant="ghost"
                colorPalette="gray"
                flexShrink={0}
                onClick={() => setNote("")}
              >
                <LuX />
              </IconButton>
            )}
          </Flex>
          <Flex w="full" justify="space-between" gap={3} mt={1}>
            <Field.HelperText>
              メモはシフト作成担当者に表示されます。体調や家庭の事情などの詳しい理由は書かなくて大丈夫です。
            </Field.HelperText>
            <Text fontSize="xs" color="fg.muted" flexShrink={0} fontVariantNumeric="tabular-nums">
              {note.length}/{SHIFT_DATE_NOTE_MAX_LENGTH}
            </Text>
          </Flex>
        </Field.Root>
      </form>
    </Dialog>
  );
}
