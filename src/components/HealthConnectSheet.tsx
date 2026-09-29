// Shown when Connect finds no Health Connect on an Android phone (src/lib/healthConnect.ts): on Android 9–13 a button to
// get it from the Play Store and "I've installed it" to try again; on older phones, why it can't work and what still
// does. Google Fit (and Samsung Health, Fitbit, most watches) reach Kinetix Fit through Health Connect too.
import { Sheet } from './Pickers';
import { HEALTH_CONNECT_PLAY_URL, type HealthConnectProblem } from '../lib/healthConnect';

interface Props {
  problem: HealthConnectProblem | null;
  busy: boolean;
  /** try connecting again (after installing) */
  onRetry: () => void;
  onClose: () => void;
}

export default function HealthConnectSheet({ problem, busy, onRetry, onClose }: Props) {
  // Capacitor hands web links to Android, which opens the Play Store app on Health Connect's page
  const openPlayStore = () => { window.location.href = HEALTH_CONNECT_PLAY_URL; };
  return (
    <Sheet open={problem !== null} title={problem === 'unsupported' ? 'Health Connect isn’t available' : 'Get Health Connect'} onClose={onClose}>
      <div className="kx-add-workout">
        {problem === 'unsupported' ? (
          <>
            <p className="kx-card-sub">Kinetix Fit reads steps, sleep and heart rate through Health Connect, which needs Android 9 or newer, so this phone can’t share them.</p>
            <p className="kx-hs-note">You can still use everything else: log workouts, water and food yourself, and do your daily check-in.</p>
            <button type="button" className="primary-btn" onClick={onClose}>OK</button>
          </>
        ) : (
          <>
            <p className="kx-card-sub">Kinetix Fit reads your steps, sleep and heart rate through Health Connect, Google’s free health app. It’s built into Android 14 and newer; on this phone it’s a separate app.</p>
            <ol className="kx-steps">
              <li>Tap <strong>Get Health Connect</strong> and install it from the Play Store.</li>
              <li>Using <strong>Google Fit</strong>? Open it and turn on syncing with Health Connect in its settings, so your steps come through. Samsung Health, Fitbit and most watches share through Health Connect too.</li>
              <li>Come back here and tap <strong>I’ve installed it</strong>.</li>
            </ol>
            <button type="button" className="primary-btn" onClick={openPlayStore}>Get Health Connect</button>
            <button type="button" className="edit-bio-btn" onClick={onRetry} disabled={busy}>{busy ? 'Checking…' : 'I’ve installed it'}</button>
          </>
        )}
      </div>
    </Sheet>
  );
}
