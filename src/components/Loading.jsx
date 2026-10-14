import { Box, CircularProgress } from '@mui/material';

export default function Loading({ full }) {
  return (
    <Box sx={{ display: 'grid', placeItems: 'center', minHeight: full ? '100vh' : 200 }}>
      <CircularProgress color="primary" />
    </Box>
  );
}
