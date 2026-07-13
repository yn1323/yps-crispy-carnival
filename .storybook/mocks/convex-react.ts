// Storybook用のconvex/reactモック
// query/mutation/actionを通信しないスタブに差し替える

export const useQuery = () => undefined;
export const usePaginatedQuery = () => ({
  results: [],
  status: "Exhausted" as const,
  loadMore: () => {},
});
export const useMutation = () => async () => {};
export const useAction = () => async () => {};
export const useConvex = () => ({});
export const useConvexConnectionState = () => ({ isConnected: false });
export const ConvexProvider = ({ children }: { children: React.ReactNode }) => children;
