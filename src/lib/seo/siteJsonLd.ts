import { SITE_NAME, SITE_URL } from ".";

export const SITE_DESCRIPTION =
  "LINEでスタッフに希望シフトの提出を依頼し、提出状況の確認からシフト作成・確定共有まで進められます。\nスタッフはアプリ不要で、そのまま希望シフトを提出できます。";

/** 検索エンジンがサイト名として英字表記も同じサービスへ結び付けるための別名。 */
const SITE_ALTERNATE_NAME = "Shiftori";

/** 部品名など同名の別物と区別するため、運営者として確認済みの公式プロフィールだけを列挙する。 */
const OFFICIAL_PROFILE_URLS = ["https://line.me/R/ti/p/@800kzcfc"];

const ORGANIZATION_ID = `${SITE_URL}/#organization`;
const WEBSITE_ID = `${SITE_URL}/#website`;

export const organizationJsonLd = {
  "@context": "https://schema.org",
  "@type": "Organization",
  "@id": ORGANIZATION_ID,
  name: SITE_NAME,
  alternateName: SITE_ALTERNATE_NAME,
  url: SITE_URL,
  logo: `${SITE_URL}/logo512.png`,
  sameAs: OFFICIAL_PROFILE_URLS,
};

export const webSiteJsonLd = {
  "@context": "https://schema.org",
  "@type": "WebSite",
  "@id": WEBSITE_ID,
  name: SITE_NAME,
  alternateName: SITE_ALTERNATE_NAME,
  url: SITE_URL,
  inLanguage: "ja-JP",
  publisher: { "@id": ORGANIZATION_ID },
};

export const softwareApplicationJsonLd = {
  "@context": "https://schema.org",
  "@type": "SoftwareApplication",
  name: SITE_NAME,
  description: SITE_DESCRIPTION,
  url: SITE_URL,
  applicationCategory: "BusinessApplication",
  operatingSystem: "Web",
  image: `${SITE_URL}/ogp.png`,
  inLanguage: "ja",
  provider: { "@id": ORGANIZATION_ID },
};
