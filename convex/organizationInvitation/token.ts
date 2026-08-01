function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
}

function bytesToBase64Url(bytes: Uint8Array): string {
  const binary = Array.from(bytes, (byte) => String.fromCharCode(byte)).join("");
  return btoa(binary).replaceAll("+", "-").replaceAll("/", "_").replace(/=+$/, "");
}

export async function deriveInvitationToken(args: {
  invitationId: string;
  version: number;
  signingSecret: string;
}): Promise<string> {
  if (args.signingSecret.length < 32) {
    throw new Error("Invitation signing secret must be at least 32 characters");
  }
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(args.signingSecret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signed = await crypto.subtle.sign(
    "HMAC",
    key,
    new TextEncoder().encode(`organization-manager-invitation:${args.invitationId}:${args.version}`),
  );
  return bytesToBase64Url(new Uint8Array(signed));
}

export async function digestInvitationToken(token: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(token));
  return bytesToHex(new Uint8Array(digest));
}

export function invitationRateLimitKey(tokenDigest: string): string {
  return tokenDigest.slice(0, 16);
}
