import { alpha, styled } from '@mui/material/styles';
import Switch from '@mui/material/Switch';

const OSwitch = styled(Switch)(({ theme }) => ({
    '& .MuiSwitch-switchBase.Mui-checked': {
    color: "#f2a340",
    '&:hover': {
        backgroundColor: alpha("#f2a340", theme.palette.action.hoverOpacity),
    },
    },
    '& .MuiSwitch-switchBase.Mui-checked + .MuiSwitch-track': {
    backgroundColor: "#f2a340",
  },
}));

export default OSwitch