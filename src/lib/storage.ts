// Shared localStorage read/write, used by every domain module (foodLog, gut, checkins, water, …).
// Pure refactor of what each module used to keep as a private copy — same behaviour, one definition.
export const readJson = <T,>(key: string): T | null => {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
};

export const writeJson = (key: string, value: unknown) => {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // storage full or blocked: kept in memory for this session
  }
};
