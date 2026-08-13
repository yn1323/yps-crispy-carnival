import { createFileRoute } from "@tanstack/react-router";
import { CommercialTransactionsPage } from "@/src/pages/commercial-transactions";
import { buildCommercialTransactionsPageHead } from "@/src/pages/commercial-transactions/meta";

export const Route = createFileRoute("/commercial-transactions")({
  head: buildCommercialTransactionsPageHead,
  component: CommercialTransactionsPage,
});
