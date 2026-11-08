import { Field, Text } from "@chakra-ui/react";
import { useState } from "react";
import { SHIFT_DATE_NOTE_MAX_LENGTH } from "@/convex/constants";
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
      title={`${dateLabel}の連絡事項`}
      isOpen
      onOpenChange={({ open }) => {
        if (!open) onClose();
      }}
      onClose={onClose}
      formId={DATE_NOTE_FORM_ID}
      submitLabel="OK"
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
          <Field.Label>管理者に伝えること(任意)</Field.Label>
          <Input
            value={note}
            maxLength={SHIFT_DATE_NOTE_MAX_LENGTH}
            placeholder="17時以降なら入れます"
            data-clarity-mask="true"
            onChange={(event) => setNote(event.currentTarget.value)}
          />
          <Text w="full" textAlign="right" fontSize="xs" color="fg.muted" fontVariantNumeric="tabular-nums">
            {note.length}/{SHIFT_DATE_NOTE_MAX_LENGTH}
          </Text>
        </Field.Root>
      </form>
    </Dialog>
  );
}
