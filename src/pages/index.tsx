import Head from 'next/head';
import MidiUploader from '@/components/MidiUploader';

export default function Home() {
  return (
    <>
      <Head>
        <title>Stolperbeats MIDI Converter</title>
      </Head>
      <main>
        <MidiUploader />
      </main>
    </>
  );
}
