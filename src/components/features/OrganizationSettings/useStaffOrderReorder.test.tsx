// @vitest-environment jsdom

import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Id } from "@/convex/_generated/dataModel";
import type { OrganizationPersonView } from "./types";

const mocks = vi.hoisted(() => ({
  mutation: vi.fn(),
  toasterCreate: vi.fn(),
}));

vi.mock("convex/react", () => ({
  useMutation: () => mocks.mutation,
}));

vi.mock("@/src/components/ui/toaster", () => ({
  toaster: { create: mocks.toasterCreate },
}));

import { type StaffOrderReorderSource, useStaffOrderReorder } from "./useStaffOrderReorder";

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

const organizationId = "organization-1" as Id<"organizations">;
const personA = "person-a" as Id<"organizationPeople">;
const personB = "person-b" as Id<"organizationPeople">;
const personC = "person-c" as Id<"organizationPeople">;

const people: OrganizationPersonView[] = [
  createPerson(personA, "スタッフA"),
  createPerson(personB, "スタッフB"),
  createPerson(personC, "スタッフC"),
];

function createPerson(id: Id<"organizationPeople">, name: string): OrganizationPersonView {
  return {
    id,
    name,
    email: null,
    managerRole: "none",
    isStaff: true,
    isLineConnected: false,
    lineStatus: "unlinked",
    hasManagerInvitation: false,
    shopNames: [],
    shopIds: [],
    canRemoveManagerRole: false,
    canRemove: true,
  };
}

function createSource(
  orderedPersonIds: StaffOrderReorderSource["orderedPersonIds"] = [personA, personB, personC],
  orderFingerprint = "fingerprint-1",
): StaffOrderReorderSource {
  return {
    organizationId,
    orderedPersonIds,
    orderFingerprint,
    canReorder: true,
  };
}

function displayedPersonIds(result: { current: ReturnType<typeof useStaffOrderReorder> }) {
  return result.current.people.map((person) => person.id);
}

beforeEach(() => {
  mocks.mutation.mockReset();
  mocks.toasterCreate.mockReset();
});

describe("useStaffOrderReorder", () => {
  it("drop直後に全IDと現在のfingerprintを一度だけ送り、成功後も並び順を維持する", async () => {
    const gate = deferred<{ orderFingerprint: string }>();
    mocks.mutation.mockReturnValue(gate.promise);
    const { result } = renderHook(() => useStaffOrderReorder(people, createSource()));

    act(() => result.current.staffOrder?.onReorder(personA, personC));

    expect(displayedPersonIds(result)).toEqual([personB, personC, personA]);
    expect(result.current.staffOrder).toMatchObject({ disabled: true, isSaving: true });
    expect(mocks.mutation).toHaveBeenCalledExactlyOnceWith({
      organizationId,
      orderedPersonIds: [personB, personC, personA],
      expectedOrderFingerprint: "fingerprint-1",
    });

    await act(async () => {
      gate.resolve({ orderFingerprint: "fingerprint-2" });
      await gate.promise;
    });

    await waitFor(() => expect(result.current.staffOrder?.isSaving).toBe(false));
    expect(displayedPersonIds(result)).toEqual([personB, personC, personA]);
    expect(mocks.toasterCreate).not.toHaveBeenCalled();
  });

  it("保存失敗時は元の並びへ戻し、説明なしのエラーToastを一度だけ表示する", async () => {
    const gate = deferred<{ orderFingerprint: string }>();
    mocks.mutation.mockReturnValue(gate.promise);
    const { result } = renderHook(() => useStaffOrderReorder(people, createSource()));

    act(() => result.current.staffOrder?.onReorder(personA, personC));
    expect(displayedPersonIds(result)).toEqual([personB, personC, personA]);

    await act(async () => {
      gate.reject(new Error("save failed"));
      await gate.promise.catch(() => undefined);
    });

    await waitFor(() => expect(result.current.staffOrder?.isSaving).toBe(false));
    expect(displayedPersonIds(result)).toEqual([personA, personB, personC]);
    expect(mocks.toasterCreate).toHaveBeenCalledExactlyOnceWith(
      expect.objectContaining({
        title: "並び順を保存できませんでした",
        type: "error",
      }),
    );
    expect(mocks.toasterCreate.mock.calls[0]?.[0]).not.toHaveProperty("description");
  });

  it("保存中の連続dropは最初の並び替えだけを送る", async () => {
    const gate = deferred<{ orderFingerprint: string }>();
    mocks.mutation.mockReturnValue(gate.promise);
    const { result } = renderHook(() => useStaffOrderReorder(people, createSource()));

    act(() => {
      result.current.staffOrder?.onReorder(personA, personC);
      result.current.staffOrder?.onReorder(personB, personA);
    });

    expect(mocks.mutation).toHaveBeenCalledTimes(1);
    expect(displayedPersonIds(result)).toEqual([personB, personC, personA]);

    await act(async () => {
      gate.resolve({ orderFingerprint: "fingerprint-2" });
      await gate.promise;
    });
    await waitFor(() => expect(result.current.staffOrder?.isSaving).toBe(false));
  });

  it("待機中でないときsourceの並びとfingerprintを次の保存へ同期する", async () => {
    mocks.mutation.mockResolvedValue({ orderFingerprint: "fingerprint-3" });
    const { result, rerender } = renderHook(
      ({ source }: { source: StaffOrderReorderSource }) => useStaffOrderReorder(people, source),
      { initialProps: { source: createSource() } },
    );

    rerender({ source: createSource([personB, personA, personC], "fingerprint-2") });
    await waitFor(() => expect(displayedPersonIds(result)).toEqual([personB, personA, personC]));

    act(() => result.current.staffOrder?.onReorder(personB, personC));

    await waitFor(() =>
      expect(mocks.mutation).toHaveBeenCalledExactlyOnceWith({
        organizationId,
        orderedPersonIds: [personA, personC, personB],
        expectedOrderFingerprint: "fingerprint-2",
      }),
    );
    await waitFor(() => expect(result.current.staffOrder?.isSaving).toBe(false));
    expect(displayedPersonIds(result)).toEqual([personA, personC, personB]);
  });
});
