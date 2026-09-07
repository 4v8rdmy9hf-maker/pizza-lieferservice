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

  p1: [
    "Pizza",
    "Margherita",
    10
  ],

  p2: [
    "Pizza",
    "Schinken Pilze",
    11.5
  ],

  p3: [
    "Pizza",
    "Rucola",
    13
  ],

  p4: [
    "Pizza",
    "Salami",
    11
  ],

  p5: [
    "Pizza",
    "Peperoni",
    11.5
  ],

  p6: [
    "Pizza",
    "Tonno",
    12
  ],

  p7: [
    "Pizza",
    "Sucuk",
    11.5
  ],

  p8: [
    "Pizza",
    "Mix",
    13
  ],

  p9: [
    "Pizza",
    "4 Käse",
    13
  ],

  p10: [
    "Pizza",
    "Vegetarisch",
    12.5
  ],

  p11: [
    "Pizza",
    "Halal",
    11.5
  ],

  b1: [
    "Beilagen",
    "Pommes",
    3.5
  ],

  b2: [
    "Beilagen",
    "Chicken Nuggets",
    4.2
  ],

  d1: [
    "Softdrinks",
    "Coca-Cola",
    4.1
  ],

  d2: [
    "Softdrinks",
    "Sprite",
    4.1
  ],

  d3: [
    "Softdrinks",
    "Fanta",
    4.1
  ],

  d4: [
    "Softdrinks",
    "Cola Zero",
    4.1
  ],

  w1: [
    "Weinflaschen",
    "Weißer Burgunder",
    19
  ],

  w2: [
    "Weinflaschen",
    "Grauburgunder",
    19
  ],

  a1: [
    "Biere",
    "Weizen",
    3.6
  ],

  a2: [
    "Biere",
    "Weizen 0,0 %",
    3.6
  ],

  a3: [
    "Biere",
    "Corona",
    3.6
  ],

  a4: [
    "Biere",
    "Pils",
    3.1
  ],

  a5: [
    "Biere",
    "Pils 0,0 %",
    3.1
  ]

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


const FREE_VEGETABLE_EXTRAS =
  new Set([

    "Champignons",
    "Brokkoli",
    "Aubergine",
    "Paprika",
    "Rucola",
    "Oliven",
    "Zwiebeln"

  ]);


const OPENING_DAY =
  "2026-10-14";


function germanDateString() {

  const now =
    new Date();

  const parts =
    new Intl.DateTimeFormat(
      "en-CA",
      {
        timeZone:
          "Europe/Berlin",

        year:
          "numeric",

        month:
          "2-digit",

        day:
          "2-digit"
      }
    ).formatToParts(now);


  const year =
    parts.find(
      p => p.type === "year"
    )?.value;


  const month =
    parts.find(
      p => p.type === "month"
    )?.value;


  const day =
    parts.find(
      p => p.type === "day"
    )?.value;


  return `${year}-${month}-${day}`;

}


function openingDiscountActive() {

  return (
    germanDateString() ===
    OPENING_DAY
  );

}


function roundMoney(value) {

  return (
    Math.round(
      Number(value) *
      100
    ) / 100
  );

}


function calculateExtraCost(
  extras
) {

  let freeVegetableUsed =
    false;

  let cost =
    0;


  for (
    const extra of extras
  ) {

    if (
      FREE_VEGETABLE_EXTRAS
        .has(extra) &&
      !freeVegetableUsed
    ) {

      freeVegetableUsed =
        true;

      continue;

    }


    cost +=
      1;

  }


  return roundMoney(
    cost
  );

}


exports.handler =
async event => {

  if (
    event.httpMethod !==
    "POST"
  ) {

    return json(
      405,
      {
        error:
          "Methode nicht erlaubt"
      }
    );

  }


  try {

    const body =
      JSON.parse(
        event.body ||
        "{}"
      );


    const user =
      await userFromEvent(
        event
      );


    const customer =
      body.customer ||
      {};


    const phone =
      String(
        customer.phone ||
        ""
      )
        .trim()
        .replace(
          /\s/g,
          ""
        );


    if (
      !customer.name ||
      !phone ||
      !customer.street ||
      !customer.houseNumber ||
      !customer.postalCode ||
      !customer.city
    ) {

      return json(
        400,
        {
          error:
            "Bitte alle Adressdaten ausfüllen."
        }
      );

    }


    if (
      !/^\+?[0-9]{8,16}$/
        .test(phone)
    ) {

      return json(
        400,
        {
          error:
            "Telefonnummer ist ungültig."
        }
      );

    }


    if (
      !/^[0-9]{5}$/
        .test(
          String(
            customer.postalCode
          )
        )
    ) {

      return json(
        400,
        {
          error:
            "PLZ ist ungültig."
        }
      );

    }


    if (
      !Array.isArray(
        body.items
      ) ||
      body.items.length < 1 ||
      body.items.length > 50
    ) {

      return json(
        400,
        {
          error:
            "Warenkorb ungültig."
        }
      );

    }


    const allowedPaymentMethods =
      new Set([
        "cash",
        "card_delivery"
      ]);


    if (
      !allowedPaymentMethods.has(
        body.paymentMethod
      )
    ) {

      return json(
        400,
        {
          error:
            "Zahlungsart ungültig."
        }
      );

    }


    if (
      body.paymentMethod ===
      "cash" &&
      (
        !user?.phone_number ||
        user.phone_number
          .replace(/\s/g, "") !==
        phone
      )
    ) {

      return json(
        403,
        {
          error:
            "Barzahlung ist nur mit SMS-verifizierter Telefonnummer möglich."
        }
      );

    }


    let grossTotal =
      0;


    const cleanItems =
      [];


    for (
      const rawItem of
      body.items
    ) {

      const menuItem =
        MENU[
          rawItem.id
        ];


      if (
        !menuItem
      ) {

        return json(
          400,
          {
            error:
              "Unbekannter Artikel."
          }
        );

      }


      const category =
        menuItem[0];


      const name =
        menuItem[1];


      const basePrice =
        Number(
          menuItem[2]
        );


      let extras =
        [];


      if (
        category === "Pizza" &&
        Array.isArray(
          rawItem.extras
        )
      ) {

        extras =
          [
            ...new Set(
              rawItem.extras
                .filter(
                  extra =>
                    EXTRAS.has(
                      extra
                    )
                )
            )
          ]
            .slice(
              0,
              20
            );

      }


      const extraCost =
        category === "Pizza"
          ? calculateExtraCost(
              extras
            )
          : 0;


      const itemTotal =
        roundMoney(
          basePrice +
          extraCost
        );


      grossTotal =
        roundMoney(
          grossTotal +
          itemTotal
        );


      cleanItems.push({

        id:
          rawItem.id,

        category,

        name,

        basePrice,

        extras,

        extraCost,

        itemTotal

      });

    }


    grossTotal =
      roundMoney(
        grossTotal
      );


    if (
      grossTotal <
      25
    ) {

      return json(
        400,
        {
          error:
            "Mindestbestellwert 25,00 €."
        }
      );

    }


    let freePizzaApplied =
      false;


    let freePizzaDiscount =
      0;


    let freePizzaItemIndex =
      null;


    if (
      body.freePizzaApplied
    ) {

      if (
        !user?.phone_number
      ) {

        return json(
          403,
          {
            error:
              "Für eine Gratis-Pizza bitte anmelden."
          }
        );

      }


      const loyaltyRef =
        db
          .collection(
            "loyalty"
          )
          .doc(
            user.uid
          );


      const loyaltySnap =
        await loyaltyRef.get();


      const loyaltyData =
        loyaltySnap.exists
          ? loyaltySnap.data()
          : {};


      const credits =
        Number(
          loyaltyData
            .freePizzaCredits ||
          0
        );


      if (
        credits < 1
      ) {

        return json(
          400,
          {
            error:
              "Keine Gratis-Pizza verfügbar."
          }
        );

      }


      if (
        body.freePizzaItemId
      ) {

        freePizzaItemIndex =
          cleanItems.findIndex(
            item =>
              item.category ===
                "Pizza" &&
              item.id ===
                body.freePizzaItemId
          );

      }


      if (
        freePizzaItemIndex === -1 ||
        freePizzaItemIndex === null
      ) {

        freePizzaItemIndex =
          cleanItems.findIndex(
            item =>
              item.category ===
              "Pizza"
          );

      }


      if (
        freePizzaItemIndex < 0
      ) {

        return json(
          400,
          {
            error:
              "Keine Pizza für die Gratis-Prämie im Warenkorb."
          }
        );

      }


      const freePizza =
        cleanItems[
          freePizzaItemIndex
        ];


      freePizzaApplied =
        true;


      freePizzaDiscount =
        roundMoney(
          freePizza.basePrice +
          freePizza.extraCost
        );

    }


    const subtotalAfterFreePizza =
      roundMoney(
        Math.max(
          0,
          grossTotal -
          freePizzaDiscount
        )
      );


    const openingDiscount =
      openingDiscountActive()
        ? roundMoney(
            subtotalAfterFreePizza *
            0.20
          )
        : 0;


    const payableTotal =
      roundMoney(
        Math.max(
          0,
          subtotalAfterFreePizza -
          openingDiscount
        )
      );


    const freeCola =
      grossTotal >=
      55;


    if (
      user?.phone_number
    ) {

      const since =
        new Date(
          Date.now() -
          30 * 60 * 1000
        ).toISOString();


      const recentOrders =
        await db
          .collection(
            "orders"
          )
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


      if (
        recentOrders.size >=
        3
      ) {

        return json(
          429,
          {
            error:
              "Maximal 3 Bestellungen innerhalb von 30 Minuten. Bitte etwas später erneut versuchen."
          }
        );

      }

    }


    const trackingToken =
      crypto
        .randomBytes(24)
        .toString("hex");


    const trackingTokenHash =
      crypto
        .createHash(
          "sha256"
        )
        .update(
          trackingToken
        )
        .digest(
          "hex"
        );


    const orderRef =
      db
        .collection(
          "orders"
        )
        .doc();


    const orderNumber =
      orderRef.id
        .slice(
          0,
          8
        )
        .toUpperCase();


    await db.runTransaction(
      async transaction => {

        if (
          freePizzaApplied
        ) {

          const loyaltyRef =
            db
              .collection(
                "loyalty"
              )
              .doc(
                user.uid
              );


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
                .freePizzaCredits ||
              0
            );


          if (
            credits < 1
          ) {

            throw new Error(
              "Gratis-Pizza wurde bereits verwendet."
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
              merge:
                true
            }
          );

        }


        transaction.set(
          orderRef,
          {

            orderNumber,

            status:
              "new",


            customer: {

              name:
                String(
                  customer.name
                ).trim(),

              phone,

              street:
                String(
                  customer.street
                ).trim(),

              houseNumber:
                String(
                  customer.houseNumber
                ).trim(),

              postalCode:
                String(
                  customer.postalCode
                ).trim(),

              city:
                String(
                  customer.city
                ).trim()

            },


            items:
              cleanItems,


            paymentMethod:
              body.paymentMethod,


            note:
              String(
                body.note ||
                ""
              )
                .trim()
                .slice(
                  0,
                  500
                ),


            grossTotal,


            freePizzaApplied,


            freePizzaItemIndex,


            freePizzaDiscount,


            openingDiscountApplied:
              openingDiscount >
              0,


            openingDiscount,


            openingDiscountPercent:
              openingDiscount >
              0
                ? 20
                : 0,


            payableTotal,


            freeCola,


            loyaltyUid:
              user?.phone_number
                ? user.uid
                : null,


            loyaltyProcessed:
              false,


            freePizzaRestored:
              false,


            capacityAtOrder:
              String(
                body.capacityAtOrder ||
                "normal"
              ),


            trackingTokenHash,


            createdAt:
              admin.firestore
                .FieldValue
                .serverTimestamp(),


            createdAtClient:
              new Date()
                .toISOString()

          }
        );

      }
    );


    try {

      await sendAdminPush(

        `Neue Bestellung #${orderNumber}`,

        `${payableTotal.toFixed(2)} € · ${String(
          customer.name
        ).trim()}`,

        {
          type:
            "admin",

          orderId:
            orderRef.id,

          url:
            "/?admin=1"
        }

      );

    } catch (
      pushError
    ) {

      console.error(
        "Admin-Push fehlgeschlagen:",
        pushError
      );

    }


    return json(
      200,
      {

        orderId:
          orderRef.id,

        orderNumber,

        trackingToken,

        paymentRequired:
          false,

        grossTotal,

        freePizzaApplied,

        freePizzaDiscount,

        openingDiscount,

        payableTotal,

        freeCola

      }
    );

  } catch (
    error
  ) {

    console.error(
      error
    );


    return json(
      error.statusCode ||
      500,
      {

        error:
          error.message ||
          "Serverfehler"

      }
    );

  }

};
