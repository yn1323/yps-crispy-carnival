const key = "CLERK_JWT_ISSUER_DOMAIN";
export default {
  providers: [
    {
      domain: process.env[key] ?? "",
      applicationID: "convex",
    },
  ],
};
