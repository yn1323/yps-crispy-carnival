// Convex用ヘルパー関数

// UUIDv4風のトークン生成
export const generateToken = () => {
  const chars = "abcdefghijklmnopqrstuvwxyz0123456789";
  let token = "";
  for (let i = 0; i < 32; i++) {
    token += chars[Math.floor(Math.random() * chars.length)];
  }
  return token;
};
