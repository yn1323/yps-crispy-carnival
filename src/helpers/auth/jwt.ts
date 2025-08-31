import { jwtVerify, SignJWT } from "jose";

// JWT関連の型定義
export type JWTPayload = {
  userId: string;
  hasProfile: boolean;
  iat?: number;
  exp?: number;
};

const JWT_SECRET = new TextEncoder().encode(process.env.JWT_SECRET || "yps-crispy-carnival");

const TWELVE_HOURS_IN_SECONDS = 12 * 60 * 60;

export const generateJWT = async (jwtPayload: JWTPayload) => {
  const token = await new SignJWT(jwtPayload)
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(Math.floor(Date.now() / 1000) + TWELVE_HOURS_IN_SECONDS)
    .sign(JWT_SECRET);

  return token;
};

export const verifyJWT = async (token: string) => {
  try {
    const { payload } = await jwtVerify(token, JWT_SECRET);

    if (
      typeof payload.userId === "string" &&
      typeof payload.hasProfile === "boolean" &&
      typeof payload.iat === "number" &&
      typeof payload.exp === "number"
    ) {
      return payload as JWTPayload;
    }

    return null;
  } catch {
    return null;
  }
};

export const isTokenExpired = (payload: JWTPayload) => {
  const currentTime = Math.floor(Date.now() / 1000);
  return payload?.exp ?? 9999999999 < currentTime;
};
