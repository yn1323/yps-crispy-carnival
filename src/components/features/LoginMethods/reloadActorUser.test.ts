import type { UserResource } from "@clerk/shared/types";
import { describe, expect, it, vi } from "vitest";
import { reloadActorUser } from "./reloadActorUser";

describe("reloadActorUser", () => {
  it("同じactorのUserだけをreloadして返す", async () => {
    const user = userResource("user-current");

    await expect(
      reloadActorUser({
        isLoaded: true,
        user,
        actorUserId: user.id,
        getCurrentActorId: () => user.id,
      }),
    ).resolves.toBe(user);
    expect(user.reload).toHaveBeenCalledOnce();
  });

  it("reload前にactorが違う場合はClerk resourceを読まない", async () => {
    const user = userResource("user-previous");

    await expect(
      reloadActorUser({
        isLoaded: true,
        user,
        actorUserId: user.id,
        getCurrentActorId: () => "user-current",
      }),
    ).rejects.toThrowError("Unauthenticated");
    expect(user.reload).not.toHaveBeenCalled();
  });

  it("reload中にactorが切り替わった場合は古いUserを返さない", async () => {
    const user = userResource("user-previous");
    let currentActorId = user.id;
    vi.mocked(user.reload).mockImplementationOnce(async () => {
      currentActorId = "user-current";
      return user;
    });

    await expect(
      reloadActorUser({
        isLoaded: true,
        user,
        actorUserId: user.id,
        getCurrentActorId: () => currentActorId,
      }),
    ).rejects.toThrowError("Unauthenticated");
  });
});

function userResource(id: string): UserResource {
  return { id, reload: vi.fn(async () => undefined) } as unknown as UserResource;
}
