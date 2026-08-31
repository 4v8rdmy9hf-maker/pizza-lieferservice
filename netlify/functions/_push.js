const webpush = require("web-push");
const { db } = require("./_firebase");

function setupPush() {
  webpush.setVapidDetails(
    process.env.VAPID_SUBJECT,
    process.env.VAPID_PUBLIC_KEY,
    process.env.VAPID_PRIVATE_KEY
  );
}

async function sendNotification(doc, title, body, data = {}) {
  setupPush();

  const subscription = doc.data().subscription;

  try {
    await webpush.sendNotification(
      subscription,
      JSON.stringify({
        title,
        body,
        data
      })
    );
  } catch (error) {
    if (error.statusCode === 404 || error.statusCode === 410) {
      await doc.ref.delete();
    } else {
      throw error;
    }
  }
}

async function sendAdminPush(title, body, data = {}) {
  const snapshot = await db
    .collection("pushSubscriptions")
    .where("type", "==", "admin")
    .get();

  await Promise.all(
    snapshot.docs.map(doc =>
      sendNotification(doc, title, body, data)
    )
  );
}

async function sendOrderPush(orderId, title, body, data = {}) {
  const snapshot = await db
    .collection("pushSubscriptions")
    .where("type", "==", "order")
    .where("orderId", "==", orderId)
    .get();

  await Promise.all(
    snapshot.docs.map(doc =>
      sendNotification(doc, title, body, data)
    )
  );
}

module.exports = {
  sendAdminPush,
  sendOrderPush
};