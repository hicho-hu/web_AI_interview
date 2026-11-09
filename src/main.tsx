import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import Application from './app/router';
import './styles/global.css';
import './styles/mobile.css';
import { browserLayout } from './utils/device';

document.documentElement.dataset.device = browserLayout();
createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <Application />
  </StrictMode>,
);
