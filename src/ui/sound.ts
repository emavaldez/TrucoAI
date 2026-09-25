// Sonido (pedido de Emmanuel 2026-09-25): una voz que dice los cantos ("¡Truco!", "¡Quiero!",
// "33", "Me dio", "Son buenas"…) con la síntesis de voz del navegador, un "tin" corto para cada
// canto y un golpecito al jugar una carta, hechos con Web Audio (sin archivos de audio).
// Todo es opcional: si el navegador no tiene voz en español o no deja reproducir, no pasa nada.

import type { GameEvent, MatchState, PlayerId } from '../engine/index.js';
import { ENVIDO_LABELS, TRUCO_LABELS } from './text.js';

const SOUND_KEY = 'trucoai.sound.v1';

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
  private voice: SpeechSynthesisVoice | null = null;
  private timers: ReturnType<typeof setTimeout>[] = [];

  constructor(enabled?: boolean) {
    this.enabled = enabled ?? readEnabled();
    if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
      this.pickVoice();
      window.speechSynthesis.addEventListener?.('voiceschanged', () => this.pickVoice());
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
      const voices = window.speechSynthesis.getVoices();
      const spanish = voices.filter((voice) => voice.lang.toLowerCase().startsWith('es'));
      const prefer = ['es-ar', 'es-419', 'es-uy', 'es-mx', 'es-us', 'es-es'];
      this.voice =
        prefer.map((lang) => spanish.find((voice) => voice.lang.toLowerCase() === lang)).find(Boolean) ?? spanish[0] ?? null;
    } catch {
      this.voice = null;
    }
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

  private speak(text: string, seat: number): void {
    try {
      if (!('speechSynthesis' in window)) return;
      const utterance = new SpeechSynthesisUtterance(text);
      utterance.lang = this.voice?.lang ?? 'es-AR';
      if (this.voice) utterance.voice = this.voice;
      utterance.rate = 1.05;
      // Cada asiento con un tono un poco distinto, para distinguir quién habla.
      utterance.pitch = [1, 0.8, 1.25, 0.9, 1.15, 0.75][seat % 6];
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
