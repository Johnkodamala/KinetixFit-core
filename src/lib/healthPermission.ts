// Health Connect (Android) lets the person take a permission away in its own settings at any time. Before, the app only noticed
// missing data, not a missing permission: after the permission was removed Today still said "Synced with Health Connect" and
// Steps waited for data for ever. Apple Health never tells an app whether reading is allowed, so this is Android only.

/** What the Today cards read first: steps, heart rate and sleep. */
export const CORE_HEALTH_TYPES = ['steps', 'heartRate', 'sleep'] as const;

/** Whether the person has taken the permission away: Health Connect allows none of the core types. Allowing only some is a
 *  choice (a card or two switched off on purpose), and the other types (workouts, vitals) don't make the cards work. */
export const healthPermissionRemoved = (readAuthorized: readonly string[]): boolean => CORE_HEALTH_TYPES.every(t => !readAuthorized.includes(t));
