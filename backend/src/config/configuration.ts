export default () => ({
  port: parseInt(process.env.PORT || '3001', 10),
  database: {
    url: process.env.DATABASE_URL,
  },
  auth: {
    secret: process.env.BETTER_AUTH_SECRET,
    url: process.env.BETTER_AUTH_URL || 'http://localhost:3001',
  },
  frontend: {
    url: process.env.FRONTEND_URL || 'http://localhost:3000',
  },
  facebook: {
    appSecret: process.env.FACEBOOK_APP_SECRET,
    webhookVerifyToken: process.env.FACEBOOK_WEBHOOK_VERIFY_TOKEN,
    webhookBaseUrl: process.env.WEBHOOK_BASE_URL,
    graphApiBase: process.env.FACEBOOK_GRAPH_API_BASE || 'https://graph.facebook.com',
    graphApiVersion: process.env.FACEBOOK_GRAPH_API_VERSION || 'v25.0',
  },
});
