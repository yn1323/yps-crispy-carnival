// Storybook用のconvex/reactモック
// useMutation/useQuery/useActionを何もしないスタブに差し替える

export const useQuery = () => undefined;
export const useMutation = () => async () => {};
export const useAction = () => async () => {};
export const useConvex = () => ({});
export const useConvexConnectionState = () => ({ isConnected: false });
export const ConvexProvider = ({ children }: { children: React.ReactNode }) => children;
