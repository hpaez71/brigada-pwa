# Configurar Firebase desde el celular (sin computador)

Este espacio (GitHub Codespaces) es una terminal en la nube. Solo se usa una vez
para subir las reglas de seguridad y las Cloud Functions a Firebase.

## Pasos

1. Toque la parte de abajo de la pantalla, la pestaña **TERMINAL**.
   Si no se ve, toque el menú ☰ → **Terminal → New Terminal**.
2. Escriba exactamente esto y pulse Enter:

   ```
   bash scripts/configurar.sh
   ```

3. Responda las preguntas. Si aparece un valor entre corchetes `[ ]`,
   pulse Enter para aceptarlo:
   - **Inicio de sesión:** abra el enlace que aparece, elija su cuenta de Google,
     acepte, copie el código y péguelo en la terminal.
   - **ID del proyecto:** `brigada-pws` → Enter.
   - **Región:** Enter.
   - **Correo del administrador:** su correo.
   - **Nombre de la empresa.**
   - **Dirección de la app:** Enter.
4. Espere 5–10 minutos hasta ver **✔ Backend configurado**.

## Después

1. Firebase → **Authentication → Usuarios → Agregar usuario** con el mismo correo
   y una contraseña.
2. Abra la app e inicie sesión: queda como **Administrador General**.

## Al terminar

Detenga el Codespace para no consumir horas gratuitas:
<https://github.com/codespaces> → ⋯ → **Stop codespace** (o **Delete**).
