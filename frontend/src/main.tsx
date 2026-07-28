import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './components/app'
// import { AppStateProvider } from './state'
import './global.css'

const rootElement = document.getElementById('root')
if (!rootElement)
    throw new Error('#root element not found')

ReactDOM.createRoot(rootElement).render(
  <React.StrictMode>
    {/* <AppStateProvider> */}
      <App />
    {/* </AppStateProvider> */}
  </React.StrictMode>,
)
