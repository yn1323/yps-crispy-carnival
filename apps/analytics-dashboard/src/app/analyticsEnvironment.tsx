import { createContext, type ReactNode, useContext, useEffect, useMemo, useState } from "react";

type AnalyticsEnvironmentContextValue = {
  label?: string;
  report: (label: string) => void;
};

const AnalyticsEnvironmentContext = createContext<AnalyticsEnvironmentContextValue | null>(null);

export function AnalyticsEnvironmentProvider({ children }: { children: ReactNode }) {
  const [label, setLabel] = useState<string>();
  const value = useMemo(() => ({ label, report: setLabel }), [label]);
  return <AnalyticsEnvironmentContext.Provider value={value}>{children}</AnalyticsEnvironmentContext.Provider>;
}

export function useAnalyticsEnvironment() {
  const context = useContext(AnalyticsEnvironmentContext);
  if (!context) throw new Error("AnalyticsEnvironmentProvider is missing");
  return context;
}

export function useReportAnalyticsEnvironment(label?: string) {
  const { report } = useAnalyticsEnvironment();
  useEffect(() => {
    if (label) report(label);
  }, [label, report]);
}
