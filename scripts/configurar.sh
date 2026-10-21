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

# Trae la última versión del proyecto (correcciones publicadas en GitHub)
git pull -q --rebase --autostash 2>/dev/null || true

# ---------------------------------------------------------------- 1
paso "1/8 Herramientas"
# Instala o repara la herramienta si falta o quedó dañada (p. ej. «Permission denied»).
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
paso "2/8 Iniciar sesión en Firebase"
if firebase projects:list >/dev/null 2>&1; then
  echo "Sesión ya iniciada."
else
  aviso "Se mostrará un enlace: ábralo, elija su cuenta de Google, acepte"
  aviso "y copie el código que aparece. Péguelo aquí y pulse Enter."
  aviso "(Si pregunta por recopilar estadísticas, puede responder n)"
  # --reauth: también renueva una sesión vencida («credentials are no longer valid»).
  firebase login --reauth --no-localhost
fi

# ---------------------------------------------------------------- 3
paso "3/8 Proyecto"
read -rp "ID del proyecto Firebase [brigada-pws]: " PROJECT
PROJECT=${PROJECT:-brigada-pws}
printf '{\n  "projects": {\n    "default": "%s"\n  }\n}\n' "$PROJECT" > .firebaserc
firebase use "$PROJECT" >/dev/null
echo "Proyecto: $PROJECT"

# ---------------------------------------------------------------- 4
paso "4/8 Región"
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
paso "5/8 Datos de la organización"
ADMIN_EMAIL=""
while [[ ! "$ADMIN_EMAIL" =~ ^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$ ]]; do
  read -rp "Correo del Administrador General (será su usuario): " ADMIN_EMAIL
  ADMIN_EMAIL=$(echo "$ADMIN_EMAIL" | tr '[:upper:]' '[:lower:]' | xargs)
done
read -rp "Nombre de la empresa [Mi Empresa]: " ORG
ORG=${ORG:-Mi Empresa}

# La app se publica en Firebase Hosting: dirección propia, separada de otras apps
APP_URL="https://${PROJECT}.web.app/"
echo "Dirección de la app: $APP_URL"

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
paso "6/8 Subiendo reglas, índices y Cloud Functions (5-10 minutos)"
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
paso "7/8 Ajustando la app a la región $REGION"
if grep -q "'$REGION'" src/config/region.js; then
  echo "La app ya usa $REGION."
else
  sed -i -E "s#FUNCTIONS_REGION = '[^']*'#FUNCTIONS_REGION = '$REGION'#" src/config/region.js
  git add src/config/region.js
  git commit -qm "Región de Cloud Functions: $REGION"
  git push -q && echo "Región registrada en el repositorio."
fi

# ---------------------------------------------------------------- 8
paso "8/8 Publicando la app en $APP_URL"
VAPID=""
[ -f .env.local ] && VAPID=$(grep -E '^VITE_FIREBASE_VAPID_KEY=' .env.local | cut -d= -f2- | tr -d '"' || true)
if [ -z "$VAPID" ]; then
  aviso "Pegue la clave push web (Firebase > Configuración del proyecto > Cloud Messaging >"
  aviso "Certificados push web; es la misma del secret VITE_FIREBASE_VAPID_KEY) y pulse Enter."
  read -rp "Clave push web: " VAPID
  VAPID=$(echo "$VAPID" | tr -d '[:space:]')
fi
firebase apps:sdkconfig WEB --project "$PROJECT" --json > /tmp/sdkconfig.json
node - "$VAPID" "$ORG" "$REGION" <<'NODE'
const fs = require('fs');
const [vapid, org, region] = process.argv.slice(2);
const j = JSON.parse(fs.readFileSync('/tmp/sdkconfig.json', 'utf8'));
let c = j.result && j.result.sdkConfig;
if (!c && j.result && j.result.fileContents) {
  const m = j.result.fileContents.match(/\{[\s\S]*\}/);
  c = m ? JSON.parse(m[0]) : null;
}
if (!c || !c.apiKey) { console.error('No se pudo leer la configuración web de Firebase.'); process.exit(1); }
const q = (v) => `"${String(v || '').replace(/"/g, '')}"`;
const env = {
  VITE_FIREBASE_API_KEY: c.apiKey,
  VITE_FIREBASE_AUTH_DOMAIN: c.authDomain,
  VITE_FIREBASE_PROJECT_ID: c.projectId,
  VITE_FIREBASE_STORAGE_BUCKET: c.storageBucket,
  VITE_FIREBASE_MESSAGING_SENDER_ID: c.messagingSenderId,
  VITE_FIREBASE_APP_ID: c.appId,
  VITE_FIREBASE_VAPID_KEY: vapid,
  VITE_FUNCTIONS_REGION: region,
  VITE_ORG_NAME: org,
  VITE_BASE: '/',
};
fs.writeFileSync('.env.local', Object.entries(env).map(([k, v]) => `${k}=${q(v)}`).join('\n') + '\n');
console.log('Configuración web lista (.env.local).');
NODE
npm install --no-audit --no-fund --loglevel=error
npm run build
# Proyectos nuevos: crea el sitio por defecto (<proyecto>.web.app) si aún no existe
firebase hosting:sites:create "$PROJECT" --project "$PROJECT" --non-interactive </dev/null >/dev/null 2>&1 || true
firebase deploy --only hosting --project "$PROJECT"

echo -e "\n${V}=============================================="
echo "  ✔ Backend configurado"
echo -e "==============================================${N}"
cat <<FIN

Último paso (desde el celular):
  1. Firebase > Authentication > Usuarios > Agregar usuario
       Correo:     $ADMIN_EMAIL
       Contraseña: la que usted elija
  2. Abra $APP_URL e inicie sesión.
     (Si es la primera vez, la app le asigna el rol de Administrador General.)
  3. Instálela: Chrome ⋮ > Agregar a la pantalla principal > Instalar.

FIN
