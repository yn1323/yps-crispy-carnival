/** 公開する友だち追加URLに、LINE以外のリンクや認証情報を混入させない。 */
export function getLineOfficialAccountUrl(value: string | undefined): string | undefined {
  const trimmed = value?.trim();
  if (!trimmed) return undefined;

  const url = new URL(trimmed);
  if (
    url.protocol !== "https:" ||
    !["lin.ee", "line.me"].includes(url.hostname) ||
    url.username ||
    url.password ||
    url.port ||
    url.pathname === "/"
  ) {
    throw new Error("VITE_LINE_OFFICIAL_ACCOUNT_URL must be a LINE HTTPS friend-add URL");
  }
  return url.href;
}
