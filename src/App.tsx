import { useEffect } from 'react';
import { useAppStore } from './store/appStore';
import { getAllAttempts } from './lib/db';
import ImportScreen from './components/ImportScreen';
import ProcessingScreen from './components/ProcessingScreen';
import PlayerScreen from './components/PlayerScreen';

export default function App() {
  const screen = useAppStore(s => s.screen);
  const setAttempts = useAppStore(s => s.setAttempts);

  // Load persisted attempts on first mount
  useEffect(() => {
    getAllAttempts().then(setAttempts).catch(console.error);
  }, [setAttempts]);

  if (screen === 'processing') return <ProcessingScreen />;
  if (screen === 'player') return <PlayerScreen />;
  return <ImportScreen />;
}
