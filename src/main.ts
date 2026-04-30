// Main entry point

import { App } from './App.js';

document.addEventListener('DOMContentLoaded', () => {
  const app = new App();
  app.init();
  (window as any).trucoApp = app;
});
