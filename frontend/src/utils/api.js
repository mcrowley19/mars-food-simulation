const DEFAULT_DEPLOYED_API_URL =
  "https://q24ptv77a7.execute-api.us-west-2.amazonaws.com";

export const API_BASE_URL =
  import.meta.env.VITE_API_URL || DEFAULT_DEPLOYED_API_URL;

