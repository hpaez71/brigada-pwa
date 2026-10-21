import { Component } from 'react';
import { Alert, Box, Button, Stack, Typography } from '@mui/material';

const RELOAD_KEY = 'brigadas.reloadChunk';

/** Error al descargar una pantalla: típico después de publicar una versión nueva. */
export function isChunkError(error) {
  const msg = String(error?.message || error || '');
  return /dynamically imported module|Importing a module script failed|error loading dynamically|MIME type|ChunkLoadError|Loading chunk|Failed to fetch/i.test(msg);
}

/** Recarga una sola vez por minuto para traer la versión nueva sin entrar en bucle. */
export function reloadForUpdate() {
  try {
    const last = Number(sessionStorage.getItem(RELOAD_KEY) || 0);
    if (Date.now() - last < 60000) return false;
    sessionStorage.setItem(RELOAD_KEY, String(Date.now()));
  } catch {
    /* almacenamiento no disponible: recarga igual */
  }
  window.location.reload();
  return true;
}

/**
 * Evita la pantalla en blanco: si una pantalla falla, muestra el error y permite reintentar
 * sin perder el resto de la aplicación.
 */
export default class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { error: null, reloading: false, stack: '' };
  }

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error, info) {
    console.error('Error en pantalla:', error, info?.componentStack);
    const comp = String(info?.componentStack || '').split('\n').map((l) => l.trim()).filter(Boolean).slice(0, 6).join('\n');
    const st = String(error?.stack || '').split('\n').slice(0, 5).join('\n');
    this.setState({ stack: `${st}\n--- componentes ---\n${comp}` });
    if (isChunkError(error) && reloadForUpdate()) this.setState({ reloading: true });
  }

  componentDidUpdate(prev) {
    if (this.state.error && prev.resetKey !== this.props.resetKey) this.setState({ error: null, reloading: false });
  }

  render() {
    const { error, reloading } = this.state;
    if (!error) return this.props.children;
    const update = isChunkError(error);
    return (
      <Box sx={{ p: 3, display: 'grid', placeItems: 'center', minHeight: this.props.full ? '100vh' : 320 }}>
        <Stack spacing={2} sx={{ maxWidth: 520, width: '100%' }}>
          <Typography variant="h6" fontWeight={700}>
            {update ? 'Hay una versión nueva de la aplicación' : 'No se pudo mostrar esta pantalla'}
          </Typography>
          <Typography color="text.secondary">
            {reloading
              ? 'Actualizando…'
              : update
                ? 'Toque «Recargar» para descargar la versión más reciente.'
                : 'Puede reintentar o recargar la aplicación. Si el problema continúa, envíe una captura de este mensaje al administrador.'}
          </Typography>
          {!update && (
            <Alert severity="error" sx={{ wordBreak: 'break-word' }}>
              {String(error?.message || error)}
            </Alert>
          )}
          {!update && this.state.stack && (
            <Box component="pre" sx={{ m: 0, p: 1, bgcolor: 'action.hover', borderRadius: 1, fontSize: 10, whiteSpace: 'pre-wrap', wordBreak: 'break-all', maxHeight: 220, overflow: 'auto' }}>
              {`Ruta: ${window.location.hash}\n${this.state.stack}`}
            </Box>
          )}
          <Stack direction="row" spacing={1}>
            {!update && <Button onClick={() => this.setState({ error: null })}>Reintentar</Button>}
            <Button variant="contained" onClick={() => window.location.reload()}>Recargar</Button>
          </Stack>
        </Stack>
      </Box>
    );
  }
}
