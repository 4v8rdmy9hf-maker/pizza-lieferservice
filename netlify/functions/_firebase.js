const admin = require("firebase-admin");

if (!admin.apps.length) {
  const raw = process.env.FIREBASE_SERVICE_ACCOUNT;

  if (!raw) {
    throw new Error("FIREBASE_SERVICE_ACCOUNT fehlt");
  }

  admin.initializeApp({
    credential: admin.credential.cert(JSON.parse(raw))
  });
}

const db = admin.firestore();

async function userFromEvent(event) {
  const header =
    event.headers.authorization ||
    event.headers.Authorization ||
    "";

  if (!header.startsWith("Bearer ")) return null;

  try {
    return await admin.auth().verifyIdToken(header.slice(7));
  } catch {
    return null;
  }
}

async function requireAdmin(event) {
  const user = await userFromEvent(event);

  if (
    !user ||
    String(user.email || "").toLowerCase() !==
      "tahayman10@gmail.com"
  ) {
    const error = new Error("Nicht autorisiert");
    error.statusCode = 403;
    throw error;
  }

  return user;
}

function json(statusCode, body) {
  return {
    statusCode,
    headers: {
      "content-type": "application/json",
      "cache-control": "no-store"
    },
    body: JSON.stringify(body)
  };
}

module.exports = {
  admin,
  db,
  userFromEvent,
  requireAdmin,
  json
};