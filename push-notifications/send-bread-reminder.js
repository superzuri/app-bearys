const { cert, initializeApp } = require("firebase-admin/app");
const { getFirestore } = require("firebase-admin/firestore");
const { getMessaging } = require("firebase-admin/messaging");

const COLLECTION = "pushSubscriptions";
const MAX_BATCH_SIZE = 500;

async function main() {
  const rawCredentials = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
  if (!rawCredentials) throw new Error("Falta el secreto FIREBASE_SERVICE_ACCOUNT_JSON de GitHub Actions.");

  let serviceAccount;
  try {
    serviceAccount = JSON.parse(rawCredentials);
  } catch {
    throw new Error("El secreto FIREBASE_SERVICE_ACCOUNT_JSON no contiene JSON válido.");
  }
  if (!serviceAccount.project_id || !serviceAccount.client_email || !serviceAccount.private_key) {
    throw new Error("El secreto no parece ser una clave JSON de cuenta de servicio de Firebase.");
  }

  initializeApp({ credential: cert(serviceAccount), projectId: serviceAccount.project_id });
  const snapshot = await getFirestore().collection(COLLECTION)
    .where("enabled", "==", true)
    .get();
  const tokens = snapshot.docs
    .map(doc => doc.get("token"))
    .filter(token => typeof token === "string" && token.length > 0);

  if (tokens.length === 0) {
    console.log("No hay dispositivos suscritos; no se envió ninguna notificación.");
    return;
  }

  const testMode = process.env.BEARY_PUSH_TEST_MODE === "true";
  const message = {
    data: {
      title: "!Recordatorio de Beary¡ 🐻",
      body: "¡Ya toca enviar el pan chicuelos y chicuelas! 🍞✨",
      url: "./",
      tag: testMode ? "bearys-push-test" : "bearys-bread-reminder"
    },
    webpush: { headers: { Urgency: "high" } }
  };

  let successes = 0;
  let failures = 0;
  const messaging = getMessaging();

  for (let offset = 0; offset < tokens.length; offset += MAX_BATCH_SIZE) {
    const batch = tokens.slice(offset, offset + MAX_BATCH_SIZE);
    const result = await messaging.sendEachForMulticast({ ...message, tokens: batch });
    successes += result.successCount;
    failures += result.failureCount;
  }

  console.log(`${testMode ? "Prueba" : "Recordatorio"}: ${successes} dispositivo(s) aceptado(s), ${failures} con error.`);
  if (successes === 0 && failures > 0) process.exitCode = 1;
}

main().catch(error => {
  console.error("No se pudo enviar el recordatorio:", error.message);
  process.exitCode = 1;
});

