const crypto = require("crypto");
const {
  db,
  json
} = require("./_firebase");

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
    const internalSecret =
      event.headers[
        "x-internal-secret"
      ];

    if (
      !internalSecret ||
      internalSecret !==
        process.env
          .INTERNAL_FUNCTION_SECRET
    ) {
      return json(403, {
        error: "Nicht autorisiert"
      });
    }

    const body =
      JSON.parse(
        event.body || "{}"
      );

    const {
      orderId,
      trackingToken
    } = body;

    if (
      !orderId ||
      !trackingToken
    ) {
      return json(400, {
        error:
          "Bestelldaten fehlen"
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

    const trackingHash =
      crypto
        .createHash("sha256")
        .update(
          String(
            trackingToken
          )
        )
        .digest("hex");

    if (
      trackingHash !==
      order.trackingTokenHash
    ) {
      return json(403, {
        error:
          "Ungültiger Zugriff"
      });
    }

    const {
      accessToken,
      baseUrl
    } =
      await getPayPalAccessToken();

    const siteUrl =
      String(
        process.env.URL || ""
      ).replace(/\/$/, "");

    const paypalResponse =
      await fetch(
        `${baseUrl}/v2/checkout/orders`,
        {
          method: "POST",

          headers: {
            Authorization:
              `Bearer ${accessToken}`,

            "Content-Type":
              "application/json",

            "PayPal-Request-Id":
              orderId
          },

          body:
            JSON.stringify({
              intent: "CAPTURE",

              purchase_units: [
                {
                  reference_id:
                    orderId,

                  amount: {
                    currency_code:
                      "EUR",

                    value:
                      Number(
                        order
                          .payableTotal
                      ).toFixed(2)
                  }
                }
              ],

              application_context: {
                brand_name:
                  "Pizzeria TC Ehringshausen",

                user_action:
                  "PAY_NOW",

                return_url:
                  `${siteUrl}/?payment=return&orderId=${encodeURIComponent(
                    orderId
                  )}&token=${encodeURIComponent(
                    trackingToken
                  )}`,

                cancel_url:
                  `${siteUrl}/?payment=cancel&orderId=${encodeURIComponent(
                    orderId
                  )}`
              }
            })
        }
      );

    const paypalData =
      await paypalResponse.json();

    if (!paypalResponse.ok) {
      console.error(
        paypalData
      );

      throw new Error(
        "PayPal-Bestellung konnte nicht erstellt werden."
      );
    }

    await orderRef.update({
      paypalOrderId:
        paypalData.id,

      paymentStatus:
        "pending"
    });

    const approvalLink =
      Array.isArray(
        paypalData.links
      )
        ? paypalData.links.find(
            link =>
              link.rel ===
              "approve" ||
              link.rel ===
              "payer-action"
          )
        : null;

    if (!approvalLink?.href) {
      throw new Error(
        "PayPal-Zahlungslink fehlt."
      );
    }

    return json(200, {
      approvalUrl:
        approvalLink.href,

      paypalOrderId:
        paypalData.id
    });

  } catch (error) {
    console.error(error);

    return json(500, {
      error:
        error.message ||
        "Online-Zahlung konnte nicht gestartet werden."
    });
  }
};