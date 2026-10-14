import DirectionsRun from '@mui/icons-material/DirectionsRun';
import LocalFireDepartment from '@mui/icons-material/LocalFireDepartment';
import Vibration from '@mui/icons-material/Vibration';
import Science from '@mui/icons-material/Science';
import GppMaybe from '@mui/icons-material/GppMaybe';
import LocalHospital from '@mui/icons-material/LocalHospital';
import ModelTraining from '@mui/icons-material/ModelTraining';
import WarningAmber from '@mui/icons-material/WarningAmber';

const ICONS = {
  evacuacion_general: DirectionsRun,
  incendio: LocalFireDepartment,
  sismo: Vibration,
  derrame_quimico: Science,
  amenaza_seguridad: GppMaybe,
  emergencia_medica: LocalHospital,
  simulacro: ModelTraining,
};

export default function EmergencyIcon({ tipo, ...props }) {
  const C = ICONS[tipo] || WarningAmber;
  return <C {...props} />;
}
