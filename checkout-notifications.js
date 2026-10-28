/* Registro y anulación segura de salida de Beary's. Cargar después del script principal de Firebase. */
(function () {
  "use strict";

  const TIME_ZONE = "America/Mexico_City";
  const COLLECTION = "checkoutEvents";
  const STYLE_ID = "bearyCheckoutStyles";
  const CARD_ID = "bearyCheckoutCard";
  let boundUid = "";
  let boundDayKey = "";
  let stopSnapshot = null;
  let currentRef = null;
  let currentEvent = null;
  let eventExists = false;
  let busy = false;
  let busyAction = "";
  let cancellationNotice = false;

  function dateParts(date) {
    const parts = new Intl.DateTimeFormat("en-CA", {
      timeZone: TIME_ZONE,
      year: "numeric",
      month: "2-digit",
      day: "2-digit"
    }).formatToParts(date);
    const values = {};
    parts.forEach(function (part) {
      if (part.type !== "literal") values[part.type] = part.value;
    });
    return values;
  }

  function mexicoDayKey(date) {
    const parts = dateParts(date || new Date());
    return parts.year + "-" + parts.month + "-" + parts.day;
  }

  function setStatus(message, isError) {
    const status = document.getElementById("bearyCheckoutStatus");
    if (!status) return;
    status.textContent = message;
    status.classList.toggle("is-error", Boolean(isError));
  }

  function renderState() {
    const button = document.getElementById("bearyCheckoutButton");
    if (!button) return;

    if (!eventExists || !currentEvent) {
      button.dataset.action = "register";
      button.textContent = busy ? (busyAction === "cancel" ? "Anulando…" : "Guardando…") : "Registrar mi salida";
      button.disabled = busy;
      setStatus(cancellationNotice
        ? "Salida anulada. Ya puedes registrarla de nuevo."
        : "Al registrarla, avisaremos a todo el equipo.", false);
      return;
    }

    const sentIds = Array.isArray(currentEvent.notifiedSubscriptionIds)
      ? currentEvent.notifiedSubscriptionIds
      : [];
    if (currentEvent.notified === true) {
      button.dataset.action = "none";
      button.textContent = "Aviso enviado ✓";
      button.disabled = true;
      setStatus("El aviso ya se envió; no se puede retirar del teléfono.", false);
    } else if (currentEvent.notificationStatus === "sending") {
      button.dataset.action = "none";
      button.textContent = busy ? "Anulando…" : "Aviso en proceso…";
      button.disabled = true;
      setStatus("El aviso está empezando a enviarse. Espera a que termine.", false);
    } else if (sentIds.length > 0) {
      button.dataset.action = "none";
      button.textContent = "Aviso iniciado";
      button.disabled = true;
      setStatus("El aviso ya se envió a parte del equipo; no se puede anular para evitar duplicados.", false);
    } else {
      button.dataset.action = "cancel";
      button.textContent = busy ? "Anulando…" : "Anular salida";
      button.disabled = busy;
      setStatus("El aviso sigue pendiente. Puedes anularla y registrarla de nuevo.", false);
    }
  }

  function restoreActionButton() {
    const button = document.getElementById("bearyCheckoutButton");
    if (!button) return;
    const sentIds = currentEvent && Array.isArray(currentEvent.notifiedSubscriptionIds)
      ? currentEvent.notifiedSubscriptionIds
      : [];
    if (!eventExists || !currentEvent) {
      button.dataset.action = "register";
      button.textContent = "Registrar mi salida";
      button.disabled = false;
    } else if (currentEvent.notified === true || currentEvent.notificationStatus === "sending" || sentIds.length > 0) {
      button.dataset.action = "none";
      button.textContent = currentEvent.notified === true ? "Aviso enviado ✓" : "Aviso en proceso…";
      button.disabled = true;
    } else {
      button.dataset.action = "cancel";
      button.textContent = "Anular salida";
      button.disabled = false;
    }
  }

  function createCard() {
    if (document.getElementById(CARD_ID)) return document.getElementById(CARD_ID);
    const host = document.querySelector("#homePage .home-progress-card");
    if (!host) return null;

    if (!document.getElementById(STYLE_ID)) {
      const style = document.createElement("style");
      style.id = STYLE_ID;
      style.textContent = [
        ".beary-checkout{position:relative;z-index:1;display:flex;align-items:center;justify-content:space-between;gap:12px;margin-top:13px;padding-top:12px;border-top:1px solid var(--border);}",
        ".beary-checkout-copy{display:flex;align-items:center;gap:9px;min-width:0;}",
        ".beary-checkout-icon{display:grid;place-items:center;width:36px;height:36px;flex:0 0 36px;border-radius:12px;background:var(--pinksoft);font-size:18px;}",
        ".beary-checkout-copy strong{display:block;color:var(--text);font-size:11px;font-weight:900;}",
        ".beary-checkout-copy small{display:block;margin-top:3px;color:var(--muted);font-size:9px;line-height:1.35;}",
        ".beary-checkout-status.is-error{color:#d64764;}",
        ".beary-checkout-button{position:relative;z-index:2;flex:0 0 auto;min-height:38px;padding:9px 12px;border:0;border-radius:12px;background:var(--pink);color:#fff;font-family:inherit;font-size:10px;font-weight:800;line-height:1.2;cursor:pointer;transition:transform .18s ease,opacity .18s ease;}",
        ".beary-checkout-button[data-action=cancel]{background:transparent;color:var(--pink);border:1px solid var(--pink);}",
        ".beary-checkout-button:active:not(:disabled){transform:scale(.97);}",
        ".beary-checkout-button:disabled{opacity:.56;cursor:default;}",
        "@media(max-width:390px){.beary-checkout{align-items:stretch;flex-direction:column}.beary-checkout-button{width:100%}}",
        "@media(prefers-reduced-motion:reduce){.beary-checkout-button{transition:none}}"
      ].join("");
      document.head.appendChild(style);
    }

    const card = document.createElement("div");
    card.className = "beary-checkout";
    card.id = CARD_ID;
    card.innerHTML =
      '<div class="beary-checkout-copy">' +
        '<span class="beary-checkout-icon" aria-hidden="true">👋</span>' +
        '<span><strong>¿Ya terminaste tu turno?</strong>' +
        '<small class="beary-checkout-status" id="bearyCheckoutStatus" aria-live="polite">Inicia sesión para registrar tu salida.</small></span>' +
      '</div>' +
      '<button class="beary-checkout-button" id="bearyCheckoutButton" type="button" data-action="register" disabled>Registrar mi salida</button>';
    host.appendChild(card);
    document.getElementById("bearyCheckoutButton").addEventListener("click", handleCheckoutAction);
    return card;
  }

  function stopBinding() {
    if (typeof stopSnapshot === "function") stopSnapshot();
    stopSnapshot = null;
    currentRef = null;
    currentEvent = null;
    eventExists = false;
    boundUid = "";
    boundDayKey = "";
  }

  function bindCurrentDay() {
    createCard();
    const button = document.getElementById("bearyCheckoutButton");
    if (!button) return;

    if (typeof activeTeamProfile === "undefined" || !activeTeamProfile || !activeTeamProfile.uid) {
      stopBinding();
      cancellationNotice = false;
      button.disabled = true;
      button.dataset.action = "register";
      button.textContent = "Registrar mi salida";
      setStatus("Inicia sesión para registrar tu salida.", false);
      return;
    }
    if (typeof firebaseDb === "undefined" || typeof firebase === "undefined" || !sharedStateReady) {
      button.disabled = true;
      setStatus("Conectando con el espacio del equipo…", false);
      return;
    }

    const uid = activeTeamProfile.uid;
    const dayKey = mexicoDayKey(new Date());
    if (boundUid === uid && boundDayKey === dayKey && currentRef) return;

    stopBinding();
    cancellationNotice = false;
    boundUid = uid;
    boundDayKey = dayKey;
    const checkoutId = dayKey + "_" + uid;
    currentRef = firebaseDb.collection(COLLECTION).doc(checkoutId);
    button.disabled = true;
    button.textContent = "Cargando…";
    setStatus("Consultando el registro de hoy…", false);

    stopSnapshot = currentRef.onSnapshot(function (snapshot) {
      eventExists = snapshot.exists;
      currentEvent = snapshot.exists ? snapshot.data() : null;
      renderState();
    }, function (error) {
      console.error("No se pudo consultar la salida de hoy", error);
      button.disabled = true;
      setStatus("No se pudo consultar el registro. Revisa las reglas de Firestore.", true);
    });
  }

  async function handleCheckoutAction() {
    const button = document.getElementById("bearyCheckoutButton");
    if (!button || busy || button.disabled) return;
    if (button.dataset.action === "cancel") return cancelCheckout();
    if (button.dataset.action === "register") return registerCheckout();
  }

  async function registerCheckout() {
    const button = document.getElementById("bearyCheckoutButton");
    if (busy || !button || button.disabled) return;
    if (!navigator.onLine) {
      setStatus("Necesitas conexión para registrar la salida.", true);
      return;
    }
    if (typeof activeTeamProfile === "undefined" || !activeTeamProfile || !activeTeamProfile.uid || !sharedStateReady) {
      setStatus("Inicia sesión y espera a que cargue el espacio del equipo.", true);
      return;
    }

    busy = true;
    busyAction = "register";
    cancellationNotice = false;
    button.disabled = true;
    button.textContent = "Guardando…";
    setStatus("Registrando tu salida…", false);
    const profile = activeTeamProfile;
    const dayKey = mexicoDayKey(new Date());
    const checkoutId = dayKey + "_" + profile.uid;
    const eventRef = firebaseDb.collection(COLLECTION).doc(checkoutId);
    let failed = false;

    try {
      const created = await firebaseDb.runTransaction(async function (transaction) {
        const existing = await transaction.get(eventRef);
        if (existing.exists) return false;
        transaction.set(eventRef, {
          actorUid: profile.uid,
          actorName: String(profile.name || "Equipo Beary's").trim().slice(0, 80),
          dayKey: dayKey,
          createdAt: firebase.firestore.FieldValue.serverTimestamp(),
          notified: false
        });
        return true;
      });
      if (!created) {
        const existing = await eventRef.get();
        eventExists = existing.exists;
        currentEvent = existing.exists ? existing.data() : null;
        setStatus("Tu salida ya estaba registrada hoy.", false);
      } else {
        eventExists = true;
        currentEvent = { actorUid: profile.uid, notified: false };
        setStatus("¡Listo! Avisaremos a todo el equipo en unos minutos.", false);
      }
    } catch (error) {
      failed = true;
      console.error("No se pudo registrar la salida", error);
      const code = String(error && error.code || "");
      setStatus(code.indexOf("permission-denied") >= 0
        ? "Firestore todavía no permite registrar salidas. Revisa la regla de salida."
        : "No se pudo guardar. Revisa tu conexión e inténtalo otra vez.", true);
    } finally {
      busy = false;
      busyAction = "";
      if (!failed) renderState();
      else restoreActionButton();

    }
  }

  async function cancelCheckout() {
    const button = document.getElementById("bearyCheckoutButton");
    if (busy || !button || button.disabled || !currentRef || !activeTeamProfile) return;
    if (!navigator.onLine) {
      setStatus("Necesitas conexión para anular la salida.", true);
      return;
    }
    const eventRef = currentRef;
    const profileUid = activeTeamProfile.uid;
    const confirmed = window.confirm(
      "¿Anular tu salida de hoy? Si el aviso ya empezó a enviarse, no se podrá retirar. " +
      "Si se anula a tiempo, podrás registrarla otra vez."
    );
    if (!confirmed) return;

    busy = true;
    busyAction = "cancel";
    button.disabled = true;
    button.textContent = "Anulando…";
    setStatus("Anulando el registro…", false);
    let failed = false;
    try {
      const deleted = await firebaseDb.runTransaction(async function (transaction) {
        const snapshot = await transaction.get(eventRef);
        if (!snapshot.exists) return false;
        const event = snapshot.data() || {};
        const deliveredIds = Array.isArray(event.notifiedSubscriptionIds)
          ? event.notifiedSubscriptionIds
          : [];
        if (event.actorUid !== profileUid || event.notified !== false ||
            event.notificationStatus === "sending" || deliveredIds.length > 0) return false;
        transaction.delete(eventRef);
        return true;
      });
      if (deleted) {
        eventExists = false;
        currentEvent = null;
        cancellationNotice = true;
        setStatus("Salida anulada. Ya puedes registrarla de nuevo.", false);
      } else {
        failed = true;
        setStatus("No se anuló: el aviso ya empezó a enviarse o el registro ya no está.", true);
      }
    } catch (error) {
      failed = true;
      console.error("No se pudo anular la salida", error);
      const code = String(error && error.code || "");
      setStatus(code.indexOf("permission-denied") >= 0
        ? "No se puede anular: el aviso ya empezó a enviarse o ya se mandó a algún dispositivo."
        : "No se pudo anular. Revisa tu conexión e inténtalo otra vez.", true);
    } finally {
      busy = false;
      busyAction = "";
      if (!failed) renderState();
      else restoreActionButton();

    }
  }

  bindCurrentDay();
  window.setInterval(bindCurrentDay, 1800);
})();