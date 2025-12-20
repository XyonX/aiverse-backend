// config/firebaseAdmin.js
const admin = require("firebase-admin");

/**
 * When running tests, export a tiny mock instead of initializing the real SDK.
 * Make sure you run tests with NODE_ENV=test (see note below).
 */
if (process.env.NODE_ENV === "test") {
  // simple mock that provides the methods your code expects
  module.exports = {
    auth: () => ({
      // verifyIdToken should return a Promise that resolves to a payload with a uid
      verifyIdToken: async (token) => ({ uid: "test-user" }),
      // other auth methods if needed can be added here
    }),
    // a small firestore mock if your code uses admin.firestore()
    firestore: () => ({
      collection: () => ({
        doc: () => ({
          get: async () => ({ exists: false, data: () => ({}) }),
          set: async () => ({}),
          update: async () => ({}),
        }),
      }),
    }),
  };
} else {
  // Real initialization for dev / production
  const serviceAccount = {
    type: process.env.TYPE,
    project_id: process.env.PROJECT_ID,
    private_key_id: process.env.PRIVATE_KEY_ID,
    private_key: process.env.PRIVATE_KEY?.replace(/\\n/g, "\n"),
    client_email: process.env.CLIENT_EMAIL,
    client_id: process.env.CLIENT_ID,
    auth_uri: process.env.AUTH_URI,
    token_uri: process.env.TOKEN_URI,
    auth_provider_x509_cert_url: process.env.AUTH_PROVIDER_X509_CERT_URL,
    client_x509_cert_url: process.env.CLIENT_X509_CERT_URL,
    universe_domain: process.env.UNIVERSE_DOMAIN,
  };

  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
  });

  module.exports = admin;
}
