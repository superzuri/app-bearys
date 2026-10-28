/* Registro de salida de Beary's. Cargar este archivo después del script principal de Firebase. */
(function () {
  "use strict";

  const TIME_ZONE = "America/Mexico_City";
  const COLLECTION = "checkoutEvents";
  const STYLE_ID = "bearyCheckoutStyles";
  const CARD_ID = "bearyCheckoutCard";
  const DIALOG_ID = "bearyCheckoutDialog";
  let boundUid = "";
  let boundDayKey = "";
  let stopSnapshot = null;
  let currentRef = null;
  let busy = false;

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

  function setDialogStatus(message, isError) {
    const status = document.getElementById("bearyCheckoutDialogStatus");
    if (!status) return;
    status.textContent = message || "Al confirmar, avisaremos a todo el equipo que tenga las notificaciones activadas.";
    status.classList.toggle("is-error", Boolean(isError));
  }

  function resetDialogButtons() {
    const confirmButton = document.getElementById("bearyCheckoutConfirm");
    const cancelButton = document.getElementById("bearyCheckoutCancel");
    if (confirmButton) {
      confirmButton.disabled = false;
      confirmButton.textContent = "Sí, registrar salida";
    }
    if (cancelButton) cancelButton.disabled = false;
  }

  function closeConfirmation() {
    const dialog = document.getElementById(DIALOG_ID);
    if (dialog && dialog.open) dialog.close();
    setDialogStatus("", false);
    resetDialogButtons();
  }

  function openConfirmation() {
    if (busy) return;
    const dialog = document.getElementById(DIALOG_ID);
    if (!dialog) return;

    setDialogStatus("", false);
    resetDialogButtons();
    if (typeof dialog.showModal === "function") {
      if (!dialog.open) dialog.showModal();
      return;
    }

    if (window.confirm("¿Registrar tu salida y avisar a todo el equipo?")) {
      registerCheckout();
    }
  }

  function createStyles() {
    if (document.getElementById(STYLE_ID)) return;
    const style = document.createElement("style");
    style.id = STYLE_ID;
    style.textContent = [
      ".beary-checkout-card{position:relative;z-index:1;display:grid;grid-template-columns:minmax(0,1fr) auto;align-items:center;gap:14px;margin:0 0 20px;padding:16px;border:1px solid rgba(255,121,173,.3);border-radius:22px;background:linear-gradient(125deg,var(--surface) 25%,var(--pinksoft) 100%);box-shadow:var(--shadow)}",
      ".beary-checkout-copy{display:flex;align-items:center;gap:10px;min-width:0}",
      ".beary-checkout-icon{display:grid;place-items:center;width:42px;height:42px;flex:0 0 42px;border-radius:15px;background:var(--pinksoft);font-size:21px}",
      ".beary-checkout-copy-text{display:block;min-width:0}",
      ".beary-checkout-eyebrow{display:block;margin-bottom:3px;color:var(--pink2);font-size:8px;font-weight:950;letter-spacing:.09em}",
      ".beary-checkout-copy strong{display:block;color:var(--text);font-size:12px;font-weight:900;line-height:1.3}",
      ".beary-checkout-status{display:block;margin-top:4px;color:var(--muted);font-size:9px;line-height:1.4}",
      ".beary-checkout-status.is-error,.beary-checkout-dialog-status.is-error{color:#d64764}",
      ".beary-checkout-button{display:flex;align-items:center;justify-content:center;gap:8px;min-height:44px;padding:10px 15px;border:0;border-radius:14px;background:var(--pink);color:#fff;font-family:inherit;font-size:11px;font-weight:900;line-height:1.2;white-space:nowrap;cursor:pointer;box-shadow:0 6px 16px rgba(237,79,138,.16);transition:transform .18s ease,opacity .18s ease,box-shadow .18s ease}",
      ".beary-checkout-button:hover:not(:disabled){transform:translateY(-1px);box-shadow:0 9px 20px rgba(237,79,138,.23)}",
      ".beary-checkout-button:active:not(:disabled){transform:scale(.98)}",
      ".beary-checkout-button:disabled{opacity:.58;cursor:default;box-shadow:none}",
      ".beary-checkout-button-arrow{font-size:15px;line-height:1}",
      ".beary-checkout-dialog{width:min(420px,calc(100vw - 32px));max-width:calc(100vw - 32px);margin:auto;padding:22px;border:1px solid var(--border);border-radius:24px;background:var(--surface);color:var(--text);font-family:inherit;box-shadow:0 24px 80px rgba(22,10,18,.32)}",
      ".beary-checkout-dialog::backdrop{background:rgba(18,10,15,.52);backdrop-filter:blur(4px)}",
      ".beary-checkout-dialog[open]{animation:bearyCheckoutDialogIn .18s ease-out both}",
      ".beary-checkout-dialog-icon{display:grid;place-items:center;width:46px;height:46px;margin-bottom:13px;border-radius:16px;background:var(--pinksoft);font-size:23px}",
      ".beary-checkout-dialog h2{color:var(--text);font-size:18px;font-weight:950;line-height:1.25}",
      ".beary-checkout-dialog-copy{margin-top:8px;color:var(--muted);font-size:12px;line-height:1.55}",
      ".beary-checkout-dialog-status{min-height:17px;margin-top:9px;color:var(--muted);font-size:10px;line-height:1.4}",
      ".beary-checkout-dialog-actions{display:flex;justify-content:flex-end;gap:9px;margin-top:17px}",
      ".beary-checkout-dialog-button{min-height:42px;padding:10px 13px;border:1px solid var(--border);border-radius:13px;background:var(--surface);color:var(--text);font-family:inherit;font-size:11px;font-weight:850;cursor:pointer;transition:transform .18s ease,opacity .18s ease}",
      ".beary-checkout-dialog-button:active:not(:disabled){transform:scale(.98)}",
      ".beary-checkout-dialog-button:disabled{opacity:.58;cursor:default}",
      ".beary-checkout-dialog-button-primary{border-color:transparent;background:var(--pink);color:#fff}",
      "@keyframes bearyCheckoutDialogIn{from{opacity:0;transform:translateY(5px) scale(.985)}to{opacity:1;transform:translateY(0) scale(1)}}",
      "@media(max-width:420px){.beary-checkout-card{grid-template-columns:minmax(0,1fr);gap:12px}.beary-checkout-button{width:100%}.beary-checkout-dialog{padding:19px}.beary-checkout-dialog-actions{flex-direction:column-reverse}.beary-checkout-dialog-button{width:100%}}",
      "@media(orientation:landscape) and (min-width:900px){#homePage > .beary-checkout-card{grid-column:2;grid-row:3;margin-top:0}}",
      "@media(prefers-reduced-motion:reduce){.beary-checkout-button,.beary-checkout-dialog-button{transition:none}.beary-checkout-dialog[open]{animation:none}}"
    ].join("");
    document.head.appendChild(style);
  }

  function createDialog() {
    if (document.getElementById(DIALOG_ID)) return document.getElementById(DIALOG_ID);
    const dialog = document.createElement("dialog");
    dialog.className = "beary-checkout-dialog";
    dialog.id = DIALOG_ID;
    dialog.setAttribute("aria-labelledby", "bearyCheckoutDialogTitle");
    dialog.innerHTML =
      '<div class="beary-checkout-dialog-icon" aria-hidden="true">👋</div>' +
      '<h2 id="bearyCheckoutDialogTitle">¿Registrar tu salida?</h2>' +
      '<p class="beary-checkout-dialog-copy">Guardaremos tu salida de hoy y enviaremos un aviso al equipo.</p>' +
      '<p class="beary-checkout-dialog-status" id="bearyCheckoutDialogStatus" aria-live="polite">Al confirmar, avisaremos a todo el equipo que tenga las notificaciones activadas.</p>' +
      '<div class="beary-checkout-dialog-actions">' +
        '<button class="beary-checkout-dialog-button" id="bearyCheckoutCancel" type="button" autofocus>Cancelar</button>' +
        '<button class="beary-checkout-dialog-button beary-checkout-dialog-button-primary" id="bearyCheckoutConfirm" type="button">Sí, registrar salida</button>' +
      '</div>';
    document.body.appendChild(dialog);

    document.getElementById("bearyCheckoutCancel").addEventListener("click", closeConfirmation);
    document.getElementById("bearyCheckoutConfirm").addEventListener("click", registerCheckout);
    dialog.addEventListener("click", function (event) {
      if (event.target === dialog) closeConfirmation();
    });
    dialog.addEventListener("close", function () {
      setDialogStatus("", false);
      resetDialogButtons();
      const button = document.getElementById("bearyCheckoutButton");
      if (button && !button.disabled) {
        try { button.focus({ preventScroll: true }); } catch (error) { button.focus(); }
      }
    });
    return dialog;
  }

  function createCard() {
    const host = document.querySelector("#homePage .home-progress-card");
    if (!host) return null;

    createStyles();
    createDialog();

    let card = document.getElementById(CARD_ID);
    if (!card) {
      card = document.createElement("section");
      card.className = "beary-checkout-card";
      card.id = CARD_ID;
      card.setAttribute("aria-labelledby", "bearyCheckoutHeading");
      card.innerHTML =
        '<div class="beary-checkout-copy">' +
          '<span class="beary-checkout-icon" aria-hidden="true">👋</span>' +
          '<span class="beary-checkout-copy-text">' +
            '<span class="beary-checkout-eyebrow">MI TURNO</span>' +
            '<strong id="bearyCheckoutHeading">¿Ya terminaste tu turno?</strong>' +
            '<small class="beary-checkout-status" id="bearyCheckoutStatus" aria-live="polite">Inicia sesión para registrar tu salida.</small>' +
          '</span>' +
        '</div>' +
        '<button class="beary-checkout-button" id="bearyCheckoutButton" type="button" disabled>' +
          '<span>Registrar mi salida</span><span class="beary-checkout-button-arrow" aria-hidden="true">→</span>' +
        '</button>';
      host.insertAdjacentElement("afterend", card);
      document.getElementById("bearyCheckoutButton").addEventListener("click", openConfirmation);
    } else if (card.previousElementSibling !== host) {
      host.insertAdjacentElement("afterend", card);
    }
    return card;
  }

  function stopBinding() {
    if (typeof stopSnapshot === "function") stopSnapshot();
    stopSnapshot = null;
    currentRef = null;
    boundUid = "";
    boundDayKey = "";
  }

  function bindCurrentDay() {
    createCard();
    const button = document.getElementById("bearyCheckoutButton");
    if (!button) return;

    if (typeof activeTeamProfile === "undefined" || !activeTeamProfile || !activeTeamProfile.uid) {
      stopBinding();
      button.disabled = true;
      button.innerHTML = '<span>Registrar mi salida</span><span class="beary-checkout-button-arrow" aria-hidden="true">→</span>';
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
    boundUid = uid;
    boundDayKey = dayKey;
    const checkoutId = dayKey + "_" + uid;
    currentRef = firebaseDb.collection(COLLECTION).doc(checkoutId);
    button.disabled = true;
    button.innerHTML = '<span>Registrar mi salida</span><span class="beary-checkout-button-arrow" aria-hidden="true">→</span>';
    setStatus("Consultando el registro de hoy…", false);

    stopSnapshot = currentRef.onSnapshot(function (snapshot) {
      const currentButton = document.getElementById("bearyCheckoutButton");
      if (!currentButton) return;
      if (snapshot.exists) {
        currentButton.disabled = true;
        currentButton.innerHTML = "<span>Salida registrada ✓</span>";
        setStatus("El aviso al equipo está en proceso.", false);
      } else {
        currentButton.disabled = false;
        currentButton.innerHTML = '<span>Registrar mi salida</span><span class="beary-checkout-button-arrow" aria-hidden="true">→</span>';
        setStatus("Al registrarla, avisaremos a todo el equipo.", false);
      }
    }, function (error) {
      console.error("No se pudo consultar la salida de hoy", error);
      const currentButton = document.getElementById("bearyCheckoutButton");
      if (currentButton) currentButton.disabled = true;
      setStatus("No se pudo consultar el registro. Revisa las reglas de Firestore.", true);
    });
  }

  async function registerCheckout() {
    const button = document.getElementById("bearyCheckoutButton");
    const confirmButton = document.getElementById("bearyCheckoutConfirm");
    const cancelButton = document.getElementById("bearyCheckoutCancel");
    if (busy || !button || button.disabled) return;
    if (!navigator.onLine) {
      setStatus("Necesitas conexión para registrar la salida.", true);
      setDialogStatus("Necesitas conexión para registrar la salida.", true);
      return;
    }
    if (typeof activeTeamProfile === "undefined" || !activeTeamProfile || !activeTeamProfile.uid || !sharedStateReady) {
      setStatus("Inicia sesión y espera a que cargue el espacio del equipo.", true);
      setDialogStatus("Inicia sesión y espera a que cargue el espacio del equipo.", true);
      return;
    }

    busy = true;
    button.disabled = true;
    button.innerHTML = "<span>Guardando…</span>";
    if (confirmButton) {
      confirmButton.disabled = true;
      confirmButton.textContent = "Guardando…";
    }
    if (cancelButton) cancelButton.disabled = true;
    setStatus("Registrando tu salida…", false);
    setDialogStatus("Registrando tu salida…", false);
    const profile = activeTeamProfile;
    const dayKey = mexicoDayKey(new Date());
    const checkoutId = dayKey + "_" + profile.uid;
    const eventRef = firebaseDb.collection(COLLECTION).doc(checkoutId);

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
        setStatus("Tu salida ya estaba registrada hoy.", false);
        closeConfirmation();
        bindCurrentDay();
      } else {
        button.disabled = true;
        button.innerHTML = "<span>Salida registrada ✓</span>";
        setStatus("¡Listo! Avisaremos al equipo en unos minutos.", false);
        closeConfirmation();
      }
    } catch (error) {
      console.error("No se pudo registrar la salida", error);
      button.disabled = false;
      button.innerHTML = '<span>Registrar mi salida</span><span class="beary-checkout-button-arrow" aria-hidden="true">→</span>';
      const code = String(error && error.code || "");
      const message = code.indexOf("permission-denied") >= 0
        ? "Firestore todavía no permite registrar salidas. Revisa la regla de salida."
        : "No se pudo guardar. Revisa tu conexión e inténtalo otra vez.";
      setStatus(message, true);
      setDialogStatus(message, true);
      resetDialogButtons();
    } finally {
      busy = false;
    }
  }

  bindCurrentDay();
  window.setInterval(bindCurrentDay, 1800);
})();
