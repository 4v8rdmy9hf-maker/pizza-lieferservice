const admin = require("firebase-admin");


if (!admin.apps.length) {

  const raw =
    process.env.FIREBASE_SERVICE_ACCOUNT;


  if (!raw) {

    throw new Error(
      "FIREBASE_SERVICE_ACCOUNT fehlt"
    );

  }


  let serviceAccount;


  try {

    serviceAccount =
      JSON.parse(raw);

  } catch (error) {

    throw new Error(
      "FIREBASE_SERVICE_ACCOUNT ist kein gültiges JSON"
    );

  }


  admin.initializeApp({

    credential:
      admin.credential.cert(
        serviceAccount
      )

  });

}


const db =
  admin.firestore();


async function userFromEvent(
  event
) {

  const header =
    event.headers?.authorization ||
    event.headers?.Authorization ||
    "";


  if (
    !header.startsWith(
      "Bearer "
    )
  ) {

    return null;

  }


  const token =
    header
      .slice(7)
      .trim();


  if (!token) {

    return null;

  }


  try {

    return await admin
      .auth()
      .verifyIdToken(token);

  } catch (error) {

    console.error(
      "Firebase-Token ungültig:",
      error.message
    );

    return null;

  }

}


async function requireAdmin(
  event
) {

  const user =
    await userFromEvent(
      event
    );


  if (
    !user ||
    String(
      user.email || ""
    ).toLowerCase() !==
      "tahayman10@gmail.com"
  ) {

    const error =
      new Error(
        "Nicht autorisiert"
      );

    error.statusCode =
      403;

    throw error;

  }


  return user;

}


function json(
  statusCode,
  body
) {

  return {

    statusCode,

    headers: {

      "content-type":
        "application/json; charset=utf-8",

      "cache-control":
        "no-store"

    },

    body:
      JSON.stringify(
        body
      )

  };

}


module.exports = {

  admin,
  db,
  userFromEvent,
  requireAdmin,
  json

};
