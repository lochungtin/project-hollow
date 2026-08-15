import { createTheme, ThemeProvider } from '@mui/material/styles';
import type { } from '@mui/x-charts/themeAugmentation';
import ReactDOM from 'react-dom/client';
import App from './components/app';
import './global.css';
import { AppStateProvider } from './state';

const axisRootOverrides = {
    root: {
        '& .MuiChartsAxis-line': { stroke: '#555' },
        '& .MuiChartsAxis-tick': { stroke: '#555' },
        '& .MuiChartsAxis-tickLabel': { fill: '#efefef' },
        '& .MuiChartsAxis-label': { fill: '#efefef' },
    },
};

const theme = createTheme({
    components: {
        MuiChartsXAxis: { styleOverrides: axisRootOverrides },
        MuiChartsYAxis: { styleOverrides: axisRootOverrides },
        MuiChartsLegend: {
            styleOverrides: {
                root: {
                    '& .MuiChartsLegend-label': {
                        color: '#efefef',
                    },
                },
            },
        },
    },
});

const rootElement = document.getElementById('root')
if (!rootElement)
    throw new Error('#root element not found')


ReactDOM.createRoot(rootElement).render(
	<ThemeProvider theme={theme}>
		<AppStateProvider>
			<App />
		</AppStateProvider>
	</ThemeProvider>
)
