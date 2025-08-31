export {};

declare global {
  interface CustomJwtSessionClaims {
    hasProfile?: boolean;
    metadata: {
      hasProfile?: boolean;
    };
  }
}
