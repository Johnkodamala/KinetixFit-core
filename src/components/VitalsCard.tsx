// Today → Body and vitals: the newest reading of each health number the watch, scale or phone shares beyond steps,
// heart rate and sleep (src/lib/vitals.ts) — only the ones there are. Connections made before these types were added are
// asked once to allow them. Nothing here leaves the phone.
import type { VitalTile } from '../lib/vitals';
import { HeartIcon } from './Icons';

interface VitalsCardProps {
  tiles: VitalTile[];
  /** the new types haven't been allowed (or, on iPhone, asked for) yet */
  needsAccess: boolean;
  /** the app the readings come from, e.g. "Samsung Health" */
  source: string | null;
  /** no watch: ask only for what a phone (or a scale) records */
  phoneOnly?: boolean;
  platform: 'ios' | 'android' | 'web';
  onAllow: () => void;
}

export default function VitalsCard({ tiles, needsAccess, source, phoneOnly, platform, onAllow }: VitalsCardProps) {
  const from = source ?? (platform === 'ios' ? 'Apple Health' : phoneOnly ? 'your phone' : 'your watch');
  return (
    <div className="hub-support-card kx-vitals">
      <h3 className="card-header-title">
        <span className="kx-title-icon" style={{ ['--tint' as string]: 'var(--m-heart)' }}><HeartIcon size={16} /></span>
        Body and vitals
      </h3>
      {tiles.length > 0 && (
        <>
          <p className="kx-card-sub">The latest from {from}. It stays on your phone.</p>
          <div className="kx-vitals-grid">
            {tiles.map(t => (
              <div key={t.id} className="kx-vital">
                <span className="kx-vital-label">{t.label}</span>
                <strong className="kx-vital-value">{t.value}<small>{t.unit}</small></strong>
                <span className="kx-vital-when">{t.when}</span>
                {t.note && <span className="kx-vital-note">{t.note}</span>}
              </div>
            ))}
          </div>
          <p className="kx-vitals-foot">Typical ranges are a guide, not a diagnosis. If a reading worries you, talk to a pharmacist or doctor.</p>
        </>
      )}
      {needsAccess ? (
        <div className="kx-vitals-ask">
          <p className="kx-card-sub">
            {tiles.length > 0
              ? `Allow the rest to see more from ${from}.`
              : phoneOnly
                ? `Kinetix Fit can also show the distance you walk, the calories you burn and your weight from ${from}.`
                : `Kinetix Fit can show your resting heart rate, blood oxygen, blood pressure, weight, body fat, VO₂ max, distance and calories burned from ${from}.`}
          </p>
          <button type="button" className="primary-btn" onClick={onAllow}>
            {platform === 'ios' ? 'Allow in Apple Health' : 'Allow in Health Connect'}
          </button>
        </div>
      ) : tiles.length === 0 && (
        <div className="kx-empty">
          <span className="kx-empty-icon"><HeartIcon size={20} /></span>
          <p>No readings yet. Blood oxygen, blood pressure, weight and more show up here once {from} records them.</p>
        </div>
      )}
    </div>
  );
}
