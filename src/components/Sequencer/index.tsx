import { useCallback, useEffect, useRef, useState } from 'react';
import { Bank, BANK_NUM_PATTERNS, BankData } from '@/core/bank';
import { Pattern } from '@/core/pattern';
import { Track, Tracks } from '@/core/track';
import { Note } from '@/core/note';
import FileSaver from 'file-saver';
import styles from './Sequencer.module.css';

const tracks: { id: Track; label: string; length: number }[] = [
  { id: Tracks.KICK, label: 'KICK', length: 64 },
  { id: Tracks.SNARE, label: 'SNARE', length: 64 },
  { id: Tracks.HIHAT1, label: 'HAT 1', length: 16 },
  { id: Tracks.HIHAT2, label: 'HAT 2', length: 16 },
  { id: Tracks.PERC1, label: 'PERC 1', length: 16 },
  { id: Tracks.PERC2, label: 'PERC 2', length: 16 },
];
type Steps = Record<Track, number[][]>;
const STORAGE_KEY = 'stopler-sequencer-draft-v1';
function emptySteps(): Steps {
  return Object.fromEntries(tracks.map(t => [t.id, Array.from({ length: BANK_NUM_PATTERNS }, () => Array(t.length).fill(0))])) as Steps;
}
function validSteps(value: unknown): value is Steps {
  if (!value || typeof value !== 'object') return false;
  const data = value as Record<string, unknown>;
  return tracks.every(t => Array.isArray(data[t.id]) && (data[t.id] as unknown[]).length === BANK_NUM_PATTERNS &&
    (data[t.id] as unknown[]).every(row => Array.isArray(row) && row.length === t.length && row.every(n => n === 0 || n === 1)));
}
function serializeBank(data: Steps): string {
  const bankData = {} as BankData;
  for (const t of tracks) bankData[t.id] = data[t.id].map(row => new Pattern(t.id, row as Note[]));
  return new Bank(bankData).toString();
}
export default function Sequencer() {
  const [steps, setSteps] = useState<Steps>(emptySteps);
  const [slot, setSlot] = useState(0);
  const [bankNumber, setBankNumber] = useState(0);
  const [history, setHistory] = useState<Steps[]>([]);
  const [future, setFuture] = useState<Steps[]>([]);
  const [ready, setReady] = useState(false);
  const [status, setStatus] = useState('READY');
  const stepsRef = useRef(steps);
  stepsRef.current = steps;
  useEffect(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) {
        const draft = JSON.parse(saved);
        if (validSteps(draft.steps)) setSteps(draft.steps);
        if (Number.isInteger(draft.slot) && draft.slot >= 0 && draft.slot < 24) setSlot(draft.slot);
        if (Number.isInteger(draft.bankNumber) && draft.bankNumber >= 0 && draft.bankNumber < 64) setBankNumber(draft.bankNumber);
      }
    } catch { setStatus('COULD NOT RESTORE SAVED DRAFT'); }
    setReady(true);
  }, []);
  useEffect(() => {
    if (!ready) return;
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify({ steps, slot, bankNumber })); }
    catch { setStatus('AUTOSAVE UNAVAILABLE — EXPORT YOUR BANK'); }
  }, [steps, slot, bankNumber, ready]);
  const edit = useCallback((change: (previous: Steps) => Steps) => {
    const current = stepsRef.current;
    const next = change(current);
    if (next === current) return;
    setHistory(h => [...h.slice(-49), current]);
    setFuture([]);
    setSteps(next);
    stepsRef.current = next;
  }, []);
  const replaceTrack = (id: Track, row: number[]) => edit(previous => ({
    ...previous, [id]: previous[id].map((notes, index) => index === slot ? row : notes)
  }));
  const toggle = (id: Track, index: number) => edit(previous => ({
    ...previous, [id]: previous[id].map((row, i) => i === slot
      ? row.map((value, j) => j === index ? (value ? 0 : 1) : value) : row)
  }));
  const undo = () => {
    if (!history.length) return;
    const previous = history[history.length - 1];
    setFuture(f => [...f, stepsRef.current]); setSteps(previous); stepsRef.current = previous;
    setHistory(h => h.slice(0, -1));
  };
  const redo = () => {
    if (!future.length) return;
    const next = future[future.length - 1];
    setHistory(h => [...h, stepsRef.current]); setSteps(next); stepsRef.current = next;
    setFuture(f => f.slice(0, -1));
  };
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (!(event.metaKey || event.ctrlKey) || event.key.toLowerCase() !== 'z') return;
      const target = event.target as HTMLElement;
      if (target.closest('input,textarea,[contenteditable="true"]')) return;
      event.preventDefault();
      if (event.shiftKey) redo(); else undo();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });
  const copyPattern = () => {
    edit(previous => ({
      ...previous,
      ...Object.fromEntries(tracks.map(t => [t.id, previous[t.id].map((row, i) =>
        i === slot ? [...previous[t.id][Math.max(0, slot - 1)]] : row)]))
    } as Steps));
    setStatus('COPIED PREVIOUS SLOT INTO CURRENT SLOT');
  };
  const clearPattern = () => {
    edit(previous => ({
      ...previous,
      ...Object.fromEntries(tracks.map(t => [t.id, previous[t.id].map((row, i) =>
        i === slot ? Array(t.length).fill(0) : row)]))
    } as Steps));
    setStatus('PATTERN CLEARED — UNDO AVAILABLE');
  };
  const exportBank = () => {
    try {
      const filename = `PatternBank${String(bankNumber).padStart(3, '0')}.txt`;
      FileSaver.saveAs(new Blob([serializeBank(steps)], { type: 'text/plain;charset=us-ascii' }), filename);
      setStatus(`EXPORTED ${filename.toUpperCase()}`);
    } catch { setStatus('EXPORT FAILED'); }
  };
  const renderTrack = (t: typeof tracks[number]) => (
    <section className={styles.track} key={t.id}>
      <div className={styles.trackHeader}>
        <strong>{t.label}</strong><span>{t.length} STEPS</span>
        <div className={styles.trackTools}>
          <button onClick={() => replaceTrack(t.id, Array(t.length).fill(0))}>CLEAR</button>
          <button onClick={() => replaceTrack(t.id, [...steps[t.id][slot]].reverse())}>REVERSE</button>
          <button onClick={() => replaceTrack(t.id, [...steps[t.id][slot].slice(-1), ...steps[t.id][slot].slice(0, -1)])}>SHIFT +1</button>
        </div>
      </div>
      <div className={styles.steps} style={{ gridTemplateColumns: `repeat(${t.length}, minmax(0, 1fr))` }}>
        {steps[t.id][slot].map((on, index) => (
          <button key={index} aria-label={`${t.label} step ${index + 1}`} aria-pressed={!!on}
            title={`Step ${index + 1}`}
            className={`${styles.step} ${on ? styles.on : ''} ${index % 16 === 0 ? styles.barStart : ''}`}
            onClick={() => toggle(t.id, index)} />
        ))}
      </div>
    </section>
  );
  return <div className={styles.app}>
    <header className={styles.header}><div><h1>STOLPERBEATS</h1><p>MIDI CONVERTER &amp; GENERATOR</p></div>
      <span className={styles.badge}>SEQUENCER · DEVELOPMENT BUILD</span></header>
    <div className={styles.toolbar}><strong>PATTERN SEQUENCER</strong><div className={styles.actions}>
      <button disabled={!history.length} onClick={undo}>UNDO</button>
      <button disabled={!future.length} onClick={redo}>REDO</button>
      <button onClick={copyPattern} disabled={slot === 0}>COPY PREVIOUS</button>
      <button onClick={clearPattern}>CLEAR PATTERN</button>
    </div></div>
    <section className={styles.panel}><div className={styles.panelTitle}>PATTERN BANK <span>24 SLOTS</span></div>
      <div className={styles.slots}>{Array.from({ length: 24 }, (_, i) =>
        <button key={i} className={slot === i ? styles.selected : ''} onClick={() => setSlot(i)}>{String(i + 1).padStart(2, '0')}</button>)}</div>
    </section>
    <div className={styles.panel}><div className={styles.panelTitle}>STEP EDITOR <span>PATTERN {String(slot + 1).padStart(2, '0')}</span></div>
      {tracks.slice(0, 2).map(renderTrack)}
      <div className={styles.pair}>{tracks.slice(2, 4).map(renderTrack)}</div>
      <div className={styles.pair}>{tracks.slice(4, 6).map(renderTrack)}</div>
    </div>
    <section className={styles.panel}><div className={styles.export}>
      <label>HARDWARE BANK NUMBER <input aria-label="Hardware bank number" type="number" min={0} max={63}
        value={bankNumber} onChange={e => setBankNumber(Math.min(63, Math.max(0, Number(e.target.value) || 0)))} /></label>
      <button className={styles.primary} onClick={exportBank}>EXPORT STOLPERBEATS BANK</button>
    </div><p className={styles.hint}>Draft automatically saved on this Mac. Exports use the existing verified bank serializer.</p></section>
    <footer>{status}</footer>
  </div>;
}
