const webpush = require("web-push");

const {
  db
} = require("./_firebase");


function setupPush() {

  const subject =
    process.env.VAPID_SUBJECT;

  const publicKey =
    process.env.VAPID_PUBLIC_KEY;

  const privateKey =
    process.env.VAPID_PRIVATE_KEY;


  if (
    !subject ||
    !publicKey ||
    !privateKey
  ) {

    throw new Error(
      "VAPID-Konfiguration fehlt"
    );

  }


  webpush.setVapidDetails(
    subject,
    publicKey,
    privateKey
  );

}


async function sendNotification(
  doc,
  title,
  body,
  data = {}
) {

  setupPush();


  const subscription =
    doc.data()?.subscription;


  if (
    !subscription?.endpoint
  ) {

    return;

  }


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

    if (
      error.statusCode === 404 ||
      error.statusCode === 410
    ) {

      await doc.ref.delete();

      return;

    }


    throw error;

  }

}


async function sendAdminPush(
  title,
  body,
  data = {}
) {

  const snapshot =
    await db
      .collection(
        "pushSubscriptions"
      )
      .where(
        "type",
        "==",
        "admin"
      )
      .get();


  await Promise.all(
    snapshot.docs.map(
      doc =>
        sendNotification(
          doc,
          title,
          body,
          {
            ...data,
            type: "admin",
            url: "/?admin=1"
          }
        )
    )
  );

}


async function sendOrderPush(
  orderId,
  title,
  body,
  data = {}
) {

  const snapshot =
    await db
      .collection(
        "pushSubscriptions"
      )
      .where(
        "type",
        "==",
        "order"
      )
      .where(
        "orderId",
        "==",
        orderId
      )
      .get();


  await Promise.all(
    snapshot.docs.map(
      doc =>
        sendNotification(
          doc,
          title,
          body,
          {
            ...data,
            type: "order",
            orderId,
            url: "/"
          }
        )
    )
  );

}


module.exports = {
  sendAdminPush,
  sendOrderPush
};
