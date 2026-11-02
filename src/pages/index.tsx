import Head from 'next/head';
import Sequencer from '@/components/Sequencer';

export default function Home() {
  return <>
    <Head><title>Stoplerbeats — Midi Generator and Converter</title><meta name="theme-color" content="#100b13" /></Head>
    <Sequencer />
  </>;
}
