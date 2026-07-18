import { createFileRoute } from "@tanstack/react-router";
import { AccountDeletionAcceptedPage } from "@/src/pages/account-deletion-accepted";
import { buildAccountDeletionAcceptedPageHead } from "@/src/pages/account-deletion-accepted/meta";

export const Route = createFileRoute("/account-deletion-accepted")({
  head: buildAccountDeletionAcceptedPageHead,
  component: AccountDeletionAcceptedPage,
});
