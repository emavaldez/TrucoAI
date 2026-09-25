// Punto de entrada: la app v2 (motor puro + controlador + UI mesa v2).

import '@fontsource/figtree/latin-400.css';
import '@fontsource/figtree/latin-500.css';
import '@fontsource/figtree/latin-600.css';
import '@fontsource/figtree/latin-700.css';
import '@fontsource/fraunces/latin-600.css';
import '@fontsource/fraunces/latin-700.css';
import '@fontsource/fraunces/latin-600-italic.css';
import '@fontsource/fraunces/latin-700-italic.css';
import './styles.css';
import { parseUrlConfig } from './app/urlConfig.js';
import { TrucoApp } from './ui/TrucoApp.js';

function boot(): void {
  const root = document.getElementById('game-container');
  if (!root) throw new Error('Falta #game-container en index.html');
  new TrucoApp(root, parseUrlConfig(window.location.search));
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
else boot();
