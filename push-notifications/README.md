# Push gratis para el repo app-bearys

Este paquete está adaptado a `https://github.com/superzuri/app-bearys`.

## Qué contiene

- `index.html`: versión de Beary’s con la opción de activar el recordatorio push.
- `service-worker.js`: combina las notificaciones push con el modo sin conexión que ya usa la app.
- `bearys-180.png`: icono Apple que enlaza la versión nueva.
- `.github/workflows/send-bread-reminder.yml` y `push-notifications/`: envío diario a la 1:50 p. m. y prueba manual.

El repositorio ya contiene `manifest.webmanifest`, `bearys-192.png`, `bearys-512.png` y `offline.html`; consérvalos como están. No copies otro `manifest.webmanifest` encima.

## Pasos de configuración

1. Copia `index.html`, `service-worker.js` y `bearys-180.png` a la raíz del repositorio, y reemplaza esos archivos cuando GitHub lo pregunte.
2. Copia también `.github/workflows/send-bread-reminder.yml` y la carpeta `push-notifications` a la raíz. Mantén la estructura de carpetas.
3. En Firebase Console, genera una clave pública en **Configuración del proyecto → Cloud Messaging → Web Push certificates**. Pega esa clave en `FCM_VAPID_KEY` dentro de `index.html`.
4. Integra `push-notifications/firestore.rules.snippet` con las reglas existentes de Firestore.
5. Crea una cuenta de servicio de Google Cloud con `Cloud Datastore Viewer` (`roles/datastore.viewer`) y `Firebase Cloud Messaging API Admin` (`roles/firebasecloudmessaging.admin`). Guarda el JSON como secreto de repositorio llamado `FIREBASE_SERVICE_ACCOUNT_JSON` en **Settings → Secrets and variables → Actions**. No subas ese JSON al repositorio.
6. Haz commit de los archivos. GitHub Pages publicará la nueva versión en `https://superzuri.github.io/app-bearys/`.
7. Abre la app publicada e inicia sesión. Activa el recordatorio solo en tu dispositivo para comenzar la prueba.
8. En GitHub, abre **Actions → Enviar recordatorio del pan → Run workflow** y deja marcada la casilla **prueba**. Llegará un mensaje de prueba a todos los dispositivos suscritos; por eso, al principio deja activado solo el tuyo.

El envío automático usa Firebase Cloud Messaging, que no tiene costo, y GitHub Actions dentro de la cuota gratuita. GitHub puede retrasar ejecuciones programadas; la 1:50 p. m. es la hora objetivo, no una garantía exacta. En repositorios públicos, la programación se desactiva tras 60 días sin actividad y debe reactivarse.
