const crypto = require("crypto");
const {
  db,
  userFromEvent,
  json,
  admin
} = require("./_firebase");
const {
  sendAdminPush
} = require("./_push");

const MENU = {
  p1: ["Pizza", "Margherita", 10],
  p2: ["Pizza", "Schinken Pilze", 11.5],
  p3: ["Pizza", "Rucola", 13],
  p4: ["Pizza", "Salami", 11],
  p5: ["Pizza", "Peperoni", 11.5],
  p6: ["Pizza", "Tonno", 12],
  p7: ["Pizza", "Sucuk", 11.5],
  p8: ["Pizza", "Mix", 13],
  p9: ["Pizza", "4 Käse", 13],
  p10: ["Pizza", "Vegetarisch", 12.5],
  p11: ["Pizza", "Halal", 11.5],

  b1: ["Beilagen", "Pommes", 3.5],
  b2: ["Beilagen", "Chicken Nuggets", 4.2],

  d1: ["Softdrinks", "Coca-Cola", 4.1],
  d2: ["Softdrinks", "Sprite", 4.1],
  d3: ["Softdrinks", "Fanta", 4.1],
  d4: ["Softdrinks", "Cola Zero", 4.1],

  w1: ["Weinflaschen", "Weißer Burgunder", 19],
  w2: ["Weinflaschen", "Grauburgunder", 19],

  a1: ["Biere", "Weizen", 3.6],
  a2: ["Biere", "Weizen 0,0 %", 3.6],
  a3: ["Biere", "Corona", 3.6],
  a4: ["Biere", "Pils", 3.1],
  a5: ["Biere", "Pils 0,0 %", 3.1]
};

const EXTRAS = new Set([
  "Mozzarella",
  "Gorgonzola",
  "Parmesan",
  "Salami",
  "Schinken",
  "Parmaschinken",
  "Peperonisalami",
  "Sucuk",
  "Halal Salami",
  "Thunfisch",
  "Champignons",
  "Brokkoli",
  "Aubergine",
  "Paprika",
  "Rucola",
  "Oliven",
  "Zwiebeln"
]);

exports.handler = async event => {
  if (event.httpMethod !== "POST") {
    return json(405, {
      error: "Methode nicht erlaubt"
    });
  }

  try {
    const body = JSON.parse(event.body || "{}");
    const user = await userFromEvent(event);

    const customer = body.customer || {};

    const phone = String(
      customer.phone || ""
    ).trim();

    if (
      !customer.name ||
      !phone ||
      !customer.street ||
      !customer.houseNumber ||
      !customer.postalCode ||
      !customer.city
    ) {
      return json(400, {
        error: "Bitte alle Adressdaten ausfüllen."
      });
    }

    if (
      !/^\+?[0-9]{8,16}$/.test(
        phone.replace(/\s/g, "")
      )
    ) {
      return json(400, {
        error: "Telefonnummer ist ungültig."
      });
    }

    if (
      !/^[0-9]{5}$/.test(
        String(customer.postalCode)
      )
    ) {
      return json(400, {
        error: "PLZ ist ungültig."
      });
    }

    if (
      !Array.isArray(body.items) ||
      body.items.length < 1 ||
      body.items.length > 50
    ) {
      return json(400, {
        error: "Warenkorb ungültig."
      });
    }

    if (
      body.paymentMethod === "cash" &&
      (
        !user?.phone_number ||
        user.phone_number !== phone
      )
    ) {
      return json(403, {
        error:
          "Barzahlung ist nur mit SMS-verifizierter Telefonnummer möglich."
      });
    }

    let grossTotal = 0;
    const cleanItems = [];

    for (const rawItem of body.items) {
      const menuItem = MENU[rawItem.id];

      if (!menuItem) {
        return json(400, {
          error: "Unbekannter Artikel"
        });
      }

      const category = menuItem[0];
      const name = menuItem[1];
      const basePrice = menuItem[2];

      let extras = [];

      if (
        category === "Pizza" &&
        Array.isArray(rawItem.extras)
      ) {
        extras = rawItem.extras
          .filter(extra => EXTRAS.has(extra))
          .slice(0, 20);
      }

      const extraCost = Math.max(
        0,
        extras.length - 1
      );

      grossTotal +=
        basePrice +
        extraCost;

      cleanItems.push({
        id: rawItem.id,
        category,
        name,
        basePrice,
        extras,
        extraCost
      });
    }

    grossTotal =
      Math.round(grossTotal * 100) /
      100;

    if (grossTotal < 25) {
      return json(400, {
        error:
          "Mindestbestellwert 25,00 €."
      });
    }

    let freePizzaApplied = false;
    let freePizzaDiscount = 0;

    if (body.freePizzaApplied) {
      if (!user?.phone_number) {
        return json(403, {
          error:
            "Für eine Gratis-Pizza bitte anmelden."
        });
      }

      const loyaltyRef = db
        .collection("loyalty")
        .doc(user.uid);

      const loyaltySnap =
        await loyaltyRef.get();

      const loyaltyData =
        loyaltySnap.exists
          ? loyaltySnap.data()
          : {};

      if (
        Number(
          loyaltyData.freePizzaCredits || 0
        ) < 1
      ) {
        return json(400, {
          error:
            "Keine Gratis-Pizza verfügbar."
        });
      }

      const pizza = cleanItems.find(
        item =>
          item.category === "Pizza"
      );

      if (!pizza) {
        return json(400, {
          error:
            "Keine Pizza für die Gratis-Prämie im Warenkorb."
        });
      }

      freePizzaApplied = true;

      freePizzaDiscount =
        pizza.basePrice +
        pizza.extraCost;
    }

    const payableTotal =
      Math.round(
        Math.max(
          0,
          grossTotal -
            freePizzaDiscount
        ) * 100
      ) / 100;

    const freeCola =
      payableTotal >= 55;

    if (user?.phone_number) {
      const since = new Date(
        Date.now() -
          30 * 60 * 1000
      ).toISOString();

      const recentOrders =
        await db
          .collection("orders")
          .where(
            "loyaltyUid",
            "==",
            user.uid
          )
          .where(
            "createdAtClient",
            ">=",
            since
          )
          .get();

      if (recentOrders.size >= 3) {
        return json(429, {
          error:
            "Maximal 3 Bestellungen innerhalb von 30 Minuten. Bitte etwas später erneut versuchen."
        });
      }
    }

    const trackingToken =
      crypto
        .randomBytes(24)
        .toString("hex");

    const trackingTokenHash =
      crypto
        .createHash("sha256")
        .update(trackingToken)
        .digest("hex");

    const orderRef =
      db.collection("orders").doc();

    const orderNumber =
      orderRef.id
        .slice(0, 8)
        .toUpperCase();

    await db.runTransaction(
      async transaction => {
        if (freePizzaApplied) {
          const loyaltyRef =
            db
              .collection("loyalty")
              .doc(user.uid);

          const loyaltySnap =
            await transaction.get(
              loyaltyRef
            );

          const loyaltyData =
            loyaltySnap.exists
              ? loyaltySnap.data()
              : {};

          const credits =
            Number(
              loyaltyData
                .freePizzaCredits || 0
            );

          if (credits < 1) {
            throw new Error(
              "Gratis-Pizza bereits verwendet."
            );
          }

          transaction.set(
            loyaltyRef,
            {
              phone:
                user.phone_number,
              freePizzaCredits:
                credits - 1,
              completedOrders:
                Number(
                  loyaltyData
                    .completedOrders ||
                    0
                ),
              updatedAt:
                admin.firestore
                  .FieldValue
                  .serverTimestamp()
            },
            {
              merge: true
            }
          );
        }

        transaction.set(
          orderRef,
          {
            orderNumber,

            status:
              body.paymentMethod ===
              "online"
                ? "awaiting_payment"
                : "new",

            customer: {
              name: String(
                customer.name
              ).trim(),

              phone,

              street: String(
                customer.street
              ).trim(),

              houseNumber: String(
                customer.houseNumber
              ).trim(),

              postalCode: String(
                customer.postalCode
              ).trim(),

              city: String(
                customer.city
              ).trim()
            },

            items: cleanItems,

            paymentMethod:
              body.paymentMethod,

            note: String(
              body.note || ""
            ).slice(0, 500),

            grossTotal,

            freePizzaApplied,

            freePizzaDiscount,

            payableTotal,

            freeCola,

            loyaltyUid:
              user?.phone_number
                ? user.uid
                : null,

            loyaltyProcessed: false,

            capacityAtOrder: String(
              body.capacityAtOrder ||
                "normal"
            ),

            trackingTokenHash,

            createdAt:
              admin.firestore
                .FieldValue
                .serverTimestamp(),

            createdAtClient:
              new Date().toISOString()
          }
        );
      }
    );

    if (
      body.paymentMethod ===
      "online"
    ) {
      return json(200, {
        paymentRequired: true,
        orderId: orderRef.id,
        orderNumber,
        trackingToken
      });
    }

    try {
      await sendAdminPush(
        `Neue Bestellung #${orderNumber}`,
        `${payableTotal.toFixed(2)} € · ${customer.name}`
      );
    } catch (pushError) {
      console.error(
        "Admin-Push fehlgeschlagen:",
        pushError
      );
    }

    return json(200, {
      orderId: orderRef.id,
      orderNumber,
      trackingToken,
      paymentRequired: false
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