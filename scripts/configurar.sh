#!/usr/bin/env bash
# =====================================================================
#  Configuración del backend en Firebase (pensado para GitHub Codespaces,
#  funciona igual en cualquier computador con Node.js).
#
#  Uso:   bash scripts/configurar.sh
#
#  Hace: instala dependencias · inicia sesión en Firebase · detecta la
#  región · crea functions/.env · sube reglas, índices y Cloud Functions ·
#  ajusta la región en la app y la publica.
# =====================================================================
set -euo pipefail
cd "$(dirname "$0")/.."

V='\033[1;32m'; A='\033[1;33m'; R='\033[1;31m'; N='\033[0m'
paso() { echo -e "\n${V}▶ $1${N}"; }
aviso() { echo -e "${A}$1${N}"; }
error() { echo -e "${R}✖ $1${N}"; }

echo -e "${V}"
echo "=============================================="
echo "   Configuración de Brigadas de Emergencia"
echo "=============================================="
echo -e "${N}"

# ---------------------------------------------------------------- 1
paso "1/7 Herramientas"
if ! command -v firebase >/dev/null 2>&1; then
  echo "Instalando Firebase CLI (1-2 minutos)…"
  npm install -g firebase-tools --no-audit --no-fund --loglevel=error
fi
echo "Firebase CLI $(firebase --version)"

# ---------------------------------------------------------------- 2
paso "2/7 Iniciar sesión en Firebase"
if firebase projects:list >/dev/null 2>&1; then
  echo "Sesión ya iniciada."
else
  aviso "Se mostrará un enlace: ábralo, elija su cuenta de Google, acepte"
  aviso "y copie el código que aparece. Péguelo aquí y pulse Enter."
  aviso "(Si pregunta por recopilar estadísticas, puede responder n)"
  firebase login --no-localhost
fi

# ---------------------------------------------------------------- 3
paso "3/7 Proyecto"
read -rp "ID del proyecto Firebase [brigada-pws]: " PROJECT
PROJECT=${PROJECT:-brigada-pws}
printf '{\n  "projects": {\n    "default": "%s"\n  }\n}\n' "$PROJECT" > .firebaserc
firebase use "$PROJECT" >/dev/null
echo "Proyecto: $PROJECT"

# ---------------------------------------------------------------- 4
paso "4/7 Región"
LOC=$(firebase firestore:databases:get "(default)" --json 2>/dev/null \
  | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{try{const j=JSON.parse(s);console.log((j.result||j).locationId||"")}catch{console.log("")}})' || true)
case "$LOC" in
  nam5|nam7) REGION="us-central1" ;;
  eur3)      REGION="europe-west1" ;;
  "")        REGION="us-central1"; aviso "No se pudo leer la ubicación de Firestore." ;;
  *)         REGION="$LOC" ;;
esac
echo "Firestore está en: ${LOC:-desconocida}"
read -rp "Región para las Cloud Functions [$REGION]: " R_IN
REGION=${R_IN:-$REGION}

# ---------------------------------------------------------------- 5
paso "5/7 Datos de la organización"
ADMIN_EMAIL=""
while [[ ! "$ADMIN_EMAIL" =~ ^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$ ]]; do
  read -rp "Correo del Administrador General (será su usuario): " ADMIN_EMAIL
  ADMIN_EMAIL=$(echo "$ADMIN_EMAIL" | tr '[:upper:]' '[:lower:]' | xargs)
done
read -rp "Nombre de la empresa [Mi Empresa]: " ORG
ORG=${ORG:-Mi Empresa}

REMOTE=$(git config --get remote.origin.url || echo "")
OWNER=$(echo "$REMOTE" | sed -E 's#.*github.com[:/]([^/]+)/.*#\1#')
REPO=$(echo "$REMOTE" | sed -E 's#.*/([^/]+)(\.git)?$#\1#; s#\.git$##')
APP_URL_DEF="https://${OWNER}.github.io/${REPO}/"
read -rp "Dirección de la app [$APP_URL_DEF]: " APP_URL
APP_URL=${APP_URL:-$APP_URL_DEF}

[ -f functions/.env ] || cp functions/.env.example functions/.env
node - "$REGION" "$APP_URL" "$ORG" "$ADMIN_EMAIL" <<'NODE'
const fs = require('fs');
const [region, appUrl, org, email] = process.argv.slice(2);
const file = 'functions/.env';
let txt = fs.readFileSync(file, 'utf8');
const q = (v) => `"${String(v).replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`;
const set = (k, v) => {
  const line = `${k}=${q(v)}`;
  const re = new RegExp(`^${k}=.*$`, 'm');
  txt = re.test(txt) ? txt.replace(re, line) : `${txt.trimEnd()}\n${line}\n`;
};
set('FUNCTIONS_REGION', region);
set('APP_URL', appUrl);
set('ORG_NAME', org);
set('BOOTSTRAP_ADMIN_EMAIL', email);
set('TIMEZONE', 'America/Bogota');
fs.writeFileSync(file, txt);
NODE
echo "Archivo functions/.env listo."

# ---------------------------------------------------------------- 6
paso "6/7 Subiendo reglas, índices y Cloud Functions (5-10 minutos)"
(cd functions && npm install --no-audit --no-fund --loglevel=error)

firebase deploy --only firestore:rules,firestore:indexes,storage --project "$PROJECT"

desplegar_funciones() { firebase deploy --only functions --project "$PROJECT" --force; }
INTENTO=1
until desplegar_funciones; do
  if [ $INTENTO -ge 3 ]; then
    error "No se pudieron desplegar las funciones. Copie el error y envíelo para revisarlo."
    exit 1
  fi
  aviso "La primera vez Google tarda en activar permisos. Reintentando en 90 s… ($INTENTO/2)"
  sleep 90
  INTENTO=$((INTENTO + 1))
done

# ---------------------------------------------------------------- 7
paso "7/7 Ajustando la app a la región $REGION"
if grep -q "'$REGION'" src/config/region.js; then
  echo "La app ya usa $REGION."
else
  sed -i -E "s#FUNCTIONS_REGION = '[^']*'#FUNCTIONS_REGION = '$REGION'#" src/config/region.js
  git add src/config/region.js
  git commit -qm "Región de Cloud Functions: $REGION"
  git push -q && echo "Cambio subido: GitHub vuelve a publicar la app en ~3 minutos."
fi

echo -e "\n${V}=============================================="
echo "  ✔ Backend configurado"
echo -e "==============================================${N}"
cat <<FIN

Último paso (desde el celular):
  1. Firebase > Authentication > Usuarios > Agregar usuario
       Correo:     $ADMIN_EMAIL
       Contraseña: la que usted elija
  2. Abra $APP_URL e inicie sesión.
     La app le asigna automáticamente el rol de Administrador General.

FIN
