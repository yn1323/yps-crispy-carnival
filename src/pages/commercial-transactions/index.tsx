import { CommercialTransactions } from "@/src/components/features/CommercialTransactions";
import { publicPlanPrices } from "@/src/configs/publicPlanPrices";

export function CommercialTransactionsPage() {
  return <CommercialTransactions prices={publicPlanPrices} />;
}
