const {
  db,
  requireAdmin,
  json
} = require("./_firebase");

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

    const update = {};

    if (
      ["auto", "open", "closed"].includes(
        body.manualStatus
      )
    ) {
      update.manualStatus =
        body.manualStatus;
    }

    if (
      [
        "normal",
        "40",
        "60",
        "90",
        "stop"
      ].includes(
        String(body.capacity)
      )
    ) {
      update.capacity =
        String(body.capacity);
    }

    await db
      .collection("settings")
      .doc("public")
      .set(
        update,
        {
          merge: true
        }
      );

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