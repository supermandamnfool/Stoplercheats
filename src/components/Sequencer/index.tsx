import { useCallback, useEffect, useRef, useState } from 'react';
import { Bank, BANK_NUM_PATTERNS, BankData } from '@/core/bank';
import { Pattern } from '@/core/pattern';
import { Track, Tracks } from '@/core/track';
import { Note } from '@/core/note';
import FileSaver from 'file-saver';
import styles from './Sequencer.module.css';
import { TRACKS, cloneBank, musicalRandom, mutate, changeDensity, rotate, timeTransform, generateVariations, Evolution } from '@/core/generator';
import { DrumPreview } from '@/core/drum-preview';
import { exportPatternMidi, DEFAULT_EXPORT_NOTES } from '@/core/midi-export';
import JSZip from 'jszip';

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
  const [locked, setLocked] = useState<Track[]>([]);
  const [muted, setMuted] = useState<Track[]>([]);
  const [solo, setSolo] = useState<Track[]>([]);
  const [density, setDensity] = useState(0.3);
  const [variation, setVariation] = useState(0.35);
  const [evolution, setEvolution] = useState<Evolution>('steady');
  const [sourceSlot, setSourceSlot] = useState(0);
  const [rangeStart, setRangeStart] = useState(1);
  const [rangeEnd, setRangeEnd] = useState(24);
  const [selectedRange, setSelectedRange] = useState(false);
  const [generatorOpen, setGeneratorOpen] = useState(true);
  const [bpm, setBpm] = useState(120);
  const [volume, setVolume] = useState(0.5);
  const [playing, setPlaying] = useState(false);
  const [playhead, setPlayhead] = useState(-1);
  const [library, setLibrary] = useState<{name:string;folder:string;bank:Steps}[]>([]);
  const [libraryName, setLibraryName] = useState('');
  const [patternClipboard, setPatternClipboard] = useState<Record<Track,number[]> | null>(null);
  const [trackClipboard, setTrackClipboard] = useState<number[] | null>(null);
  const [folder, setFolder] = useState('Default');
  const [midiNotes, setMidiNotes] = useState<Record<Track,number>>(DEFAULT_EXPORT_NOTES);
  const audioRef = useRef<DrumPreview | null>(null);
  const transportRef = useRef<{timer:number;next:number;step:number}|null>(null);
  const slotRef = useRef(slot); slotRef.current=slot;
  const mutedRef=useRef(muted);mutedRef.current=muted;
  const soloRef=useRef(solo);soloRef.current=solo;
  const bpmRef=useRef(bpm);bpmRef.current=bpm;
  const [status, setStatus] = useState('READY');
  const stepsRef = useRef(steps);
  stepsRef.current = steps;
  useEffect(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) {
        const draft = JSON.parse(saved);
        if (validSteps(draft.steps)) setSteps(draft.steps);
        if (Array.isArray(draft.library)) setLibrary(draft.library.filter((item: {bank:unknown})=>validSteps(item.bank)));
        if (Array.isArray(draft.locked)) setLocked(draft.locked.filter((id:Track)=>TRACKS.includes(id)));
        if (typeof draft.density==='number')setDensity(draft.density);
        if (typeof draft.variation==='number')setVariation(draft.variation);
        if (['steady','build','reduce','wave'].includes(draft.evolution))setEvolution(draft.evolution);
        if (Number.isInteger(draft.sourceSlot))setSourceSlot(draft.sourceSlot);
        if (typeof draft.folder==='string')setFolder(draft.folder);
        if (Number.isInteger(draft.slot) && draft.slot >= 0 && draft.slot < 24) setSlot(draft.slot);
        if (Number.isInteger(draft.bankNumber) && draft.bankNumber >= 0 && draft.bankNumber < 64) setBankNumber(draft.bankNumber);
      }
    } catch { setStatus('COULD NOT RESTORE SAVED DRAFT'); }
    setReady(true);
  }, []);
  useEffect(() => {
    if (!ready) return;
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify({ steps, slot, bankNumber, library, locked, density, variation, evolution, sourceSlot, folder })); }
    catch { setStatus('AUTOSAVE UNAVAILABLE — EXPORT YOUR BANK'); }
  }, [steps, slot, bankNumber, library, locked, density, variation, evolution, sourceSlot, folder, ready]);
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
  useEffect(()=>()=>{if(transportRef.current)window.clearInterval(transportRef.current.timer);void audioRef.current?.close();},[]);
  const stop=()=>{
    if(transportRef.current)window.clearInterval(transportRef.current.timer);
    transportRef.current=null;setPlaying(false);setPlayhead(-1);
  };
  const play=async()=>{
    if(playing){stop();return;}
    try{
      if(!audioRef.current)audioRef.current=new DrumPreview();
      await audioRef.current.start();audioRef.current.volume(volume);
      const audio=audioRef.current;
      const state={timer:0,next:audio.currentTime+0.04,step:0};
      transportRef.current=state;setPlaying(true);
      const tick=()=>{
        if(transportRef.current!==state)return;
        const duration=60/bpmRef.current/4;
        while(state.next<audio.currentTime+0.11){
          const step=state.step%64;
          const slotAtStep=slotRef.current;
          for(const t of tracks){
            if(mutedRef.current.includes(t.id))continue;
            if(soloRef.current.length&&!soloRef.current.includes(t.id))continue;
            if(stepsRef.current[t.id][slotAtStep][step%t.length])audio.hit(t.id,state.next);
          }
          const displayed=step;
          window.setTimeout(()=>{if(transportRef.current===state)setPlayhead(displayed);},Math.max(0,(state.next-audio.currentTime)*1000));
          state.next+=duration;state.step++;
        }
      };
      state.timer=window.setInterval(tick,25);tick();
    }catch{setStatus('AUDIO PREVIEW UNAVAILABLE');stop();}
  };
  const toggleTrack=(id:Track,items:Track[],setter:(value:Track[])=>void)=>setter(items.includes(id)?items.filter(t=>t!==id):[...items,id]);
  const generateTrack=(id:Track)=>{if(locked.includes(id))return;replaceTrack(id,musicalRandom(id,density));};
  const mutateTrack=(id:Track)=>{if(locked.includes(id))return;replaceTrack(id,mutate(id,steps[id][slot],variation));};
  const generateBank=()=>{
    const destinations=Array.from({length:selectedRange?rangeEnd-rangeStart+1:24},(_,i)=>selectedRange?rangeStart-1+i:i);
    edit(previous=>generateVariations(previous,sourceSlot,destinations,variation,evolution,locked));
    setStatus('GENERATED BANK VARIATIONS — UNDO AVAILABLE');
  };
  const saveToLibrary=()=>{
    const name=libraryName.trim()||'Untitled Bank';
    setLibrary(current=>[...current,{name,folder:folder.trim()||'Default',bank:cloneBank(steps)}]);
    setLibraryName('');setStatus('BANK SAVED TO LIBRARY');
  };
  const loadLibrary=(index:number)=>{
    edit(()=>cloneBank(library[index].bank));setStatus('BANK LOADED — UNDO AVAILABLE');
  };
  const backupLibrary=()=>{
    FileSaver.saveAs(new Blob([JSON.stringify({version:1,library},null,2)],{type:'application/json'}),'Stopler-Library-Backup.json');
  };
  const restoreLibrary=async(file:File)=>{
    try{
      const parsed=JSON.parse(await file.text());
      if(!Array.isArray(parsed.library)||!parsed.library.every((entry:{bank:unknown})=>validSteps(entry.bank)))throw Error('Invalid library');
      setLibrary(current=>[...current,...parsed.library]);setStatus('LIBRARY BACKUP IMPORTED');
    }catch{setStatus('INVALID LIBRARY BACKUP');}
  };
  const exportMidi=()=>{
    const bytes=exportPatternMidi(steps,slot,midiNotes);
    FileSaver.saveAs(new Blob([Uint8Array.from(bytes)],{type:'audio/midi'}),`Stopler-Pattern-${String(slot+1).padStart(2,'0')}.mid`);
  };
  const exportAllMidi=async()=>{
    const zip=new JSZip();
    for(let i=0;i<24;i++)zip.file(`Stopler-Pattern-${String(i+1).padStart(2,'0')}.mid`,exportPatternMidi(steps,i,midiNotes));
    FileSaver.saveAs(await zip.generateAsync({type:'blob'}),'Stopler-MIDI-Bank.zip');
  };
  const pastePattern=()=>{
    if(!patternClipboard)return;
    edit(previous=>Object.fromEntries(TRACKS.map(t=>[t,previous[t].map((row,i)=>i===slot&&!locked.includes(t)?patternClipboard[t].slice():row)])) as Steps);
    setStatus('PASTED PATTERN — UNDO AVAILABLE');
  };
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
          <button onClick={()=>{setTrackClipboard(steps[t.id][slot].slice());setStatus('TRACK COPIED');}}>COPY</button>
          <button disabled={!trackClipboard||trackClipboard.length!==t.length||locked.includes(t.id)} onClick={()=>{if(trackClipboard)replaceTrack(t.id,trackClipboard.slice());}}>PASTE</button>
          <button aria-pressed={locked.includes(t.id)} onClick={()=>toggleTrack(t.id,locked,setLocked)}>{locked.includes(t.id)?'UNLOCK':'LOCK'}</button>
          <button aria-pressed={muted.includes(t.id)} onClick={()=>toggleTrack(t.id,muted,setMuted)}>MUTE</button>
          <button aria-pressed={solo.includes(t.id)} onClick={()=>toggleTrack(t.id,solo,setSolo)}>SOLO</button>
          <button disabled={locked.includes(t.id)} onClick={()=>generateTrack(t.id)}>RANDOM</button>
          <button disabled={locked.includes(t.id)} onClick={()=>mutateTrack(t.id)}>MUTATE</button>
          <button disabled={locked.includes(t.id)} onClick={()=>replaceTrack(t.id,changeDensity(t.id,steps[t.id][slot],density))}>DENSITY</button>
          <button disabled={locked.includes(t.id)} onClick={() => replaceTrack(t.id, Array(t.length).fill(0))}>CLEAR</button>
          <button disabled={locked.includes(t.id)} onClick={() => replaceTrack(t.id, rotate(steps[t.id][slot],-1))}>SHIFT -1</button>
          <button disabled={locked.includes(t.id)} onClick={() => replaceTrack(t.id,timeTransform(steps[t.id][slot],0.5))}>½ TIME</button>
          <button disabled={locked.includes(t.id)} onClick={() => replaceTrack(t.id,timeTransform(steps[t.id][slot],2))}>2× TIME</button>
          <button disabled={locked.includes(t.id)} onClick={() => replaceTrack(t.id, rotate(steps[t.id][slot],1))}>SHIFT +1</button>
        </div>
      </div>
      <div className={styles.steps} style={{ gridTemplateColumns: `repeat(${t.length}, minmax(0, 1fr))` }}>
        {steps[t.id][slot].map((on, index) => (
          <button key={index} aria-label={`${t.label} step ${index + 1}`} aria-pressed={!!on}
            title={`Step ${index + 1}`}
            className={`${styles.step} ${on ? styles.on : ''} ${index % 16 === 0 ? styles.barStart : ''}`}
            onClick={() => {if(!locked.includes(t.id))toggle(t.id, index);}} style={{outline:playhead%t.length===index?'1px solid #fff4b0':undefined}} />
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
      <button onClick={()=>{setPatternClipboard(Object.fromEntries(TRACKS.map(t=>[t,steps[t][slot].slice()])) as Record<Track,number[]>);setStatus('PATTERN COPIED');}}>COPY PATTERN</button>
      <button onClick={pastePattern} disabled={!patternClipboard}>PASTE PATTERN</button>
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
    <section className={styles.panel}>
      <div className={styles.panelTitle}>PLAYBACK <span>BUILT-IN DRUM PREVIEW</span></div>
      <div className={styles.controls}>
        <button className={styles.primary} onClick={()=>void play()}>{playing?'STOP':'PLAY'}</button>
        <label>BPM <input type="number" min="40" max="260" value={bpm} onChange={e=>setBpm(Math.max(40,Math.min(260,Number(e.target.value)||120)))}/></label>
        <label>MASTER VOLUME <input type="range" min="0" max="1" step="0.01" value={volume} onChange={e=>{setVolume(Number(e.target.value));audioRef.current?.volume(Number(e.target.value));}}/></label>
        <label>DENSITY <input type="range" min="0" max="1" step="0.01" value={density} onChange={e=>setDensity(Number(e.target.value))}/>{Math.round(density*100)}%</label>
        <label>VARIATION <input type="range" min="0" max="1" step="0.01" value={variation} onChange={e=>setVariation(Number(e.target.value))}/>{Math.round(variation*100)}%</label>
      </div>
    </section>
    <section className={styles.panel}>
      <button onClick={()=>setGeneratorOpen(v=>!v)}>{generatorOpen?'▼':'▶'} PATTERN BANK GENERATOR</button>
      {generatorOpen&&<div className={styles.controls}>
        <label>SOURCE SLOT <select value={sourceSlot} onChange={e=>setSourceSlot(Number(e.target.value))}>{Array.from({length:24},(_,i)=><option key={i} value={i}>{i+1}</option>)}</select></label>
        <label>EVOLUTION <select value={evolution} onChange={e=>setEvolution(e.target.value as Evolution)}><option value="steady">STEADY</option><option value="build">BUILD</option><option value="reduce">REDUCE</option><option value="wave">WAVE</option></select></label>
        <label><input type="checkbox" checked={selectedRange} onChange={e=>setSelectedRange(e.target.checked)}/> SELECTED RANGE</label>
        {selectedRange&&<><label>FROM <input type="number" min="1" max="24" value={rangeStart} onChange={e=>setRangeStart(Math.max(1,Math.min(rangeEnd,Number(e.target.value)||1)))}/></label><label>TO <input type="number" min="1" max="24" value={rangeEnd} onChange={e=>setRangeEnd(Math.max(rangeStart,Math.min(24,Number(e.target.value)||24)))}/></label></>}
        <button className={styles.primary} onClick={generateBank}>GENERATE VARIATIONS</button>
        <button onClick={()=>{setDensity(0.3);setVariation(0.35);setEvolution('steady');setSelectedRange(false);setRangeStart(1);setRangeEnd(24);}}>RESET SETTINGS</button>
      </div>}
    </section>
    <section className={styles.panel}>
      <div className={styles.panelTitle}>LIBRARY <span>{library.length} SAVED BANKS</span></div>
      <div className={styles.controls}>
        <label>FOLDER <input value={folder} onChange={e=>setFolder(e.target.value)}/></label>
        <label>NAME <input placeholder="Bank name" value={libraryName} onChange={e=>setLibraryName(e.target.value)}/></label>
        <button onClick={saveToLibrary}>SAVE CURRENT BANK</button>
        <button onClick={backupLibrary}>BACKUP LIBRARY</button>
        <label>RESTORE BACKUP <input type="file" accept=".json" onChange={e=>{const file=e.target.files?.[0];if(file)void restoreLibrary(file);e.target.value='';}}/></label>
      </div>
      {library.map((entry,i)=><div className={styles.libraryItem} key={i}>
        <span>{entry.folder} / {entry.name}</span>
        <button onClick={()=>loadLibrary(i)}>LOAD</button>
        <button onClick={()=>setLibrary(current=>[...current,{...entry,name:entry.name+' Copy',bank:cloneBank(entry.bank)}])}>DUPLICATE</button>
        <button onClick={()=>{const name=prompt('Rename bank',entry.name);if(name?.trim())setLibrary(current=>current.map((item,j)=>j===i?{...item,name:name.trim()}:item));}}>RENAME</button>
        <button onClick={()=>{if(confirm('Delete this saved bank?'))setLibrary(current=>current.filter((_,j)=>j!==i));}}>DELETE</button>
      </div>)}
    </section>
    <section className={styles.panel}><div className={styles.panelTitle}>MIDI EXPORT <span>SEPARATE TRACKS · 16TH-NOTE GRID</span></div>
      <div className={styles.controls}>
        {tracks.map(t=><label key={t.id}>{t.label} NOTE <input type="number" min="0" max="127" value={midiNotes[t.id]} onChange={e=>setMidiNotes(previous=>({...previous,[t.id]:Math.max(0,Math.min(127,Number(e.target.value)||0))}))}/></label>)}
        <button onClick={exportMidi}>EXPORT SELECTED MIDI</button><button onClick={()=>void exportAllMidi()}>EXPORT 24 MIDI FILES (ZIP)</button>
      </div>
    </section>
    <section className={styles.panel}><div className={styles.export}>
      <label>HARDWARE BANK NUMBER <input aria-label="Hardware bank number" type="number" min={0} max={63}
        value={bankNumber} onChange={e => setBankNumber(Math.min(63, Math.max(0, Number(e.target.value) || 0)))} /></label>
      <button className={styles.primary} onClick={exportBank}>EXPORT STOLPERBEATS BANK</button>
    </div><p className={styles.hint}>Draft automatically saved on this Mac. Exports use the existing verified bank serializer.</p></section>
    <footer>{status}</footer>
  </div>;
}
