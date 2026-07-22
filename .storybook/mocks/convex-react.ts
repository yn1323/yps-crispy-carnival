// Storybook用のconvex/reactモック
// query/mutation/actionを通信しないスタブに差し替える

export const useQuery = () => undefined;
export const useQueries = (queries: Record<string, unknown>) =>
  Object.fromEntries(
    Object.keys(queries).map((key) => [
      key,
      {
        page: [],
        isDone: true,
        continueCursor: "",
      },
    ]),
  );
export const usePaginatedQuery = () => ({
  results: [],
  status: "Exhausted" as const,
  loadMore: () => {},
});
export const useMutation = () => async () => {};
export const useAction = () => async () => {};
export const useConvex = () => ({ logger: { warn: () => {} } });
export const useConvexAuth = () => ({ isAuthenticated: false, isLoading: false });
export const useConvexConnectionState = () => ({ isConnected: false });
export const ConvexProvider = ({ children }: { children: React.ReactNode }) => children;
