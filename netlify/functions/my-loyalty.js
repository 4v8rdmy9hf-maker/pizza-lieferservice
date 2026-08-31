const {
  db,
  userFromEvent,
  json
} = require("./_firebase");

exports.handler = async event => {
  try {
    const user =
      await userFromEvent(event);

    if (!user?.phone_number) {
      return json(401, {
        error:
          "Telefon-Anmeldung erforderlich"
      });
    }

    const loyaltyRef = db
      .collection("loyalty")
      .doc(user.uid);

    const snapshot =
      await loyaltyRef.get();

    if (!snapshot.exists) {
      await loyaltyRef.set({
        phone: user.phone_number,
        completedOrders: 0,
        freePizzaCredits: 0
      });

      return json(200, {
        completedOrders: 0,
        freePizzaCredits: 0
      });
    }

    const data = snapshot.data();

    return json(200, {
      completedOrders:
        Number(
          data.completedOrders || 0
        ),

      freePizzaCredits:
        Number(
          data.freePizzaCredits || 0
        )
    });

  } catch (error) {
    console.error(error);

    return json(500, {
      error:
        error.message ||
        "Treuekonto konnte nicht geladen werden"
    });
  }
};