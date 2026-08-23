import { LandingPage } from "@/src/components/features/LandingPage";
import { publicPlanPrices } from "@/src/configs/publicPlanPrices";

export function HomePage() {
  return <LandingPage prices={publicPlanPrices} />;
}
