import { useEffect, useState } from 'react';
import App from '../App';
import { pullOnLaunch } from '../lib/sync';

// The app reads its data from this phone once, when it starts. So the account's data is pulled first, while the opening
// animation plays: every screen then starts from it (a second phone sees what the first one logged). It waits at most
// ~2 s: with no connection, or a slow one, the app opens as it is and offers a refresh if the pull later brings news.
export default function Boot() {
  const [ready, setReady] = useState(false);
  useEffect(() => { void pullOnLaunch().finally(() => setReady(true)); }, []);
  return ready ? <App /> : null;
}
