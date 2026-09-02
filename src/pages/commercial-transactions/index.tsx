import { CommercialTransactions } from "@/src/components/features/CommercialTransactions";
import { commercialTransactionsDisclosure } from "@/src/configs/commercialTransactionsDisclosure";
import { publicPlanPrices } from "@/src/configs/publicPlanPrices";

export function CommercialTransactionsPage() {
  return <CommercialTransactions prices={publicPlanPrices} disclosure={commercialTransactionsDisclosure} />;
}
