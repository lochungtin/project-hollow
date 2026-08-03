import { alpha, styled } from '@mui/material/styles';
import Switch from '@mui/material/Switch';

const OSwitch = styled(Switch)(({ theme }) => ({
    '& .MuiSwitch-switchBase.Mui-checked': {
    	color: "#9f79df",
    	'&:hover': {
        	backgroundColor: alpha("#9f79df", theme.palette.action.hoverOpacity),
    	},
    	},
    	'& .MuiSwitch-switchBase.Mui-checked + .MuiSwitch-track': {
    		backgroundColor: "#9f79df",
  		},
	}
));

export default OSwitch