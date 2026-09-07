const {
  json
} = require("./_firebase");


exports.handler = async event => {

  if (event.httpMethod !== "GET") {

    return json(
      405,
      {
        error:
          "Methode nicht erlaubt"
      }
    );

  }


  try {

    const publicKey =
      process.env.VAPID_PUBLIC_KEY ||
      "";


    if (!publicKey) {

      return json(
        500,
        {
          error:
            "Push-Konfiguration fehlt"
        }
      );

    }


    return json(
      200,
      {
        publicKey
      }
    );


  } catch (error) {

    console.error(error);


    return json(
      500,
      {
        error:
          "Push-Konfiguration konnte nicht geladen werden"
      }
    );

  }

};
