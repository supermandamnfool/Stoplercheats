import { BANK_NUM_PATTERNS, Bank } from '@/core/bank';
import { convertMidiFilesToBank, convertMidiFileToDensityBank } from '@/core/midi-file-reader';
import { FormEvent, useCallback, useRef, useState } from 'react'
import arrayBufferToBuffer from 'arraybuffer-to-buffer'
import NoteMapper from '@/components/NoteMapper';
import FileSelector from '@/components/FileSelector';
import { DefaultMidiNoteMap, MidiNoteMap } from '@/core/midi-note-map';
import { Track } from '@/core/track';
import FileSaver from 'file-saver';
import styles from './MidiUploader.module.css';

const getBuffersFromFormFiles = async (form: HTMLFormElement): Promise<(Buffer | undefined)[]> => {
  const inputs = (new Array(BANK_NUM_PATTERNS * 2).fill(0)).map((_, i) => {
    const element = form[i];
    return element.tagName === 'INPUT' ? element : null;
  }).filter(Boolean) as HTMLInputElement[];
  return Promise.all(inputs.map((input) =>
    new Promise<Buffer | undefined>((resolve) => {
      const file = input.files?.[0];
      if (!file) {
        resolve(undefined);
        return;
      }

      const reader = new FileReader();
      reader.onload = (e) => {
        const fileBuffer = e.target?.result ?? undefined;
        if (!fileBuffer || typeof fileBuffer === 'string') {
          resolve(undefined);
          return;
        }
        var buffer = arrayBufferToBuffer(fileBuffer);
        resolve(buffer);
      };
      reader.readAsArrayBuffer(file);
    })
  ));
}


const generateBankForForm = async (form: HTMLFormElement, midiNoteMap: MidiNoteMap): Promise<Bank> => {
  const buffers = await getBuffersFromFormFiles(form);
  const bank = await convertMidiFilesToBank(buffers, midiNoteMap);
  return bank;
}

export default function MidiUploader() {
  const [bankString, setBankString] = useState('');

  const [midiNoteMapEntries, setMidiNoteMapEntries] = useState(
    Object.entries(DefaultMidiNoteMap)
      .map(([midiNoteNumberStr, track]) => [parseInt(midiNoteNumberStr, 10), track] as [number, Track])
  )



  const [densitySweepEnabled, setDensitySweepEnabled] = useState(false);

const onSubmit = useCallback(async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const midiNoteMap = Object.fromEntries(midiNoteMapEntries);
    if (densitySweepEnabled) {
      const inputs = Array.from(e.currentTarget.querySelectorAll('input[type="file"]')) as HTMLInputElement[];
      const files = inputs.map(inp => inp.files?.[0]).filter(Boolean) as File[];
      if (files.length !== 1) {
        alert('Density sweep mode requires exactly one MIDI file.');
        return;
      }
      const buf = await files[0].arrayBuffer();
      const bank = await convertMidiFileToDensityBank(buf, midiNoteMap, BANK_NUM_PATTERNS);
      setBankString(bank.toString());
      return;
    }
    const bank = await generateBankForForm(e.currentTarget, midiNoteMap);
    setBankString(bank.toString());
  }, [midiNoteMapEntries, densitySweepEnabled]);

  const bankTextAreaRef = useRef<HTMLTextAreaElement>(null);
  const copyText = useCallback(async (text: string): Promise<void> => navigator.clipboard.writeText(text), []);
  const copyBank: React.MouseEventHandler = useCallback((e) => {
    e.preventDefault();
    if (!bankTextAreaRef.current) {
      return;
    }
    copyText(bankTextAreaRef.current.value).catch(console.error);
  }, [copyText]);
  const saveText = useCallback((text: string) => {
    const blob = new Blob([text], {type: "text/csv;charset=us-ascii"});
    FileSaver.saveAs(blob, "PatternBank000.txt");
  }, []);
  const saveBank: React.MouseEventHandler = useCallback((e) => {
    e.preventDefault();
    if (!bankTextAreaRef.current) {
      return;
    }
    saveText(bankTextAreaRef.current.value);
  }, [saveText]);

  return <div className={styles.converter}>
    <header className={styles.converterHeader}><h2>MIDI CONVERTER</h2><p>IMPORT MIDI · MAP INSTRUMENTS · GENERATE A STOLPERBEATS BANK</p></header>
    <form onSubmit={onSubmit}>
      <section className={styles.card}>
        <div className={styles.sectionHeading}><h3>01 / MIDI IMPORT</h3><span>UP TO 24 PATTERN SLOTS</span></div>
        <p>Choose MIDI files for the pattern slots you want to fill. Empty slots are allowed.</p>
        <div className={styles.fileGrid}><FileSelector /></div>
      </section>
      <div className={styles.twoColumns}>
        <section className={styles.card}>
          <div className={styles.sectionHeading}><h3>02 / TRACK MAPPING</h3><span>MIDI NOTE → DRUM TRACK</span></div>
          <p>Assign incoming MIDI note numbers to the six Stolperbeats tracks. Red rows indicate duplicate notes.</p>
          <div className={styles.mapper}><NoteMapper midiNoteMapEntries={midiNoteMapEntries} setMidiNoteMapEntries={setMidiNoteMapEntries} /></div>
        </section>
        <section className={styles.card}>
          <div className={styles.sectionHeading}><h3>03 / CONVERSION SETTINGS</h3><span>PATTERN GENERATION</span></div>
          <label className={styles.setting}><input type="checkbox" checked={densitySweepEnabled} onChange={e=>setDensitySweepEnabled(e.target.checked)}/>
            <span><strong>DENSITY SWEEP</strong><small>Fill all 24 patterns with density variations from a single MIDI file. When enabled, select exactly one MIDI file above.</small></span>
          </label>
          <div className={styles.actionArea}><button className={styles.primary} type="submit">GENERATE STOLPERBEATS BANK →</button></div>
        </section>
      </div>
    </form>
    <section className={styles.card}>
      <div className={styles.sectionHeading}><h3>04 / EXPORT</h3><span>STOLPERBEATS BANK FORMAT</span></div>
      {bankString ? <><p>Conversion complete. Save the generated pattern bank or copy its text.</p>
        <div className={styles.exportActions}><button onClick={saveBank}>SAVE PATTERN BANK</button><button onClick={copyBank}>COPY BANK TEXT</button></div>
        <textarea className={styles.output} rows={13} ref={bankTextAreaRef} value={bankString} readOnly aria-label="Generated Stolperbeats bank text"/>
      </> : <p>Generate a bank above to enable export.</p>}
    </section>
  </div>;
}
