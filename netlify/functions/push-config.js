const { json } = require("./_firebase");

exports.handler = async () => {
  return json(200, {
    publicKey: process.env.VAPID_PUBLIC_KEY || ""
  });
};