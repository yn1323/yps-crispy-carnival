import type { UserResource } from "@clerk/shared/types";

type ReloadActorUserOptions = {
  isLoaded: boolean;
  user: UserResource | null | undefined;
  actorUserId: string | null;
  getCurrentActorId: () => string | null;
};

export async function reloadActorUser({
  isLoaded,
  user,
  actorUserId,
  getCurrentActorId,
}: ReloadActorUserOptions): Promise<UserResource> {
  if (!isLoaded || !user || !actorUserId || user.id !== actorUserId || getCurrentActorId() !== actorUserId) {
    throw new Error("Unauthenticated");
  }

  await user.reload();

  if (user.id !== actorUserId || getCurrentActorId() !== actorUserId) {
    throw new Error("Unauthenticated");
  }
  return user;
}
