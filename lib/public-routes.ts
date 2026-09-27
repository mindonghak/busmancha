import config from "@/config/collection-routes.json";

// Collecting a route never makes it public. Publication is an explicit decision.
export const publicRoutes = Object.keys(config.public);
