import { useBlocker, useNavigate } from "@tanstack/react-router";
import { useMutation } from "convex/react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { showErrorToast, showSuccessToast } from "@/src/components/shared/feedback";
import { Animation } from "@/src/components/templates/Animation";
import { Dialog } from "@/src/components/ui/Dialog";
import { useSingleFlight } from "@/src/hooks/useSingleFlight";
import { StaffOrderEditorStateView, StaffOrderEditorView } from "./StaffOrderEditorView";
import { areStaffOrderPersonIdsEqual, buildStaffOrderEditorVersionKey } from "./script";
import type { StaffOrderEditorSnapshot, StaffOrderPerson } from "./types";

type Props = {
  organizationId: Id<"organizations">;
  editor: StaffOrderEditorSnapshot;
  filteredShopName?: string;
  returnShopFilter?: Id<"shops">;
};

export function StaffOrderEditor({ organizationId, editor, filteredShopName, returnShopFilter }: Props) {
  const navigate = useNavigate();
  const saveOrder = useMutation(api.appOrganization.staffOrderMutations.saveOrganizationStaffOrder);
  const initialPeople = editor.availability === "ready" ? editor.people : [];
  const [acceptedEditor, setAcceptedEditor] = useState(editor);
  const [draft, setDraft] = useState<StaffOrderPerson[]>(initialPeople);
  const [baselinePersonIds, setBaselinePersonIds] = useState(() => initialPeople.map((person) => person.personId));
  const [expectedOrderFingerprint, setExpectedOrderFingerprint] = useState(editor.orderFingerprint);
  const [hasServerConflict, setHasServerConflict] = useState(false);
  const acceptedSourceKeyRef = useRef(buildStaffOrderEditorVersionKey(editor));
  const latestSourceKey = useMemo(() => buildStaffOrderEditorVersionKey(editor), [editor]);
  const draftPersonIds = useMemo(() => draft.map((person) => person.personId), [draft]);
  const isDirty = !areStaffOrderPersonIdsEqual(draftPersonIds, baselinePersonIds);
  const hasPendingServerConflict = hasServerConflict || (latestSourceKey !== acceptedSourceKeyRef.current && isDirty);
  const hasUnsavedChangesRef = useRef(isDirty);
  const hasServerConflictRef = useRef(hasPendingServerConflict);
  const canSaveRef = useRef(false);
  const draftPersonIdsRef = useRef(draftPersonIds);
  const expectedOrderFingerprintRef = useRef(expectedOrderFingerprint);
  hasUnsavedChangesRef.current = isDirty;
  hasServerConflictRef.current = hasPendingServerConflict;
  draftPersonIdsRef.current = draftPersonIds;
  expectedOrderFingerprintRef.current = expectedOrderFingerprint;

  const applyEditorSnapshot = useCallback((nextEditor: StaffOrderEditorSnapshot, sourceKey: string) => {
    const nextPeople = nextEditor.availability === "ready" ? nextEditor.people : [];
    acceptedSourceKeyRef.current = sourceKey;
    hasUnsavedChangesRef.current = false;
    hasServerConflictRef.current = false;
    setAcceptedEditor(nextEditor);
    setDraft(nextPeople);
    setBaselinePersonIds(nextPeople.map((person) => person.personId));
    setExpectedOrderFingerprint(nextEditor.orderFingerprint);
    setHasServerConflict(false);
  }, []);

  useEffect(() => {
    if (latestSourceKey === acceptedSourceKeyRef.current) {
      if (hasServerConflict) setHasServerConflict(false);
      return;
    }
    if (hasUnsavedChangesRef.current || hasServerConflict) {
      if (!hasServerConflict) setHasServerConflict(true);
      return;
    }
    applyEditorSnapshot(editor, latestSourceKey);
  }, [applyEditorSnapshot, editor, hasServerConflict, latestSourceKey]);

  const blocker = useBlocker({
    shouldBlockFn: () => hasUnsavedChangesRef.current,
    enableBeforeUnload: () => hasUnsavedChangesRef.current,
    withResolver: true,
  });

  const latestCanWrite = editor.availability === "ready" && editor.canWrite;
  const hasEnoughPeopleToReorder = acceptedEditor.people.length >= 2;
  const canWrite =
    acceptedEditor.availability === "ready" && acceptedEditor.canWrite && latestCanWrite && hasEnoughPeopleToReorder;
  const writeDisabledReason = !latestCanWrite
    ? editor.writeDisabledReason
    : !acceptedEditor.canWrite
      ? acceptedEditor.writeDisabledReason
      : !hasEnoughPeopleToReorder
        ? "2名以上のスタッフがいると並び替えできます。"
        : undefined;
  canSaveRef.current = canWrite && isDirty && !hasPendingServerConflict;

  const { run: saveOnce, isRunning: isSaving } = useSingleFlight(async () => {
    if (!canSaveRef.current || hasServerConflictRef.current) return;
    const submittedPersonIds = draftPersonIdsRef.current;
    try {
      const result = await saveOrder({
        organizationId,
        orderedPersonIds: submittedPersonIds,
        expectedOrderFingerprint: expectedOrderFingerprintRef.current,
      });
      hasUnsavedChangesRef.current = false;
      hasServerConflictRef.current = false;
      setBaselinePersonIds(submittedPersonIds);
      setExpectedOrderFingerprint(result.orderFingerprint);
      setAcceptedEditor((current) => ({
        ...current,
        people: draft,
        orderFingerprint: result.orderFingerprint,
      }));
      setHasServerConflict(false);
      showSuccessToast({
        title: result.changed ? "スタッフの並び順を保存しました" : "並び順は保存済みです",
      });
      blocker.reset?.();
      await navigate({
        to: "/staff",
        search: {
          org: organizationId,
          ...(returnShopFilter ? { shopFilter: returnShopFilter } : {}),
        },
      });
    } catch (error) {
      showErrorToast(error);
    }
  });

  const handleOrderChange = (nextPeople: StaffOrderPerson[]) => {
    hasUnsavedChangesRef.current = !areStaffOrderPersonIdsEqual(
      nextPeople.map((person) => person.personId),
      baselinePersonIds,
    );
    setDraft(nextPeople);
  };

  const handleReloadLatest = () => {
    if (isSaving) return;
    applyEditorSnapshot(editor, latestSourceKey);
  };

  if (acceptedEditor.availability !== "ready") {
    return <StaffOrderEditorStateView state={{ kind: "unavailable", availability: acceptedEditor.availability }} />;
  }
  if (acceptedEditor.people.length === 0) return <StaffOrderEditorStateView state={{ kind: "empty" }} />;

  return (
    <Animation>
      <StaffOrderEditorView
        people={draft}
        canWrite={canWrite}
        writeDisabledReason={writeDisabledReason}
        isDirty={isDirty}
        isSaving={isSaving}
        hasServerConflict={hasPendingServerConflict}
        filteredShopName={filteredShopName}
        onOrderChange={handleOrderChange}
        onReloadLatest={handleReloadLatest}
        onSave={() => void saveOnce()}
      />

      <Dialog
        title={isSaving ? "並び順を保存しています" : "変更を保存せずに移動しますか？"}
        role="alertdialog"
        isOpen={blocker.status === "blocked"}
        onOpenChange={({ open }) => {
          if (!open && !isSaving) blocker.reset?.();
        }}
        onClose={() => {
          if (!isSaving) blocker.reset?.();
        }}
        closeLabel="この画面に戻る"
        submitLabel={isSaving ? "保存完了後に移動" : "変更を破棄して移動"}
        submitColorPalette="red"
        isSubmitDisabled={isSaving}
        preventClose={isSaving}
        onSubmit={() => {
          if (!isSaving) blocker.proceed?.();
        }}
      >
        {isSaving
          ? "保存処理は中断せずに続いています。完了するとスタッフ一覧へ移動します。"
          : "並び順の変更はまだ保存されていません。移動すると、今回の変更は失われます。"}
      </Dialog>
    </Animation>
  );
}

export { StaffOrderEditorStateView, StaffOrderEditorView } from "./StaffOrderEditorView";
export { reorderStaffOrderPeople } from "./script";
export type { StaffOrderAvailability, StaffOrderEditorSnapshot, StaffOrderPerson } from "./types";
