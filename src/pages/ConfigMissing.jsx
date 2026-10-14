// Pantalla sin dependencias de MUI ni Firebase: se muestra si falta el .env
export default function ConfigMissing() {
  return (
    <div style={{ fontFamily: 'system-ui, sans-serif', maxWidth: 640, margin: '10vh auto', padding: 24, lineHeight: 1.5 }}>
      <h1 style={{ color: '#B71C1C' }}>Configuración pendiente</h1>
      <p>
        No se encontraron las variables de Firebase. Copie <code>.env.example</code> como <code>.env.local</code> y
        complete los valores de su proyecto, o configure los <em>secrets</em> del repositorio para GitHub Actions.
      </p>
      <p>Consulte <code>docs/DESPLIEGUE.md</code> para el paso a paso.</p>
    </div>
  );
}
