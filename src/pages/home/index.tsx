import { useEffect } from "react";
import { LandingPage } from "@/src/components/features/LandingPage";
import { publicPlanPrices } from "@/src/configs/publicPlanPrices";
import { isCurrentWindowStandaloneWebApp } from "@/src/lib/pwaDisplayMode";

type HomePageProps = {
  replaceLocation?: (path: string) => void;
};

const replaceDocumentLocation = (path: string) => window.location.replace(path);

export function HomePage({ replaceLocation = replaceDocumentLocation }: HomePageProps = {}) {
  useEffect(() => {
    if (!isCurrentWindowStandaloneWebApp()) return;
    replaceLocation("/dashboard");
  }, [replaceLocation]);

  return <LandingPage prices={publicPlanPrices} />;
}
