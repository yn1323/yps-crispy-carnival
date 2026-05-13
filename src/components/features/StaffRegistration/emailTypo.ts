const DOMAIN_SUGGESTIONS = {
  "gmai.com": "gmail.com",
  "gmail.con": "gmail.com",
  "gmial.com": "gmail.com",
  "gamil.com": "gmail.com",
  "yaho.co.jp": "yahoo.co.jp",
  "yahoo.con": "yahoo.com",
  "icloud.con": "icloud.com",
  "outlook.con": "outlook.com",
  "hotmail.con": "hotmail.com",
} as const;

export function suggestEmailTypoFix(email: string): string | null {
  const [localPart, domain, ...rest] = email.trim().toLowerCase().split("@");
  if (!localPart || !domain || rest.length > 0) return null;
  const suggestion = DOMAIN_SUGGESTIONS[domain as keyof typeof DOMAIN_SUGGESTIONS];
  return suggestion ? `${localPart}@${suggestion}` : null;
}
