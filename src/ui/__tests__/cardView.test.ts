// @vitest-environment jsdom
/**
 * Tests unitarios de la carta v2 (historia 0-4, AC 2).
 * jsdom: se monta el HTML de `renderCard` y se verifican estructura, estados y a11y.
 */

import { describe, it, expect } from 'vitest';
import { renderCard, cardAriaLabel, cardNameEs, CARD_SIZES } from '../cardView.js';
import { escapeHtml } from '../escape.js';

describe('cardView — carta española mesa v2', () => {
  it('[UI-13] ninguna carta jugada se apaga con opacity: los estados usan filter/box-shadow', () => {
    for (const state of ['normal', 'playable', 'disabled', 'winner'] as const) {
      const html = renderCard({ number: 7, suit: 'espada' }, { size: 'md', state });
      expect(html).not.toMatch(/opacity\s*:/);
    }
  });

  it('respeta las medidas de Card.dc.html por tamaño', () => {
    for (const size of ['xl', 'lg', 'md', 'sm', 'xs'] as const) {
      const s = CARD_SIZES[size];
      const html = renderCard({ number: 1, suit: 'espada' }, { size });
      expect(html).toContain(`--cw:${s.w}px`);
      expect(html).toContain(`--ch:${s.h}px`);
      expect(html).toContain(`--cr:${s.r}px`);
    }
  });

  it('figuras 10/11/12 muestran Sota/Caballo/Rey', () => {
    const labels: Record<number, string> = { 10: 'Sota', 11: 'Caballo', 12: 'Rey' };
    for (const [num, label] of Object.entries(labels)) {
      const html = renderCard({ number: Number(num), suit: 'oro' }, { size: 'xl' });
      expect(html).toContain(label);
    }
    expect(renderCard({ number: 7, suit: 'oro' }, { size: 'xl' })).not.toContain('Sota');
  });

  it('el estado winner lleva aro dorado y cinta "Va ganando"', () => {
    const host = document.createElement('div');
    host.innerHTML = renderCard({ number: 3, suit: 'copa' }, { size: 'md', state: 'winner' });
    expect(host.querySelector('.card-winner-ring')).not.toBeNull();
    const tag = host.querySelector('.card-winner-tag');
    expect(tag?.textContent).toBe('Va ganando');
  });

  it('el estado back renderiza solo el dorso, sin cara', () => {
    const host = document.createElement('div');
    host.innerHTML = renderCard({ number: 1, suit: 'basto' }, { size: 'xs', state: 'back' });
    expect(host.querySelector('.card--back')).not.toBeNull();
    expect(host.querySelector('.card-face')).toBeNull();
  });

  it('carta jugable es un <button> con aria-label "Jugar el 7 de espada"', () => {
    const host = document.createElement('div');
    host.innerHTML = renderCard(
      { number: 7, suit: 'espada' },
      { size: 'xl', state: 'playable', label: cardAriaLabel({ number: 7, suit: 'espada' }) },
    );
    const btn = host.querySelector('button.card');
    expect(btn).not.toBeNull();
    expect(btn?.getAttribute('aria-label')).toBe('Jugar el 7 de espada');
  });

  it('cardNameEs y cardAriaLabel usan el nombre español del palo', () => {
    expect(cardNameEs({ number: 12, suit: 'oro' })).toBe('el 12 de oro');
    expect(cardAriaLabel({ number: 1, suit: 'espada' })).toBe('Jugar el 1 de espada');
  });

  it('cada palo tiene su SVG con los paths del diseño', () => {
    const host = document.createElement('div');
    host.innerHTML =
      renderCard({ number: 1, suit: 'oro' }, { size: 'xl' })
      + renderCard({ number: 1, suit: 'copa' }, { size: 'xl' })
      + renderCard({ number: 1, suit: 'espada' }, { size: 'xl' })
      + renderCard({ number: 1, suit: 'basto' }, { size: 'xl' });
    expect(host.querySelectorAll('.card-pip svg').length).toBe(4);
    expect(host.querySelector('.suit-oro .pip-oro-a')).not.toBeNull();
    expect(host.querySelector('.suit-copa .pip-copa-a')).not.toBeNull();
    expect(host.querySelector('.suit-espada .pip-esp-a')).not.toBeNull();
    expect(host.querySelector('.suit-basto .pip-bas-a')).not.toBeNull();
  });

  it('escapeHtml neutraliza HTML inyectado en el texto', () => {
    const evil = '<img src=x onerror=alert(1)>';
    const escaped = escapeHtml(evil);
    const host = document.createElement('div');
    host.innerHTML = `<span>${escaped}</span>`;
    expect(host.querySelector('img')).toBeNull();
    expect(host.textContent).toBe(evil);
  });
});
