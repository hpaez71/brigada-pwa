#!/usr/bin/env bash
# =====================================================================
#  Inactiva Brigadas de Emergencia en Firebase (desde GitHub Codespaces).
#
#  Uso:   bash scripts/inactivar.sh
#
#  Hace (sin borrar datos):
#   1. Bloquea la base de datos y los archivos: nadie puede leer ni escribir.
#   2. Elimina las funciones del servidor (alertas, escalamiento, tareas
#      programadas), que son lo único que puede generar consumo.
#   3. Publica un aviso de «aplicación inactiva» y desinstala la versión
#      guardada en celulares y computadores.
#  Para reactivarla basta con volver a ejecutar scripts/configurar.sh.
# =====================================================================
set -euo pipefail
cd "$(dirname "$0")/.."

V='\033[1;32m'; A='\033[1;33m'; R='\033[1;31m'; N='\033[0m'
paso() { echo -e "\n${V}▶ $1${N}"; }
aviso() { echo -e "${A}$1${N}"; }

echo -e "${R}"
echo "=============================================="
echo "   Inactivar Brigadas de Emergencia"
echo "=============================================="
echo -e "${N}"

git pull -q --rebase --autostash 2>/dev/null || true

# ---------------------------------------------------------------- 1
paso "1/5 Herramientas"
if ! firebase --version >/dev/null 2>&1; then
  echo "Instalando Firebase CLI (1-2 minutos)…"
  npm install -g firebase-tools --no-audit --no-fund --loglevel=error || true
  hash -r
fi
if ! firebase --version >/dev/null 2>&1; then
  aviso "Usando Firebase CLI mediante npx (más lento la primera vez)."
  firebase() { npx -y firebase-tools "$@"; }
fi
echo "Firebase CLI $(firebase --version)"

# ---------------------------------------------------------------- 2
paso "2/5 Sesión y proyecto"
if ! firebase projects:list >/dev/null 2>&1; then
  aviso "Abra el enlace, elija su cuenta de Google, acepte y pegue aquí el código."
  firebase login --reauth --no-localhost
fi
DEF=$(node -e 'try{console.log(require("./.firebaserc").projects.default||"")}catch{console.log("")}')
read -rp "ID del proyecto Firebase [${DEF:-brigada-pws}]: " PROJECT
PROJECT=${PROJECT:-${DEF:-brigada-pws}}
REGION=$(sed -n "s/.*FUNCTIONS_REGION = '\(.*\)'.*/\1/p" src/config/region.js)
REGION=${REGION:-us-central1}
echo "Proyecto: $PROJECT · Región de funciones: $REGION"
echo
aviso "La app dejará de funcionar para todos los usuarios. Los datos NO se borran."
read -rp "Escriba INACTIVAR para continuar: " OK
[ "$OK" = "INACTIVAR" ] || { echo "Cancelado. No se cambió nada."; exit 1; }

# ---------------------------------------------------------------- 3
paso "3/5 Bloquear base de datos y archivos"
firebase deploy --config inactiva/firebase.json --project "$PROJECT" --only firestore:rules,storage --non-interactive

# ---------------------------------------------------------------- 4
paso "4/5 Eliminar funciones del servidor"
FUNCS="onEmergenciaCreada onEmergenciaActualizada onRespuestaEscrita onAlertaApoyoCreada onTokenEscrito onUserWritten onMensajeCreado crearUsuario asignarRol reclamarAdmin registrarSolicitud aprobarUsuario escalarSinRespuesta revisarCertificaciones"
for f in $FUNCS; do
  if firebase functions:delete "$f" --region "$REGION" --project "$PROJECT" --force --non-interactive >/dev/null 2>&1; then
    echo "  ✔ $f"
  else
    echo "  · $f (no existía o ya estaba eliminada)"
  fi
done
echo "Funciones restantes en el proyecto:"
firebase functions:list --project "$PROJECT" 2>/dev/null || true

# ---------------------------------------------------------------- 5
paso "5/5 Publicar aviso de aplicación inactiva"
firebase deploy --config inactiva/firebase.json --project "$PROJECT" --only hosting --non-interactive

echo -e "\n${V}✔ Aplicación inactivada.${N}"
echo "  · https://${PROJECT}.web.app muestra el aviso de app inactiva."
echo "  · Los datos y archivos se conservan, bloqueados."
echo
aviso "Para no tener ningún cargo posible, cambie el plan a Spark (gratuito):"
echo "  Firebase → Configuración del proyecto ⚙ → Uso y facturación → Detalles y"
echo "  configuración → Modificar plan → Spark."
echo "  https://console.firebase.google.com/project/${PROJECT}/usage/details"
