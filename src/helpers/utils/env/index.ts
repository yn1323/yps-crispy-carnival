export const getEnv = () => {
  return {
    NEXT_PUBLIC_IS_LOCAL: process.env.NEXT_PUBLIC_IS_LOCAL === "true",
    IS_LOCAL: process.env.IS_LOCAL === "true",
    NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL ?? "",
    NEXT_PUBLIC_SUPABASE_ANON_KEY: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "",
  };
};
