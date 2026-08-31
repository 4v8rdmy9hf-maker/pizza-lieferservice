const {
  db,
  json
} = require("./_firebase");

const {
  sendAdminPush
} = require("./_push");

async function getPayPalAccessToken() {
  const clientId =
    process.env.PAYPAL_CLIENT_ID;

  const clientSecret =
    process.env.PAYPAL_CLIENT_SECRET;

  if (!clientId || !clientSecret) {
    throw new Error(
      "PayPal ist noch nicht eingerichtet."
    );
  }

  const baseUrl =
    process.env.PAYPAL_MODE === "live"
      ? "https://api-m.paypal.com"
      : "https://api-m.sandbox.paypal.com";

  const response =
    await fetch(
      `${baseUrl}/v1/oauth2/token`,
      {
        method: "POST",

        headers: {
          Authorization:
            "Basic " +
            Buffer
              .from(
                `${clientId}:${clientSecret}`
              )
              .toString("base64"),

          "Content-Type":
            "application/x-www-form-urlencoded"
        },

        body:
          "grant_type=client_credentials"
      }
    );

  const data =
    await response.json();

  if (!response.ok) {
    throw new Error(
      "PayPal-Anmeldung fehlgeschlagen."
    );
  }

  return {
    accessToken:
      data.access_token,

    baseUrl
  };
}

exports.handler = async event => {
  if (event.httpMethod !== "POST") {
    return json(405, {
      error: "Methode nicht erlaubt"
    });
  }

  try {
    const body =
      JSON.parse(
        event.body || "{}"
      );

    const orderId =
      body.orderId;

    if (!orderId) {
      return json(400, {
        error:
          "Bestellnummer fehlt"
      });
    }

    const orderRef =
      db
        .collection("orders")
        .doc(orderId);

    const orderSnap =
      await orderRef.get();

    if (!orderSnap.exists) {
      return json(404, {
        error:
          "Bestellung nicht gefunden"
      });
    }

    const order =
      orderSnap.data();

    if (
      order.paymentStatus ===
      "paid"
    ) {
      return json(200, {
        ok: true,
        alreadyPaid: true
      });
    }

    if (!order.paypalOrderId) {
      return json(400, {
        error:
          "PayPal-Bestellung fehlt"
      });
    }

    const {
      accessToken,
      baseUrl
    } =
      await getPayPalAccessToken();

    const captureResponse =
      await fetch(
        `${baseUrl}/v2/checkout/orders/${encodeURIComponent(
          order.paypalOrderId
        )}/capture`,
        {
          method: "POST",

          headers: {
            Authorization:
              `Bearer ${accessToken}`,

            "Content-Type":
              "application/json"
          }
        }
      );

    const captureData =
      await captureResponse.json();

    if (!captureResponse.ok) {
      console.error(
        captureData
      );

      return json(400, {
        error:
          "PayPal-Zahlung konnte nicht bestätigt werden."
      });
    }

    if (
      captureData.status !==
      "COMPLETED"
    ) {
      return json(400, {
        error:
          "Zahlung ist noch nicht vollständig abgeschlossen."
      });
    }

    await orderRef.update({
      status: "new",
      paymentStatus: "paid",
      paypalCaptureId:
        captureData.id || null
    });

    try {
      await sendAdminPush(
        `Neue bezahlte Bestellung #${order.orderNumber}`,
        `${Number(
          order.payableTotal || 0
        ).toFixed(2)} € · ${order.customer?.name || ""}`
      );
    } catch (pushError) {
      console.error(
        "Push fehlgeschlagen:",
        pushError
      );
    }

    return json(200, {
      ok: true,
      status:
        captureData.status
    });

  } catch (error) {
    console.error(error);

    return json(500, {
      error:
        error.message ||
        "Zahlung konnte nicht verarbeitet werden."
    });
  }
};