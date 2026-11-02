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
import MidiUploader from '@/components/MidiUploader';

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
function RotaryKnob({label,value,onChange}:{label:string;value:number;onChange:(value:number)=>void}) {
  const drag=useRef<{y:number;value:number}|null>(null);
  const update=(next:number)=>onChange(Math.max(0,Math.min(1,Math.round(next*100)/100)));
  return <div className={styles.knobControl}>
    <span className={styles.knobLabel}>{label}</span>
    <div className={styles.knob} role="slider" tabIndex={0} aria-label={label}
      aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(value*100)}
      aria-valuetext={`${Math.round(value*100)} percent`}
      title="Drag up or down to turn; arrow keys adjust"
      onPointerDown={e=>{if(e.button!==0)return;drag.current={y:e.clientY,value};e.currentTarget.setPointerCapture(e.pointerId);e.preventDefault();}}
      onPointerMove={e=>{if(!drag.current)return;update(drag.current.value+(drag.current.y-e.clientY)/150);}}
      onPointerUp={e=>{drag.current=null;if(e.currentTarget.hasPointerCapture(e.pointerId))e.currentTarget.releasePointerCapture(e.pointerId);}}
      onPointerCancel={()=>{drag.current=null;}}
      onKeyDown={e=>{if(e.key==='ArrowUp'||e.key==='ArrowRight'){update(value+.01);e.preventDefault();}else if(e.key==='ArrowDown'||e.key==='ArrowLeft'){update(value-.01);e.preventDefault();}else if(e.key==='Home'){update(0);e.preventDefault();}else if(e.key==='End'){update(1);e.preventDefault();}}}>
      <span className={styles.knobFace} style={{transform:`rotate(${-135+value*270}deg)`}}><span className={styles.knobIndicator}/></span>
    </div>
    <span className={styles.knobValue}>{Math.round(value*100)}%</span>
  </div>;
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
  const [view, setView] = useState<'sequencer'|'generator'|'library'|'converter'>('sequencer');
  const [selectedTrack, setSelectedTrack] = useState<Track>(Tracks.KICK);
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
  const clearEverything = () => {
    const confirmation = window.prompt(
      'CLEAR EVERYTHING? This will erase all 24 patterns on all six tracks AND permanently delete every saved bank in the Library. This cannot be undone. Type DELETE ALL to confirm.'
    );
    if (confirmation !== 'DELETE ALL') return;
    stop();
    const blank = emptySteps();
    setSteps(blank);
    stepsRef.current = blank;
    setLibrary([]);
    setHistory([]);
    setFuture([]);
    setPatternClipboard(null);
    setTrackClipboard(null);
    setSlot(0);
    setBankNumber(0);
    setStatus('ALL PATTERNS AND SAVED LIBRARY BANKS CLEARED');
  };
  const exportBank = () => {
    try {
      const filename = `PatternBank${String(bankNumber).padStart(3, '0')}.txt`;
      FileSaver.saveAs(new Blob([serializeBank(steps)], { type: 'text/plain;charset=us-ascii' }), filename);
      setStatus(`EXPORTED ${filename.toUpperCase()}`);
    } catch { setStatus('EXPORT FAILED'); }
  };

  const current = tracks.find(t=>t.id===selectedTrack)!;
  const selectedEditable = !locked.includes(selectedTrack);
  const runSelected=(action:'random'|'mutate'|'clear'|'reverse'|'left'|'right'|'half'|'double'|'density')=>{
    if(!selectedEditable)return;
    const row=steps[selectedTrack][slot];
    const result=action==='random'?musicalRandom(selectedTrack,density):
      action==='mutate'?mutate(selectedTrack,row,variation):
      action==='clear'?Array(current.length).fill(0):
      action==='reverse'?[...row].reverse():
      action==='left'?rotate(row,-1):
      action==='right'?rotate(row,1):
      action==='half'?timeTransform(row,0.5):
      action==='double'?timeTransform(row,2):
      changeDensity(selectedTrack,row,density);
    replaceTrack(selectedTrack,result);
  };
  const renderTrack=(t:typeof tracks[number])=>{
    const long=t.length===64;
    const renderLed=(on:number,index:number)=><button key={index}
      aria-label={`${t.label} step ${index+1}`} aria-pressed={!!on}
      title={`${t.label} · Step ${index+1}`}
      className={`${styles.led} ${on?styles.lit:''} ${t.id===Tracks.KICK||t.id===Tracks.SNARE?styles.whiteLed:t.id===Tracks.PERC2?styles.redLed:styles.orangeLed} ${playhead%t.length===index&&playing?styles.playingLed:''} ${index%8===0?styles.eightLed:''} ${index%16===0?styles.barLed:''}`}
      onClick={()=>{setSelectedTrack(t.id);if(!locked.includes(t.id))toggle(t.id,index);}}/>;
    return <div className={`${styles.matrixRow} ${long?styles.longRow:''}`} key={t.id}>
      <button className={`${styles.trackName} ${selectedTrack===t.id?styles.trackSelected:''}`}
        onClick={()=>setSelectedTrack(t.id)} aria-pressed={selectedTrack===t.id}>{t.label}</button>
      <span className={styles.trackLength}>{t.length}</span>
      <div className={styles.ledStack}>
        {(long?[0,32]:[0]).map(offset=><div key={offset} className={`${styles.ledRow} ${long?styles.longLedRow:styles.shortLedRow}`}
          style={{gridTemplateColumns:`repeat(${long?32:16},minmax(0,1fr))`}}>
          {steps[t.id][slot].slice(offset,offset+(long?32:16)).map((on,i)=>renderLed(on,i+offset))}
        </div>)}
      </div>
      <div className={styles.trackGenerator}>
        <button disabled={locked.includes(t.id)} onClick={()=>generateTrack(t.id)}>RANDOM</button>
        <button disabled={locked.includes(t.id)} onClick={()=>mutateTrack(t.id)}>MUTATE</button>
        <button disabled={locked.includes(t.id)} onClick={()=>replaceTrack(t.id,changeDensity(t.id,steps[t.id][slot],density))}>DENSITY</button>
        <button aria-pressed={locked.includes(t.id)} onClick={()=>toggleTrack(t.id,locked,setLocked)}>{locked.includes(t.id)?'UNLOCK':'LOCK'}</button>
        <button onClick={()=>{setTrackClipboard(steps[t.id][slot].slice());setSelectedTrack(t.id);}}>COPY</button>
        <button disabled={!trackClipboard||trackClipboard.length!==t.length||locked.includes(t.id)} onClick={()=>{if(trackClipboard)replaceTrack(t.id,trackClipboard.slice());}}>PASTE</button>
        <button disabled={locked.includes(t.id)} onClick={()=>replaceTrack(t.id,rotate(steps[t.id][slot],-1))}>◀ SHIFT</button>
        <button disabled={locked.includes(t.id)} onClick={()=>replaceTrack(t.id,rotate(steps[t.id][slot],1))}>SHIFT ▶</button>
        <button disabled={locked.includes(t.id)} onClick={()=>replaceTrack(t.id,timeTransform(steps[t.id][slot],0.5))}>½ TIME</button>
        <button disabled={locked.includes(t.id)} onClick={()=>replaceTrack(t.id,timeTransform(steps[t.id][slot],2))}>2× TIME</button>
        <button disabled={locked.includes(t.id)} onClick={()=>replaceTrack(t.id,[...steps[t.id][slot]].reverse())}>REVERSE</button>
        <button disabled={locked.includes(t.id)} onClick={()=>replaceTrack(t.id,Array(t.length).fill(0))}>CLEAR</button>
      </div>
    </div>;
  };
  const toggleLock=(id:Track)=>toggleTrack(id,locked,setLocked);
  const copySelected=()=>{setTrackClipboard(steps[selectedTrack][slot].slice());setStatus('TRACK COPIED');};
  const pasteSelected=()=>{if(trackClipboard&&trackClipboard.length===current.length&&selectedEditable)replaceTrack(selectedTrack,trackClipboard.slice());};
  const bankOptions=Array.from({length:24},(_,i)=><option key={i} value={i}>{String(i+1).padStart(2,'0')}</option>);
  const generatorControls=<div className={styles.generatorControls}>
    <div className={styles.generatorButtons}>
      <button className={styles.accentButton} onClick={()=>runSelected('random')} disabled={!selectedEditable}>MUSICAL RANDOM</button>
      <button onClick={()=>runSelected('mutate')} disabled={!selectedEditable}>MUTATE</button>
      <button onClick={generateBank}>BANK GEN</button>
    </div>
    <div className={styles.dials}>
      <RotaryKnob label="DENSITY" value={density} onChange={setDensity}/>
      <RotaryKnob label="VARIATION" value={variation} onChange={setVariation}/>
    </div>
    <div className={styles.dividerTitle}>TRACK LOCK</div>
    <div className={styles.lockGrid}>{tracks.map(t=><label key={t.id}><input type="checkbox" checked={locked.includes(t.id)} onChange={()=>toggleLock(t.id)}/>{t.label}</label>)}</div>
    <div className={styles.dividerTitle}>RHYTHMIC TRANSFORM</div>
    <select aria-label="Apply rhythmic transform" value="" onChange={e=>{if(e.target.value)runSelected(e.target.value as 'left'|'right'|'half'|'double'|'reverse'|'density');}}>
      <option value="">CHOOSE TRANSFORM</option><option value="left">SHIFT LEFT</option><option value="right">SHIFT RIGHT</option>
      <option value="half">½ TIME</option><option value="double">2× TIME</option><option value="reverse">REVERSE</option><option value="density">APPLY DENSITY</option>
    </select>
  </div>;
  const bankPanel=<div className={styles.extraPanel}>
    <h2>PATTERN BANK GENERATOR</h2>
    <div className={styles.controls}>
      <label>SOURCE SLOT <select value={sourceSlot} onChange={e=>setSourceSlot(Number(e.target.value))}>{bankOptions}</select></label>
      <label>EVOLUTION <select value={evolution} onChange={e=>setEvolution(e.target.value as Evolution)}><option value="steady">STEADY</option><option value="build">BUILD</option><option value="reduce">REDUCE</option><option value="wave">WAVE</option></select></label>
      <label><input type="checkbox" checked={selectedRange} onChange={e=>setSelectedRange(e.target.checked)}/> SELECTED RANGE</label>
      {selectedRange&&<><label>FROM <input type="number" min="1" max="24" value={rangeStart} onChange={e=>setRangeStart(Math.max(1,Math.min(rangeEnd,Number(e.target.value)||1)))}/></label><label>TO <input type="number" min="1" max="24" value={rangeEnd} onChange={e=>setRangeEnd(Math.max(rangeStart,Math.min(24,Number(e.target.value)||24)))}/></label></>}
      <button className={styles.accentButton} onClick={generateBank}>GENERATE VARIATIONS</button>
      <button onClick={()=>{setDensity(.3);setVariation(.35);setEvolution('steady');setSelectedRange(false);setRangeStart(1);setRangeEnd(24);}}>RESET SETTINGS</button>
    </div>
  </div>;
  const libraryPanel=<div className={styles.extraPanel}>
    <h2>LIBRARY <small>{library.length} SAVED BANKS</small></h2>
    <div className={styles.controls}>
      <label>FOLDER <input value={folder} onChange={e=>setFolder(e.target.value)}/></label>
      <label>NAME <input placeholder="Bank name" value={libraryName} onChange={e=>setLibraryName(e.target.value)}/></label>
      <button onClick={saveToLibrary}>SAVE CURRENT BANK</button>
      <button onClick={backupLibrary}>BACKUP LIBRARY</button>
      <label>RESTORE BACKUP <input type="file" accept=".json" onChange={e=>{const file=e.target.files?.[0];if(file)void restoreLibrary(file);e.target.value='';}}/></label>
    </div>
    {library.map((entry,i)=><div className={styles.libraryItem} key={i}>
      <span>{entry.folder} / {entry.name}</span><button onClick={()=>loadLibrary(i)}>LOAD</button>
      <button onClick={()=>setLibrary(current=>[...current,{...entry,name:entry.name+' Copy',bank:cloneBank(entry.bank)}])}>DUPLICATE</button>
      <button onClick={()=>{const name=prompt('Rename bank',entry.name);if(name?.trim())setLibrary(current=>current.map((item,j)=>j===i?{...item,name:name.trim()}:item));}}>RENAME</button>
      <button onClick={()=>{if(confirm('Delete this saved bank?'))setLibrary(current=>current.filter((_,j)=>j!==i));}}>DELETE</button>
    </div>)}
  </div>;
  const exportPanel=<div className={styles.extraPanel}>
    <h2>MIDI EXPORT <small>SIX NAMED TRACKS · 16TH GRID</small></h2>
    <div className={styles.controls}>
      {tracks.map(t=><label key={t.id}>{t.label} NOTE <input type="number" min="0" max="127" value={midiNotes[t.id]} onChange={e=>setMidiNotes(previous=>({...previous,[t.id]:Math.max(0,Math.min(127,Number(e.target.value)||0))}))}/></label>)}
      <button onClick={exportMidi}>EXPORT SELECTED MIDI</button><button onClick={()=>void exportAllMidi()}>EXPORT 24 MIDI FILES (ZIP)</button>
    </div>
  </div>;
  return <div className={styles.app}>
    <header className={styles.topBar}>
      <div className={styles.brand}><strong>Stoplerbeats</strong><span>Midi Generator and Converter</span></div>
      <nav className={styles.navigation} aria-label="Application sections">
        {(['sequencer','converter','library'] as const).map(name=><button key={name} className={view===name?styles.activeTab:''} onClick={()=>setView(name)}>{name==='sequencer'?'SEQUENCER':name==='converter'?'MIDI CONVERTER':'LIBRARY'}</button>)}
      </nav>
    </header>
    <div style={{display:view==='sequencer'?'block':'none'}}>
      <div className={styles.transport}>
        <div className={styles.transportLeft}>
          <button className={`${styles.roundTransport} ${playing?styles.transportOn:''}`} onClick={()=>void play()} aria-label={playing?'Stop':'Play'} title={playing?'Stop playback':'Start playback'}>{playing?'■':'▶'}</button>
          <label className={styles.tempo}>BPM <input type="number" min="40" max="260" value={bpm} onChange={e=>setBpm(Math.max(40,Math.min(260,Number(e.target.value)||120)))}/></label>
          <label className={styles.volume}>VOLUME <input aria-label="Master volume" type="range" min="0" max="1" step=".01" value={volume} onChange={e=>{setVolume(Number(e.target.value));audioRef.current?.volume(Number(e.target.value));}}/></label>
        </div>
        <div className={styles.patternPicker}>
          <span className={styles.sectionCaption}>PATTERN</span>
          <div className={styles.patternSelect}><button onClick={()=>setSlot(i=>(i+23)%24)} aria-label="Previous pattern">◀</button><strong>{String(slot+1).padStart(2,'0')}</strong><button onClick={()=>setSlot(i=>(i+1)%24)} aria-label="Next pattern">▶</button></div>
        </div>
        <div className={styles.slotMatrix}>{Array.from({length:24},(_,i)=><button key={i} className={slot===i?styles.slotActive:''} onClick={()=>setSlot(i)} aria-label={`Pattern ${i+1}`}>{String(i+1).padStart(2,'0')}</button>)}</div>
        <div className={styles.editBox}><div className={styles.sectionCaption}>EDIT <small>SELECTED TRACK: {current.label}</small></div>
          <div className={styles.editButtons}>
            <button onClick={copySelected}>COPY</button><button onClick={pasteSelected} disabled={!trackClipboard||trackClipboard.length!==current.length||!selectedEditable}>PASTE</button>
            <button onClick={()=>runSelected('clear')} disabled={!selectedEditable}>CLEAR</button><button onClick={()=>runSelected('reverse')} disabled={!selectedEditable}>REVERSE</button>
            <button onClick={()=>runSelected('left')} disabled={!selectedEditable}>◀ SHIFT</button><button onClick={()=>runSelected('right')} disabled={!selectedEditable}>SHIFT ▶</button>
            <button onClick={undo} disabled={!history.length}>UNDO</button><button onClick={redo} disabled={!future.length}>REDO</button>
          </div>
        </div>
      </div>
      <div className={styles.workspace}>
        <section className={styles.sequencerMatrix}>
          <div className={styles.matrixHeading}><span>TRACK</span><span>LENGTH</span><span>STEPS · GROUPED IN EIGHTS</span><span>TRACK GENERATOR</span></div>
          {tracks.map(renderTrack)}
        </section>
        
      </div>
      {generatorOpen&&<div className={styles.bankInline}>{bankPanel}<div className={styles.bankInlineSettings}>{generatorControls}</div></div>}
      <div className={styles.bottomBar}>
        <section><h2>AUDIO</h2><div className={styles.audioGrid}><span></span>{tracks.map(t=><strong key={t.id}>{t.label}</strong>)}<span>MUTE</span>{tracks.map(t=><label key={t.id}><input type="checkbox" checked={muted.includes(t.id)} onChange={()=>toggleTrack(t.id,muted,setMuted)}/></label>)}<span>SOLO</span>{tracks.map(t=><label key={t.id}><input type="checkbox" checked={solo.includes(t.id)} onChange={()=>toggleTrack(t.id,solo,setSolo)}/></label>)}</div></section>
        <section><h2>BANK</h2><div className={styles.bottomButtons}><button onClick={generateBank}>GENERATE</button><button onClick={()=>setGeneratorOpen(v=>!v)} aria-expanded={generatorOpen}>{generatorOpen?'HIDE VARIATIONS':'VARIATIONS'}</button><button onClick={copyPattern} disabled={slot===0}>COPY PREVIOUS</button><button onClick={clearPattern}>CLEAR PATTERN</button><button onClick={clearEverything} title="Erase all patterns and every saved Library bank">CLEAR EVERYTHING</button></div></section>
        <section><h2>EXPORT</h2><div className={styles.bottomButtons}><label>BANK # <input type="number" min="0" max="63" value={bankNumber} onChange={e=>setBankNumber(Math.max(0,Math.min(63,Number(e.target.value)||0)))}/></label><button onClick={exportBank}>STOLPERBEATS</button><button onClick={exportMidi}>MIDI</button></div></section>
      </div>
    </div>

    {view==='library'&&libraryPanel}
    {view==='converter'&&<>{exportPanel}<div className={styles.converterLegacy}><MidiUploader /></div></>}
    <footer>{status} · AUTOSAVED LOCALLY · STOPLERCHEATS</footer>
  </div>;
}
