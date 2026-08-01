import { ManagerInvitationAcceptance } from "@/src/components/features/ManagerInvitationAcceptance";
import { AuthProviders } from "@/src/providers/AuthProviders";

type Props = {
  token: string | undefined;
};

export function ManagerInvitationRoutePage({ token }: Props) {
  return (
    <AuthProviders>
      <ManagerInvitationAcceptance token={token} />
    </AuthProviders>
  );
}
