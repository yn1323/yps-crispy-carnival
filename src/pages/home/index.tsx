import { useNavigate } from "@tanstack/react-router";
import { useEffect } from "react";
import { LandingPage } from "@/src/components/features/LandingPage";
import { publicPlanPrices } from "@/src/configs/publicPlanPrices";
import { isCurrentWindowStandaloneWebApp } from "@/src/lib/pwaDisplayMode";

export function HomePage() {
  const navigate = useNavigate();

  useEffect(() => {
    if (!isCurrentWindowStandaloneWebApp()) return;
    void navigate({ to: "/dashboard", search: {}, replace: true });
  }, [navigate]);

  return <LandingPage prices={publicPlanPrices} />;
}
