const crypto = require("crypto");
const {
  db,
  requireAdmin,
  json,
  admin
} = require("./_firebase");

exports.handler = async event => {
  if (event.httpMethod !== "POST") {
    return json(405, {
      error: "Methode nicht erlaubt"
    });
  }

  try {
    const body = JSON.parse(event.body || "{}");

    if (!body.subscription?.endpoint) {
      return json(400, {
        error: "Push-Subscription fehlt"
      });
    }

    const docId = crypto
      .createHash("sha256")
      .update(body.subscription.endpoint)
      .digest("hex");

    if (body.type === "admin") {
      await requireAdmin(event);

      await db
        .collection("pushSubscriptions")
        .doc(docId)
        .set({
          type: "admin",
          subscription: body.subscription,
          updatedAt:
            admin.firestore.FieldValue.serverTimestamp()
        });

      return json(200, {
        ok: true
      });
    }

    if (body.type === "order") {
      if (!body.orderId || !body.trackingToken) {
        return json(400, {
          error: "Bestelldaten fehlen"
        });
      }

      const orderRef = db
        .collection("orders")
        .doc(body.orderId);

      const orderSnap = await orderRef.get();

      if (!orderSnap.exists) {
        return json(404, {
          error: "Bestellung nicht gefunden"
        });
      }

      const order = orderSnap.data();

      const trackingHash = crypto
        .createHash("sha256")
        .update(String(body.trackingToken))
        .digest("hex");

      if (trackingHash !== order.trackingTokenHash) {
        return json(403, {
          error: "Ungültiger Zugriff"
        });
      }

      await db
        .collection("pushSubscriptions")
        .doc(docId)
        .set({
          type: "order",
          orderId: body.orderId,
          subscription: body.subscription,
          updatedAt:
            admin.firestore.FieldValue.serverTimestamp()
        });

      return json(200, {
        ok: true
      });
    }

    return json(400, {
      error: "Push-Typ ungültig"
    });

  } catch (error) {
    console.error(error);

    return json(
      error.statusCode || 500,
      {
        error:
          error.message ||
          "Serverfehler"
      }
    );
  }
};