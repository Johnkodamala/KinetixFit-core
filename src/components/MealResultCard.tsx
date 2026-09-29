// The Check a food result for a meal photo of several foods (or of one food the photo wasn't sure of), and for a typed
// meal ("muesli with milk and banana"). Each food logged is its own entry on today's log — tapping it opens the usual
// FoodEntrySheet to change its amount or remove it — and the totals follow the entries. Foods the photo wasn't sure about, or couldn't tell the amount of, aren't logged until
// the person says so: "Yes, add it", "It's mango", or "Skip".
import { ChevronIcon } from './Icons';
import { fmtNumber } from '../lib/countries';
import { entryNutrients, foodTitle, portionText, sumNutrients, type LogEntry, type ScanItem } from '../lib/foodLog';

export interface MealCard {
  /** shared by the meal's entries (LogEntry.meal) */
  id: string;
  name: string;
  /** its logged foods, in the order they were seen */
  entryIds: string[];
  /** foods not logged yet */
  pending: ScanItem[];
  /** foods left out: one of the person's allergens ("Papaya — it has …"), or a typed food that couldn't be looked up */
  notAdded: string[];
  /** "Chicken curry: Not vegetarian — it has chicken." */
  dietNotes: string[];
  /** the photo's note and its add-ons, for the first food logged */
  note?: string;
  extras?: LogEntry['extras'];
}

interface MealResultCardProps {
  card: MealCard;
  /** the card's entries still on today's log */
  entries: LogEntry[];
  recommendation: string;
  onOpen: (entryId: string) => void;
  onConfirm: (item: ScanItem) => void;
  onChoose: (item: ScanItem, name: string) => void;
  onSkip: (item: ScanItem) => void;
  onTypeIt: (name: string) => void;
}

// "about 175 g" when the photo couldn't really show it
const amountText = (item: ScanItem) =>
  item.amount === null ? '' : `${item.amountConfidence === 'low' ? 'about ' : ''}${fmtNumber(item.amount)} ${item.unit}`;

export default function MealResultCard({ card, entries, recommendation, onOpen, onConfirm, onChoose, onSkip, onTypeIt }: MealResultCardProps) {
  const n = sumNutrients(entries);
  const status = [entries.length === 1 ? '1 food logged' : `${entries.length} foods logged`, card.pending.length ? `${card.pending.length} to check` : '']
    .filter(Boolean).join(' · ');
  return (
    <div className={`kx-food-result ${card.notAdded.length ? 'is-warning' : 'is-clear'}`} aria-live="polite">
      <span className="kx-food-status">{status}</span>
      <div className="kx-food-title">
        <h4>{card.name}</h4>
        {entries.length > 1 && <span className="kx-food-portion">Each food on its own — tap one to change it</span>}
      </div>

      {entries.length > 0 && (
        <>
          <p className="kx-food-kcal"><strong>{fmtNumber(Math.round(n.kcal))}</strong> kcal</p>
          <div className="kx-food-macros">
            <span><strong>{Math.round(n.carbs)}g</strong>carbs</span>
            <span><strong>{Math.round(n.protein)}g</strong>protein</span>
            <span><strong>{Math.round(n.fiber)}g</strong>fibre</span>
            <span><strong>{Math.round(n.fat)}g</strong>fat</span>
          </div>
          <ul className="kx-foodlog-list" aria-label="Foods in this meal">
            {entries.map(e => (
              <li key={e.id}>
                <button type="button" className="kx-foodlog-row" onClick={() => onOpen(e.id)} aria-label={`${e.name}, ${portionText(e)}. Change or remove`}>
                  <span className="kx-foodlog-name">
                    <strong>{foodTitle(e.name)}</strong>
                    <small>
                      {portionText(e)}
                      {e.amountGuess ? <span className="kx-guess"> · a guess — check it</span> : e.estimated ? ' · estimate' : ''}
                    </small>
                  </span>
                  <span className="kx-foodlog-kcal">{fmtNumber(Math.round(entryNutrients(e).kcal))}<small> kcal</small></span>
                  <ChevronIcon className="kx-row-chevron" />
                </button>
              </li>
            ))}
          </ul>
        </>
      )}

      {card.pending.map((item, i) => (
        <div key={`${item.name}-${i}`} className="kx-meal-pending">
          {item.amount === null || !item.per100 ? (
            <>
              <p>
                <strong>{foodTitle(item.name)}</strong>: couldn’t tell {item.per100 ? 'how much there was' : 'its nutrition'}. Type it
                with an amount to add it.
              </p>
              <div className="kx-chip-wrap">
                <button type="button" className="kx-chip kx-chip-sm" onClick={() => onTypeIt(item.name)}>Type it</button>
                <button type="button" className="kx-chip kx-chip-sm" onClick={() => onSkip(item)}>Skip</button>
              </div>
            </>
          ) : (
            <>
              <p>Not sure: is this <strong>{item.name}</strong>{amountText(item) ? `, ${amountText(item)}` : ''}?</p>
              <div className="kx-chip-wrap">
                <button type="button" className="kx-chip kx-chip-sm" onClick={() => onConfirm(item)}>Yes, add it</button>
                {item.alternatives.map(name => (
                  <button key={name} type="button" className="kx-chip kx-chip-sm" onClick={() => onChoose(item, name)}>It’s {name}</button>
                ))}
                <button type="button" className="kx-chip kx-chip-sm" onClick={() => onSkip(item)}>Skip</button>
              </div>
            </>
          )}
        </div>
      ))}

      {card.notAdded.map(text => <p key={text} className="kx-food-diet-note">Not added: {text}</p>)}
      {card.dietNotes.map(text => <p key={text} className="kx-food-diet-note">{text}</p>)}

      {entries.length > 0 && (
        <div className="kx-food-note">
          <strong>What this means for you</strong>
          <p>{recommendation}</p>
        </div>
      )}
      <p className="kx-food-logged">
        {entries.length ? 'Added to today’s food above, each food on its own.' : 'Nothing added yet.'}
      </p>
    </div>
  );
}
