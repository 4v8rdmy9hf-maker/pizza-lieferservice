self.addEventListener("push", event => {

  let payload = {
    title: "Pizzeria La Piazza",
    body: "Neue Nachricht",
    data: {}
  };

  try {

    if (event.data) {

      const incoming =
        event.data.json();

      payload = {
        ...payload,
        ...incoming,
        data: {
          ...(payload.data || {}),
          ...(incoming.data || {})
        }
      };

    }

  } catch (error) {

    console.error(
      "Push-Daten konnten nicht gelesen werden:",
      error
    );

  }


  const options = {

    body:
      payload.body,

    icon:
      "/icon-192.png",

    badge:
      "/icon-192.png",

    data:
      payload.data || {},

    vibrate: [
      250,
      100,
      250,
      100,
      400
    ],

    requireInteraction:
      true

  };


  event.waitUntil(

    self.registration
      .showNotification(
        payload.title,
        options
      )

  );

});


self.addEventListener(
  "notificationclick",
  event => {

    event.notification.close();


    const data =
      event.notification.data ||
      {};


    let targetUrl =
      "/";


    if (
      data.url &&
      typeof data.url === "string"
    ) {

      targetUrl =
        data.url;

    } else if (
      data.type === "admin"
    ) {

      targetUrl =
        "/?admin=1";

    }


    const absoluteUrl =
      new URL(
        targetUrl,
        self.location.origin
      ).href;


    event.waitUntil(

      clients
        .matchAll({
          type: "window",
          includeUncontrolled: true
        })
        .then(
          windowClients => {

            for (
              const client of
              windowClients
            ) {

              try {

                const clientUrl =
                  new URL(
                    client.url
                  );


                const target =
                  new URL(
                    absoluteUrl
                  );


                if (
                  clientUrl.origin ===
                  target.origin
                ) {

                  if (
                    "navigate" in client
                  ) {

                    return client
                      .navigate(
                        absoluteUrl
                      )
                      .then(
                        () =>
                          client.focus()
                      );

                  }


                  return client.focus();

                }

              } catch (error) {

                console.error(
                  error
                );

              }

            }


            if (
              clients.openWindow
            ) {

              return clients
                .openWindow(
                  absoluteUrl
                );

            }

          }
        )

    );

  }
);
