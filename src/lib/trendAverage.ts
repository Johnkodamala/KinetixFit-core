// The average on a trend card ("7-day average"): the mean of the days that have a reading, and how many days that was.
// A running total (steps so far today) or an average so far (heart rate) is a day still in progress: counted with the full
// days it pulled the average down in the small hours (17 steps at 00:45 made a 17,324 average read 14,852), so a card
// can leave today out. Needs two days, as before.

export interface TrendDay {
  /** the day, YYYY-MM-DD */
  date: string;
  /** null or 0: nothing synced for that day */
  value: number | null;
}

export function trendAverage(days: TrendDay[], today: string, leaveOutToday: boolean): { value: number; days: number } | null {
  const counted = days.filter(d => d.value !== null && d.value > 0 && !(leaveOutToday && d.date === today));
  if (counted.length < 2) return null;
  return { value: counted.reduce((sum, d) => sum + (d.value ?? 0), 0) / counted.length, days: counted.length };
}
