// Sonido (pedido de Emmanuel 2026-09-25): una voz que dice los cantos ("¡Truco!", "¡Quiero!",
// "33", "Me dio", "Son buenas"…) con la síntesis de voz del navegador, un "tin" corto para cada
// canto y un golpecito al jugar una carta, hechos con Web Audio (sin archivos de audio).
// Todo es opcional: si el navegador no tiene voz en español o no deja reproducir, no pasa nada.

import type { GameEvent, MatchState, PlayerId } from '../engine/index.js';
import { ENVIDO_LABELS, TRUCO_LABELS } from './text.js';

const SOUND_KEY = 'trucoai.sound.v1';
const VOICE_KEY = 'trucoai.voice.v1';

/** Voces "de juguete" de macOS (burbujas, órgano, robots…): nunca para la mesa. */
const NOVELTY = /(albert|bad news|bahh|bells|boing|bubbles|cellos|good news|jester|organ|superstar|trinoids|whisper|wobble|zarvox|grandma|grandpa|abuel|eddy|flo\b|reed|rocko|sandy|shelley)/i;

/**
 * Qué tan buena es una voz para la mesa (pedido de Emmanuel 2026-09-28: "una voz más copada"): primero las
 * rioplatenses (es-AR, es-UY), después las latinoamericanas y al final las de España; las naturales o
 * mejoradas (Premium, Enhanced, Natural, Neural, Online, Google) suben mucho; las de juguete, afuera.
 */
export function voiceScore(voice: { name: string; lang: string; localService?: boolean }): number {
  const lang = voice.lang.toLowerCase().replace('_', '-');
  if (!lang.startsWith('es')) return -1000;
  let score = lang === 'es-ar' ? 50 : lang === 'es-uy' ? 45 : /^es-(419|mx|us|co|cl|pe|ve)$/.test(lang) ? 30 : 15;
  if (/premium|enhanced|mejorad|natural|neural|online/i.test(voice.name)) score += 25;
  if (/google/i.test(voice.name)) score += 12;
  if (voice.localService === false) score += 3;
  if (NOVELTY.test(voice.name)) score -= 500;
  return score;
}

function readVoicePref(): string {
  try {
    return window.localStorage.getItem(VOICE_KEY) ?? 'auto';
  } catch {
    return 'auto';
  }
}

const FLOR_ANSWER_SPEECH: Record<string, string> = {
  ACHICO: 'Con flor me achico',
  CONTRAFLOR: '¡Contraflor!',
  CONTRAFLOR_AL_RESTO: '¡Contraflor al resto!',
  QUIERO: '¡Quiero!',
  NO_QUIERO: 'No quiero',
};

function readEnabled(): boolean {
  try {
    return window.localStorage.getItem(SOUND_KEY) !== 'off';
  } catch {
    return true;
  }
}

export class SoundBoard {
  enabled: boolean;
  private audio: AudioContext | null = null;
  /** voces buenas en español, de mejor a peor; cada asiento habla con una distinta si hay varias */
  private voices: SpeechSynthesisVoice[] = [];
  /** 'auto' o el nombre de la voz elegida en el menú */
  voicePref = 'auto';
  /** se llama cuando el navegador termina de cargar las voces (para mostrarlas en el menú) */
  onVoices: (() => void) | null = null;
  private timers: ReturnType<typeof setTimeout>[] = [];

  constructor(enabled?: boolean) {
    this.enabled = enabled ?? readEnabled();
    if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
      this.voicePref = readVoicePref();
      this.pickVoice();
      window.speechSynthesis.addEventListener?.('voiceschanged', () => {
        this.pickVoice();
        this.onVoices?.();
      });
    }
  }

  setEnabled(value: boolean): void {
    this.enabled = value;
    try {
      window.localStorage.setItem(SOUND_KEY, value ? 'on' : 'off');
    } catch {
      // sin almacenamiento: vale para esta sesión
    }
    if (!value) this.stop();
    else this.unlock();
  }

  /** Los navegadores solo dejan sonar después de un gesto del usuario: se llama en cada clic. */
  unlock(): void {
    if (!this.enabled || typeof window === 'undefined') return;
    try {
      if (!this.audio) {
        const Ctx = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
        if (Ctx) this.audio = new Ctx();
      }
      if (this.audio?.state === 'suspended') void this.audio.resume();
    } catch {
      this.audio = null;
    }
  }

  /** Corta la voz y lo programado (nueva partida, salir, silenciar). */
  stop(): void {
    for (const timer of this.timers) clearTimeout(timer);
    this.timers = [];
    try {
      window.speechSynthesis?.cancel();
    } catch {
      // nada
    }
  }

  private pickVoice(): void {
    try {
      this.voices = window.speechSynthesis
        .getVoices()
        .filter((voice) => voiceScore(voice) > 0)
        .sort((a, b) => voiceScore(b) - voiceScore(a));
    } catch {
      this.voices = [];
    }
  }

  /** Las voces en español para elegir en el menú (la mejor primero). */
  voiceOptions(): { id: string; label: string }[] {
    return this.voices.map((voice) => ({ id: voice.name, label: `${voice.name.replace(/^Google /, 'Google · ')} (${voice.lang})` }));
  }

  /** Elegir voz ('auto' = una distinta y buena para cada asiento). Dice algo para probarla. */
  setVoice(id: string): void {
    this.voicePref = id;
    try {
      window.localStorage.setItem(VOICE_KEY, id);
    } catch {
      // sin almacenamiento: vale para esta sesión
    }
    if (this.enabled) {
      this.stop();
      this.speak('¡Quiero retruco!', 1);
    }
  }

  /** La voz de un asiento: la elegida, o (automático) las mejores repartidas entre los asientos. */
  private voiceFor(seat: number): { voice: SpeechSynthesisVoice | null; shared: boolean } {
    const chosen = this.voicePref !== 'auto' ? this.voices.find((voice) => voice.name === this.voicePref) : undefined;
    if (chosen) return { voice: chosen, shared: true };
    if (this.voices.length === 0) return { voice: null, shared: true };
    // Las que están cerca de la mejor (no mezclar una natural con una robótica).
    const best = voiceScore(this.voices[0]);
    const good = this.voices.filter((voice) => voiceScore(voice) >= best - 20).slice(0, 6);
    return { voice: good[seat % good.length], shared: good.length < 3 };
  }

  private later(ms: number, fn: () => void): void {
    if (ms <= 0) {
      fn();
      return;
    }
    const timer = setTimeout(() => {
      this.timers = this.timers.filter((t) => t !== timer);
      fn();
    }, ms);
    this.timers.push(timer);
  }

  private tone(freq: number, start: number, duration: number, gain: number, type: OscillatorType = 'sine'): void {
    const audio = this.audio;
    if (!audio) return;
    const osc = audio.createOscillator();
    const amp = audio.createGain();
    osc.type = type;
    osc.frequency.value = freq;
    const t0 = audio.currentTime + start;
    amp.gain.setValueAtTime(0, t0);
    amp.gain.linearRampToValueAtTime(gain, t0 + 0.01);
    amp.gain.exponentialRampToValueAtTime(0.0001, t0 + duration);
    osc.connect(amp).connect(audio.destination);
    osc.start(t0);
    osc.stop(t0 + duration + 0.02);
  }

  /** "Tin" de canto: dos notas cortas. */
  private chime(high = false): void {
    const base = high ? 880 : 660;
    this.tone(base, 0, 0.18, 0.12);
    this.tone(base * 1.5, 0.07, 0.22, 0.09);
  }

  /** Golpecito de carta sobre el paño (ruido filtrado muy corto). */
  private tap(): void {
    const audio = this.audio;
    if (!audio) return;
    const length = Math.floor(audio.sampleRate * 0.05);
    const buffer = audio.createBuffer(1, length, audio.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < length; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / length) ** 3;
    const source = audio.createBufferSource();
    source.buffer = buffer;
    const filter = audio.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.value = 1800;
    const amp = audio.createGain();
    amp.gain.value = 0.35;
    source.connect(filter).connect(amp).connect(audio.destination);
    source.start();
  }

  /** Dice una frase de la charla de la mesa con la voz de ese asiento. */
  say(text: string, seat: number): void {
    if (!this.enabled) return;
    this.speak(text, seat);
  }

  private speak(text: string, seat: number): void {
    try {
      if (!('speechSynthesis' in window)) return;
      const utterance = new SpeechSynthesisUtterance(text);
      const { voice, shared } = this.voiceFor(seat);
      utterance.lang = voice?.lang ?? 'es-AR';
      if (voice) utterance.voice = voice;
      // Un poco más rápido y con ganas; si varios asientos comparten voz, un tono apenas distinto (sin robot).
      utterance.rate = /[!¡]/.test(text) ? 1.12 : 1.06;
      utterance.pitch = shared ? [1, 0.92, 1.08, 0.95, 1.05, 0.9][seat % 6] : 1;
      utterance.volume = 0.95;
      window.speechSynthesis.speak(utterance);
    } catch {
      // sin voz: queda el "tin"
    }
  }

  private sing(text: string, seat: number, delay: number, high = false): void {
    this.later(delay, () => {
      this.chime(high);
      this.speak(text, seat);
    });
  }

  /** Suena lo que corresponde a los eventos de un cambio. `gap` = pausa entre los tantos. */
  play(events: readonly GameEvent[], state: MatchState, gap: number): void {
    if (!this.enabled || events.length === 0) return;
    this.unlock();
    const seatOf = (playerId: PlayerId): number => state.seats.find((seat) => seat.id === playerId)?.seat ?? 0;
    events.forEach((event, index) => {
      const previous = index > 0 ? events[index - 1] : null;
      const next = events[index + 1];
      switch (event.type) {
        case 'CARD_PLAYED':
          this.tap();
          break;
        case 'TRUCO_CALLED': {
          const raise = previous?.type === 'TRUCO_ANSWERED' && previous.playerId === event.playerId && previous.answer === 'QUIERO';
          const label = TRUCO_LABELS[event.level];
          this.sing(raise ? `¡Quiero ${label.toLowerCase()}!` : `¡${label}!`, seatOf(event.playerId), 0, true);
          break;
        }
        case 'TRUCO_ANSWERED':
          if (next?.type === 'TRUCO_CALLED' && next.playerId === event.playerId) break;
          this.sing(event.answer === 'QUIERO' ? '¡Quiero!' : 'No quiero', seatOf(event.playerId), 0);
          break;
        case 'ENVIDO_CALLED':
          this.sing(`¡${ENVIDO_LABELS[event.call]}!`, seatOf(event.playerId), 0, true);
          break;
        case 'ENVIDO_ANSWERED':
          this.sing(event.answer === 'QUIERO' ? '¡Quiero!' : 'No quiero', seatOf(event.playerId), 0);
          break;
        case 'ENVIDO_RESOLVED':
          event.sayings.forEach((saying, i) => {
            const text = saying.kind === 'SCORE' ? `${saying.score}` : saying.kind === 'ME_DIO' ? 'Me dio' : 'Son buenas';
            this.later(i * gap, () => this.speak(text, seatOf(saying.playerId)));
          });
          break;
        case 'FLOR_DECLARED':
          this.sing('¡Flor!', seatOf(event.playerId), 0, true);
          break;
        case 'FLOR_ANSWERED':
          this.sing(FLOR_ANSWER_SPEECH[event.answer] ?? event.answer, seatOf(event.playerId), 0);
          break;
        case 'MAZO':
          this.sing('Me voy al mazo', seatOf(event.playerId), 0);
          break;
        case 'MATCH_OVER':
          if (event.winnerTeam === 0) [523, 659, 784, 1047].forEach((freq, i) => this.tone(freq, i * 0.12, 0.3, 0.12, 'triangle'));
          else [392, 330, 262].forEach((freq, i) => this.tone(freq, i * 0.18, 0.35, 0.1, 'triangle'));
          break;
        default:
          break;
      }
    });
  }
}
