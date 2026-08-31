const {
  db,
  requireAdmin,
  json,
  admin
} = require("./_firebase");

const {
  sendOrderPush
} = require("./_push");

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

    const orderRef = db
      .collection("orders")
      .doc(body.orderId);

    const orderSnap =
      await orderRef.get();

    if (!orderSnap.exists) {
      return json(404, {
        error:
          "Bestellung nicht gefunden"
      });
    }

    const allowedStatuses = [
      "accepted",
      "preparing",
      "on_the_way",
      "completed",
      "cancelled"
    ];

    if (
      !allowedStatuses.includes(
        body.status
      )
    ) {
      return json(400, {
        error: "Status ungültig"
      });
    }

    if (body.status === "accepted") {
      const deliveryMinutes =
        Number(body.deliveryMinutes);

      if (
        !Number.isFinite(
          deliveryMinutes
        ) ||
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

      await sendOrderPush(
        body.orderId,
        "Bestellung angenommen",
        `Voraussichtliche Lieferzeit: ca. ${deliveryMinutes} Minuten.`,
        {
          status: "accepted"
        }
      );

      return json(200, {
        ok: true
      });
    }

    if (body.status === "completed") {
      await db.runTransaction(
        async transaction => {
          const freshOrderSnap =
            await transaction.get(
              orderRef
            );

          const order =
            freshOrderSnap.data();

          if (
            order.loyaltyProcessed
          ) {
            transaction.update(
              orderRef,
              {
                status:
                  "completed"
              }
            );

            return;
          }

          if (order.loyaltyUid) {
            const loyaltyRef =
              db
                .collection(
                  "loyalty"
                )
                .doc(
                  order.loyaltyUid
                );

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
                loyalty
                  .completedOrders ||
                  0
              );

            const newCompleted =
              oldCompleted + 1;

            const oldTens =
              Math.floor(
                oldCompleted / 10
              );

            const newTens =
              Math.floor(
                newCompleted / 10
              );

            const earned =
              newTens - oldTens;

            transaction.set(
              loyaltyRef,
              {
                phone:
                  loyalty.phone ||
                  order.customer
                    .phone,

                completedOrders:
                  newCompleted,

                freePizzaCredits:
                  Number(
                    loyalty
                      .freePizzaCredits ||
                      0
                  ) + earned,

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
              status:
                "completed",

              loyaltyProcessed:
                true,

              completedAt:
                admin.firestore
                  .FieldValue
                  .serverTimestamp()
            }
          );
        }
      );

      await sendOrderPush(
        body.orderId,
        "Bestellung abgeschlossen",
        "Vielen Dank für deine Bestellung.",
        {
          status: "completed"
        }
      );

      return json(200, {
        ok: true
      });
    }

    await orderRef.update({
      status: body.status
    });

    const messages = {
      preparing: {
        title:
          "Bestellung in Zubereitung",
        body:
          "Deine Bestellung wird jetzt zubereitet."
      },

      on_the_way: {
        title:
          "Bestellung unterwegs",
        body:
          "Deine Bestellung ist auf dem Weg zu dir."
      },

      cancelled: {
        title:
          "Bestellung storniert",
        body:
          "Die Bestellung wurde storniert."
      }
    };

    if (messages[body.status]) {
      await sendOrderPush(
        body.orderId,
        messages[body.status]
          .title,
        messages[body.status]
          .body,
        {
          status: body.status
        }
      );
    }

    return json(200, {
      ok: true
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