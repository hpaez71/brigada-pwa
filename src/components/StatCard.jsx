import { Card, CardContent, Box, Typography } from '@mui/material';

export default function StatCard({ label, value, icon, color = 'primary.main', hint }) {
  return (
    <Card>
      <CardContent sx={{ display: 'flex', alignItems: 'center', gap: 2, py: 2, '&:last-child': { pb: 2 } }}>
        {icon && (
          <Box sx={{ width: 44, height: 44, borderRadius: 2, display: 'grid', placeItems: 'center', bgcolor: color, color: '#fff' }}>
            {icon}
          </Box>
        )}
        <Box sx={{ minWidth: 0 }}>
          <Typography variant="h5" sx={{ lineHeight: 1.1, fontVariantNumeric: 'tabular-nums' }}>{value ?? '—'}</Typography>
          <Typography variant="body2" color="text.secondary" noWrap>{label}</Typography>
          {hint && <Typography variant="caption" color="text.secondary">{hint}</Typography>}
        </Box>
      </CardContent>
    </Card>
  );
}
