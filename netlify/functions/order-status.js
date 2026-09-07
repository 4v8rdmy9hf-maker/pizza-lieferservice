const crypto = require("crypto");

const {
  db,
  json
} = require("./_firebase");


exports.handler = async event => {

  try {

    const orderId =
      String(
        event.queryStringParameters?.id ||
        ""
      ).trim();


    const trackingToken =
      String(
        event.queryStringParameters?.token ||
        ""
      ).trim();


    if (
      !orderId ||
      !trackingToken
    ) {

      return json(
        400,
        {
          error:
            "Bestelldaten fehlen."
        }
      );

    }


    const orderSnap =
      await db
        .collection("orders")
        .doc(orderId)
        .get();


    if (
      !orderSnap.exists
    ) {

      return json(
        404,
        {
          error:
            "Bestellung nicht gefunden."
        }
      );

    }


    const order =
      orderSnap.data();


    const hash =
      crypto
        .createHash("sha256")
        .update(
          trackingToken
        )
        .digest("hex");


    if (
      hash !==
      order.trackingTokenHash
    ) {

      return json(
        403,
        {
          error:
            "Ungültiger Zugriff."
        }
      );

    }


    return json(
      200,
      {

        orderNumber:
          order.orderNumber,


        status:
          order.status,


        deliveryMinutes:
          order.deliveryMinutes ||
          null,


        grossTotal:
          Number(
            order.grossTotal ||
            0
          ),


        freePizzaApplied:
          !!order.freePizzaApplied,


        freePizzaDiscount:
          Number(
            order.freePizzaDiscount ||
            0
          ),


        openingDiscountApplied:
          !!order.openingDiscountApplied,


        openingDiscountPercent:
          Number(
            order.openingDiscountPercent ||
            0
          ),


        openingDiscount:
          Number(
            order.openingDiscount ||
            0
          ),


        freeCola:
          !!order.freeCola,


        payableTotal:
          Number(
            order.payableTotal ||
            0
          ),


        paymentMethod:
          order.paymentMethod || null,


        createdAtClient:
          order.createdAtClient ||
          null

      }
    );


  } catch (error) {

    console.error(
      error
    );


    return json(
      500,
      {
        error:
          error.message ||
          "Status konnte nicht geladen werden."
      }
    );

  }

};
