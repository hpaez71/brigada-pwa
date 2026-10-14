import { createTheme } from '@mui/material/styles';

export function makeTheme(mode = 'light') {
  const dark = mode === 'dark';
  return createTheme({
    palette: {
      mode,
      primary: { main: dark ? '#EF5350' : '#B71C1C' },
      secondary: { main: dark ? '#90A4AE' : '#263238' },
      warning: { main: '#EF6C00' },
      success: { main: '#2E7D32' },
      background: dark ? { default: '#121212', paper: '#1E1E1E' } : { default: '#F4F4F2', paper: '#FFFFFF' },
    },
    shape: { borderRadius: 10 },
    typography: {
      fontFamily: '"Inter", "Roboto", "Helvetica", "Arial", sans-serif',
      button: { textTransform: 'none', fontWeight: 600 },
      h4: { fontWeight: 800 },
      h5: { fontWeight: 700 },
      h6: { fontWeight: 700 },
    },
    components: {
      MuiCard: { defaultProps: { variant: 'outlined' } },
      MuiPaper: { styleOverrides: { root: { backgroundImage: 'none' } } },
      MuiButton: { defaultProps: { disableElevation: true } },
      MuiTextField: { defaultProps: { size: 'small', fullWidth: true } },
      MuiSelect: { defaultProps: { size: 'small' } },
    },
  });
}
