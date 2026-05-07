// Main entry point

import './styles.css';
import { App } from './App.js';

document.addEventListener('DOMContentLoaded', () => {
  const app = new App();
  (window as any).trucoApp = app;
});
