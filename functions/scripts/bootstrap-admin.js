/**
 * Crea (o promueve) el primer Administrador General.
 *
 * Uso:
 *   cd functions
 *   export GOOGLE_APPLICATION_CREDENTIALS=/ruta/service-account.json
 *   node scripts/bootstrap-admin.js admin@empresa.com "Nombre Apellido"
 *
 * Si el usuario no existe, se crea y se imprime un enlace para definir la contraseña.
 */
const admin = require('firebase-admin');

async function main() {
  const [email, nombre = 'Administrador General'] = process.argv.slice(2);
  if (!email) {
    console.error('Uso: node scripts/bootstrap-admin.js <email> "<nombre>"');
    process.exit(1);
  }
  admin.initializeApp();
  const auth = admin.auth();
  let user;
  try {
    user = await auth.getUserByEmail(email);
  } catch {
    user = await auth.createUser({ email, displayName: nombre, password: require('node:crypto').randomBytes(24).toString('base64url') });
    console.log('Usuario creado.');
  }
  await auth.setCustomUserClaims(user.uid, { role: 'admin' });
  const { FieldValue } = admin.firestore;
  await admin.firestore().doc(`users/${user.uid}`).set(
    {
      nombre,
      email,
      role: 'admin',
      estado: 'activo',
      disponible: true,
      brigadas: [],
      certificaciones: [],
      createdAt: FieldValue.serverTimestamp(),
      claimsUpdatedAt: FieldValue.serverTimestamp(),
    },
    { merge: true },
  );
  const link = await auth.generatePasswordResetLink(email);
  console.log(`\n✔ ${email} es Administrador General (uid ${user.uid}).`);
  console.log(`Enlace para definir/restablecer contraseña:\n${link}\n`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
