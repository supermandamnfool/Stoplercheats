import Head from 'next/head';
import { useState } from 'react';
import MidiUploader from '@/components/MidiUploader';
import Sequencer from '@/components/Sequencer';

export default function Home() {
  const [tab, setTab] = useState<'sequencer' | 'converter'>('sequencer');
  return <>
    <Head><title>Stoplercheats — MIDI Converter &amp; Generator</title></Head>
    <nav style={{ background: '#101110', padding: '14px 26px 0', display: 'flex', gap: 10, fontFamily: 'Inter, Arial, sans-serif' }}>
      <button onClick={() => setTab('sequencer')} style={{ padding: '12px 20px', background: tab === 'sequencer' ? '#e5d47e' : '#242622', color: tab === 'sequencer' ? '#161711' : '#eee', border: '1px solid #777', borderRadius: 5, fontWeight: 700 }}>PATTERN SEQUENCER</button>
      <button onClick={() => setTab('converter')} style={{ padding: '12px 20px', background: tab === 'converter' ? '#e5d47e' : '#242622', color: tab === 'converter' ? '#161711' : '#eee', border: '1px solid #777', borderRadius: 5, fontWeight: 700 }}>MIDI CONVERTER</button>
    </nav>
    <main>{tab === 'sequencer' ? <Sequencer /> : <div style={{ padding: 24 }}><MidiUploader /></div>}</main>
  </>;
}
