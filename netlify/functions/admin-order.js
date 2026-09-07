const {
  db,
  requireAdmin,
  json,
  admin
} = require("./_firebase");

const {
  sendOrderPush
} = require("./_push");


const ALLOWED_STATUSES = new Set([
  "accepted",
  "preparing",
  "on_the_way",
  "completed",
  "cancelled"
]);


const ALLOWED_TRANSITIONS = {
  new: [
    "accepted",
    "cancelled"
  ],

  accepted: [
    "preparing",
    "cancelled"
  ],

  preparing: [
    "on_the_way",
    "completed",
    "cancelled"
  ],

  on_the_way: [
    "completed",
    "cancelled"
  ],

  completed: [],

  cancelled: []
};


async function safePush(
  orderId,
  title,
  body,
  status
) {
  try {

    await sendOrderPush(
      orderId,
      title,
      body,
      {
        type: "order",
        orderId,
        status,
        url: "/"
      }
    );

  } catch (error) {

    console.error(
      "Kunden-Push fehlgeschlagen:",
      error
    );

  }
}


exports.handler = async event => {

  if (event.httpMethod !== "POST") {

    return json(405, {
      error: "Methode nicht erlaubt"
    });

  }


  try {

    await requireAdmin(event);


    const body = JSON.parse(
      event.body || "{}"
    );


    const orderId = String(
      body.orderId || ""
    ).trim();


    const newStatus = String(
      body.status || ""
    ).trim();


    if (!orderId) {

      return json(400, {
        error: "Bestell-ID fehlt."
      });

    }


    if (!ALLOWED_STATUSES.has(newStatus)) {

      return json(400, {
        error: "Status ungültig."
      });

    }


    const orderRef = db
      .collection("orders")
      .doc(orderId);


    const orderSnap =
      await orderRef.get();


    if (!orderSnap.exists) {

      return json(404, {
        error: "Bestellung nicht gefunden."
      });

    }


    const currentOrder =
      orderSnap.data();


    const currentStatus =
      currentOrder.status || "new";


    if (currentStatus === newStatus) {

      return json(200, {
        ok: true,
        status: currentStatus
      });

    }


    const possibleTransitions =
      ALLOWED_TRANSITIONS[currentStatus] || [];


    if (!possibleTransitions.includes(newStatus)) {

      return json(400, {
        error:
          `Statuswechsel von ${currentStatus} zu ${newStatus} ist nicht erlaubt.`
      });

    }


    /*
      BESTELLUNG ANNEHMEN
    */

    if (newStatus === "accepted") {

      const deliveryMinutes =
        Number(body.deliveryMinutes);


      if (
        !Number.isFinite(deliveryMinutes) ||
        deliveryMinutes < 30
      ) {

        return json(400, {
          error:
            "Lieferzeit muss mindestens 30 Minuten sein."
        });

      }


      await orderRef.update({

        status: "accepted",

        deliveryMinutes,

        acceptedAt:
          admin.firestore
            .FieldValue
            .serverTimestamp()

      });


      await safePush(
        orderId,
        "Bestellung angenommen",
        `Voraussichtliche Lieferzeit: ca. ${deliveryMinutes} Minuten.`,
        "accepted"
      );


      return json(200, {
        ok: true,
        status: "accepted"
      });

    }


    /*
      BESTELLUNG STORNIEREN

      Falls eine Gratis-Pizza benutzt wurde,
      wird der Treuepunkt wieder zurückgegeben.
    */

    if (newStatus === "cancelled") {

      await db.runTransaction(
        async transaction => {

          const freshOrderSnap =
            await transaction.get(orderRef);


          if (!freshOrderSnap.exists) {

            throw new Error(
              "Bestellung nicht gefunden."
            );

          }


          const order =
            freshOrderSnap.data();


          if (
            order.freePizzaApplied &&
            order.loyaltyUid &&
            !order.freePizzaRestored
          ) {

            const loyaltyRef =
              db
                .collection("loyalty")
                .doc(order.loyaltyUid);


            const loyaltySnap =
              await transaction.get(
                loyaltyRef
              );


            const loyalty =
              loyaltySnap.exists
                ? loyaltySnap.data()
                : {};


            transaction.set(
              loyaltyRef,
              {

                phone:
                  loyalty.phone ||
                  order.customer?.phone ||
                  "",

                completedOrders:
                  Number(
                    loyalty.completedOrders ||
                    0
                  ),

                freePizzaCredits:
                  Number(
                    loyalty.freePizzaCredits ||
                    0
                  ) + 1,

                updatedAt:
                  admin.firestore
                    .FieldValue
                    .serverTimestamp()

              },
              {
                merge: true
              }
            );


            transaction.update(
              orderRef,
              {

                status: "cancelled",

                freePizzaRestored: true,

                cancelledAt:
                  admin.firestore
                    .FieldValue
                    .serverTimestamp()

              }
            );

          } else {

            transaction.update(
              orderRef,
              {

                status: "cancelled",

                cancelledAt:
                  admin.firestore
                    .FieldValue
                    .serverTimestamp()

              }
            );

          }

        }
      );


      await safePush(
        orderId,
        "Bestellung storniert",
        "Deine Bestellung wurde storniert.",
        "cancelled"
      );


      return json(200, {
        ok: true,
        status: "cancelled"
      });

    }


    /*
      BESTELLUNG ABGESCHLOSSEN

      Jede abgeschlossene Bestellung zählt
      für das Treueprogramm.

      Nach jeder 10. abgeschlossenen Bestellung
      gibt es eine Gratis-Pizza.
    */

    if (newStatus === "completed") {

      let earnedFreePizza = 0;


      await db.runTransaction(
        async transaction => {

          const freshOrderSnap =
            await transaction.get(orderRef);


          if (!freshOrderSnap.exists) {

            throw new Error(
              "Bestellung nicht gefunden."
            );

          }


          const order =
            freshOrderSnap.data();


          if (order.loyaltyProcessed) {

            transaction.update(
              orderRef,
              {

                status: "completed",

                completedAt:
                  admin.firestore
                    .FieldValue
                    .serverTimestamp()

              }
            );

            return;

          }


          if (order.loyaltyUid) {

            const loyaltyRef =
              db
                .collection("loyalty")
                .doc(order.loyaltyUid);


            const loyaltySnap =
              await transaction.get(
                loyaltyRef
              );


            const loyalty =
              loyaltySnap.exists
                ? loyaltySnap.data()
                : {};


            const oldCompleted =
              Number(
                loyalty.completedOrders ||
                0
              );


            const newCompleted =
              oldCompleted + 1;


            const oldLevel =
              Math.floor(
                oldCompleted / 10
              );


            const newLevel =
              Math.floor(
                newCompleted / 10
              );


            earnedFreePizza =
              Math.max(
                0,
                newLevel - oldLevel
              );


            transaction.set(
              loyaltyRef,
              {

                phone:
                  loyalty.phone ||
                  order.customer?.phone ||
                  "",

                completedOrders:
                  newCompleted,

                freePizzaCredits:
                  Number(
                    loyalty.freePizzaCredits ||
                    0
                  ) +
                  earnedFreePizza,

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


          transaction.update(
            orderRef,
            {

              status: "completed",

              loyaltyProcessed: true,

              completedAt:
                admin.firestore
                  .FieldValue
                  .serverTimestamp()

            }
          );

        }
      );


      if (earnedFreePizza > 0) {

        await safePush(
          orderId,
          "Gratis-Pizza verdient",
          "Das war deine 10. abgeschlossene Bestellung. Du hast jetzt eine Gratis-Pizza.",
          "completed"
        );

      } else {

        await safePush(
          orderId,
          "Bestellung abgeschlossen",
          "Vielen Dank für deine Bestellung bei Pizzeria La Piazza.",
          "completed"
        );

      }


      return json(200, {
        ok: true,
        status: "completed",
        earnedFreePizza
      });

    }


    /*
      ZUBEREITUNG / UNTERWEGS
    */

    await orderRef.update({

      status: newStatus,

      statusUpdatedAt:
        admin.firestore
          .FieldValue
          .serverTimestamp()

    });


    if (newStatus === "preparing") {

      await safePush(
        orderId,
        "Bestellung in Zubereitung",
        "Deine Bestellung wird jetzt zubereitet.",
        "preparing"
      );

    }


    if (newStatus === "on_the_way") {

      await safePush(
        orderId,
        "Bestellung unterwegs",
        "Deine Bestellung ist auf dem Weg zu dir.",
        "on_the_way"
      );

    }


    return json(200, {
      ok: true,
      status: newStatus
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
