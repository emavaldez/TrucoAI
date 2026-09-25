// Scheduler con cancelación (arquitectura §6): toda espera de la app pasa por acá,
// así "Nueva partida" o un fin de mano cancelan de una vez los callbacks viejos [UI-03].

export interface Scheduler {
  /** Programa `fn` dentro de `ms` milisegundos; devuelve la función que la cancela. */
  schedule(ms: number, fn: () => void): () => void;
  /** Cancela todo lo pendiente. */
  cancelAll(): void;
}

/** Scheduler real, con `setTimeout`. */
export function createTimerScheduler(): Scheduler {
  const pending = new Map<number, ReturnType<typeof setTimeout>>();
  let nextId = 1;
  return {
    schedule(ms, fn) {
      const id = nextId++;
      const handle = setTimeout(() => {
        pending.delete(id);
        fn();
      }, Math.max(0, ms));
      pending.set(id, handle);
      return () => {
        clearTimeout(handle);
        pending.delete(id);
      };
    },
    cancelAll() {
      for (const handle of pending.values()) clearTimeout(handle);
      pending.clear();
    },
  };
}

/** Scheduler manual para tests: nada corre hasta `runNext` / `runAll` (en orden de tiempo). */
export interface ManualScheduler extends Scheduler {
  /** Corre la próxima tarea (la de menor tiempo). Devuelve false si no había. */
  runNext(): boolean;
  /** Corre todo hasta vaciar la cola (con tope de seguridad). Devuelve cuántas corrió. */
  runAll(limit?: number): number;
  pendingCount(): number;
}

export function createManualScheduler(): ManualScheduler {
  let now = 0;
  let seq = 0;
  const queue: { at: number; seq: number; fn: () => void; cancelled: boolean }[] = [];
  const scheduler: ManualScheduler = {
    schedule(ms, fn) {
      const task = { at: now + Math.max(0, ms), seq: seq++, fn, cancelled: false };
      queue.push(task);
      return () => {
        task.cancelled = true;
      };
    },
    cancelAll() {
      for (const task of queue) task.cancelled = true;
      queue.length = 0;
    },
    runNext() {
      queue.sort((a, b) => a.at - b.at || a.seq - b.seq);
      while (queue.length > 0) {
        const task = queue.shift() as (typeof queue)[number];
        if (task.cancelled) continue;
        now = task.at;
        task.fn();
        return true;
      }
      return false;
    },
    runAll(limit = 100_000) {
      let count = 0;
      while (count < limit && scheduler.runNext()) count += 1;
      return count;
    },
    pendingCount() {
      return queue.filter((task) => !task.cancelled).length;
    },
  };
  return scheduler;
}
