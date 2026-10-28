const { cert, initializeApp } = require("firebase-admin/app");
const { FieldValue, getFirestore } = require("firebase-admin/firestore");
const { getMessaging } = require("firebase-admin/messaging");

const TIME_ZONE = "America/Mexico_City";
const CHECKOUTS = "checkoutEvents";
const SUBSCRIPTIONS = "pushSubscriptions";
const REMINDER_RUNS = "checkoutReminderRuns";
const CUTOFF_MINUTES = 22 * 60 + 10;
const BATCH_SIZE = 500;

function localParts(date) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23"
  }).formatToParts(date);
  const values = {};
  parts.forEach(function (part) {
    if (part.type !== "literal") values[part.type] = part.value;
  });
  return values;
}

function dayKey(date) {
  const parts = localParts(date);
  return parts.year + "-" + parts.month + "-" + parts.day;
}

function localMinutes(date) {
  const parts = localParts(date);
  return Number(parts.hour) * 60 + Number(parts.minute);
}

function parseServiceAccount() {
  const raw = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
  if (!raw) throw new Error("Falta el secreto FIREBASE_SERVICE_ACCOUNT_JSON de GitHub Actions.");
  let credentials;
  try {
    credentials = JSON.parse(raw);
  } catch {
    throw new Error("FIREBASE_SERVICE_ACCOUNT_JSON no contiene JSON válido.");
  }
  if (!credentials.project_id || !credentials.client_email || !credentials.private_key) {
    throw new Error("El secreto no parece ser una clave JSON de cuenta de servicio.");
  }
  return credentials;
}

async function getEnabledSubscriptions(db) {
  const snapshot = await db.collection(SUBSCRIPTIONS).where("enabled", "==", true).get();
  return snapshot.docs.map(function (doc) {
    return {
      id: doc.id,
      ref: doc.ref,
      uid: String(doc.get("uid") || ""),
      token: String(doc.get("token") || "")
    };
  }).filter(function (subscription) {
    return subscription.uid && subscription.token;
  });
}

async function disableInvalidSubscriptions(subscriptions) {
  for (let offset = 0; offset < subscriptions.length; offset += BATCH_SIZE) {
    const batch = getFirestore().batch();
    subscriptions.slice(offset, offset + BATCH_SIZE).forEach(function (subscription) {
      batch.set(subscription.ref, {
        enabled: false,
        disabledAt: FieldValue.serverTimestamp(),
        disabledReason: "invalid-registration-token"
      }, { merge: true });
    });
    await batch.commit();
  }
}

async function sendToSubscriptions(subscriptions, data, onDelivered) {
  let successCount = 0;
  let failureCount = 0;
  const invalid = [];
  const messaging = getMessaging();

  for (let offset = 0; offset < subscriptions.length; offset += BATCH_SIZE) {
    const group = subscriptions.slice(offset, offset + BATCH_SIZE);
    const response = await messaging.sendEachForMulticast({
      tokens: group.map(function (subscription) { return subscription.token; }),
      data: data,
      webpush: { headers: { Urgency: "high" } }
    });
    const delivered = [];
    response.responses.forEach(function (result, index) {
      const subscription = group[index];
      if (result.success) {
        delivered.push(subscription);
        successCount += 1;
      } else {
        failureCount += 1;
        const code = String(result.error && result.error.code || "");
        if (code === "messaging/registration-token-not-registered" ||
            code === "messaging/invalid-registration-token") {
          invalid.push(subscription);
        } else {
          console.error("FCM no aceptó el dispositivo " + subscription.id + ": " + code);
        }
      }
    });
    if (delivered.length) await onDelivered(delivered);
    if (invalid.length) {
      await disableInvalidSubscriptions(invalid.splice(0, invalid.length));
    }
  }

  return { successCount: successCount, failureCount: failureCount };
}

async function sendPendingExitAlerts(db, today, subscriptions) {
  const snapshot = await db.collection(CHECKOUTS).where("notified", "==", false).get();
  const availableIds = new Set(subscriptions.map(function (subscription) { return subscription.id; }));

  for (const eventDoc of snapshot.docs) {
    const event = eventDoc.data() || {};
    if (event.dayKey !== today) {
      await eventDoc.ref.update({
        notified: true,
        notificationStatus: "expired",
        notifiedAt: FieldValue.serverTimestamp()
      });
      continue;
    }

    const actorName = String(event.actorName || "").trim();
    if (!actorName || !event.actorUid) {
      await eventDoc.ref.update({
        notified: true,
        notificationStatus: "invalid-event",
        notifiedAt: FieldValue.serverTimestamp()
      });
      continue;
    }

    const sentIds = new Set(Array.isArray(event.notifiedSubscriptionIds) ? event.notifiedSubscriptionIds : []);
    const pending = subscriptions.filter(function (subscription) { return !sentIds.has(subscription.id); });
    if (!pending.length) {
      if (subscriptions.length && subscriptions.every(function (subscription) { return sentIds.has(subscription.id); })) {
        await eventDoc.ref.update({
          notified: true,
          notificationStatus: "sent",
          notifiedAt: FieldValue.serverTimestamp()
        });
      }
      continue;
    }

    const result = await sendToSubscriptions(pending, {
      title: "Salida registrada",
      body: actorName + " ha salido ✅",
      url: "./",
      tag: "bearys-checkout-" + eventDoc.id
    }, async function (delivered) {
      const ids = delivered.map(function (subscription) { return subscription.id; });
      ids.forEach(function (id) { sentIds.add(id); });
      await eventDoc.ref.update({
        notifiedSubscriptionIds: FieldValue.arrayUnion.apply(FieldValue, ids),
        lastNotificationAttemptAt: FieldValue.serverTimestamp()
      });
    });

    const stillEnabledIds = new Set(subscriptions.map(function (subscription) { return subscription.id; }));
    const allCurrentDevicesSent = Array.from(stillEnabledIds).every(function (id) { return sentIds.has(id); });
    if (allCurrentDevicesSent && subscriptions.length) {
      await eventDoc.ref.update({
        notified: true,
        notificationStatus: result.failureCount ? "sent-with-some-errors" : "sent",
        notifiedAt: FieldValue.serverTimestamp()
      });
    } else if (!subscriptions.length && availableIds.size === 0) {
      console.log("La salida " + eventDoc.id + " queda pendiente hasta que haya dispositivos suscritos.");
    }
  }
}

async function sendClosingNudge(db, today, subscriptions, now) {
  if (localMinutes(now) < CUTOFF_MINUTES) return;

  const runRef = db.collection(REMINDER_RUNS).doc(today);
  const runSnapshot = await runRef.get();
  const sentIds = new Set(runSnapshot.exists && Array.isArray(runSnapshot.get("sentSubscriptionIds"))
    ? runSnapshot.get("sentSubscriptionIds")
    : []);

  const checkoutsSnapshot = await db.collection(CHECKOUTS).where("dayKey", "==", today).get();
  const checkedOutBeforeCutoff = new Set();
  checkoutsSnapshot.docs.forEach(function (doc) {
    const event = doc.data() || {};
    if (!event.actorUid || !event.createdAt || typeof event.createdAt.toDate !== "function") return;
    const createdAt = event.createdAt.toDate();
    if (dayKey(createdAt) === today && localMinutes(createdAt) < CUTOFF_MINUTES) {
      checkedOutBeforeCutoff.add(String(event.actorUid));
    }
  });

  const eligible = subscriptions.filter(function (subscription) {
    return !checkedOutBeforeCutoff.has(subscription.uid) && !sentIds.has(subscription.id);
  });
  if (!eligible.length) return;

  const result = await sendToSubscriptions(eligible, {
    title: "Recordatorio de cierre 🐻",
    body: "¡Ya apúrense! 😅",
    url: "./",
    tag: "bearys-closing-" + today
  }, async function (delivered) {
    const ids = delivered.map(function (subscription) { return subscription.id; });
    ids.forEach(function (id) { sentIds.add(id); });
    await runRef.set({
      dayKey: today,
      sentSubscriptionIds: FieldValue.arrayUnion.apply(FieldValue, ids),
      updatedAt: FieldValue.serverTimestamp()
    }, { merge: true });
  });

  console.log("Aviso de cierre: " + result.successCount + " dispositivo(s) aceptado(s), " +
    result.failureCount + " con error; " + checkedOutBeforeCutoff.size + " persona(s) excluida(s) por haber registrado antes de las 10:10.");
}

async function main() {
  const credentials = parseServiceAccount();
  initializeApp({ credential: cert(credentials), projectId: credentials.project_id });
  const db = getFirestore();
  const now = new Date();
  const today = dayKey(now);
  const subscriptions = await getEnabledSubscriptions(db);

  await sendPendingExitAlerts(db, today, subscriptions);
  if (process.env.BEARY_MANUAL_RUN === "true") {
    console.log("Ejecución manual: se procesaron salidas, sin disparar el aviso automático de cierre.");
  } else {
    await sendClosingNudge(db, today, subscriptions, now);
  }

  console.log("Revisión completada para " + today + " (" + TIME_ZONE + ").");
}

main().catch(function (error) {
  console.error("No se pudieron procesar las salidas:", error && error.message || error);
  process.exitCode = 1;
});