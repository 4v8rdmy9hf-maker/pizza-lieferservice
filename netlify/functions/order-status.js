const crypto = require("crypto");
const {
  db,
  json
} = require("./_firebase");

exports.handler = async event => {
  if (event.httpMethod !== "GET") {
    return json(405, {
      error: "Methode nicht erlaubt"
    });
  }

  try {
    const orderId =
      event.queryStringParameters?.orderId;

    const trackingToken =
      event.queryStringParameters?.token;

    if (!orderId || !trackingToken) {
      return json(400, {
        error: "Bestelldaten fehlen"
      });
    }

    const orderRef = db
      .collection("orders")
      .doc(orderId);

    const orderSnap =
      await orderRef.get();

    if (!orderSnap.exists) {
      return json(404, {
        error: "Bestellung nicht gefunden"
      });
    }

    const order =
      orderSnap.data();

    const trackingHash = crypto
      .createHash("sha256")
      .update(
        String(trackingToken)
      )
      .digest("hex");

    if (
      trackingHash !==
      order.trackingTokenHash
    ) {
      return json(403, {
        error: "Ungültiger Zugriff"
      });
    }

    return json(200, {
      orderId,
      orderNumber:
        order.orderNumber,

      status:
        order.status,

      deliveryMinutes:
        order.deliveryMinutes || null,

      grossTotal:
        Number(
          order.grossTotal || 0
        ),

      payableTotal:
        Number(
          order.payableTotal || 0
        ),

      freePizzaApplied:
        Boolean(
          order.freePizzaApplied
        ),

      freeCola:
        Boolean(
          order.freeCola
        ),

      paymentMethod:
        order.paymentMethod,

      paymentStatus:
        order.paymentStatus || null
    });

  } catch (error) {
    console.error(error);

    return json(500, {
      error:
        error.message ||
        "Bestellstatus konnte nicht geladen werden"
    });
  }
};