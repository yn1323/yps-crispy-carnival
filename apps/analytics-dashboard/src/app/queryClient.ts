import { QueryClient } from "@tanstack/react-query";
import { AnalyticsApiError } from "@/api/analyticsClient";

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      refetchOnWindowFocus: true,
      retry: (failureCount, error) =>
        error instanceof AnalyticsApiError && error.status >= 500 && error.status < 600 && failureCount < 1,
      staleTime: 0,
      gcTime: 0,
    },
  },
});
