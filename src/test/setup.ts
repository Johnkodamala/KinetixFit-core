// A fresh in-memory localStorage for every test (Node has none of its own without a storage file).
import { beforeEach } from 'vitest';

class MemoryStorage implements Storage {
  private items = new Map<string, string>();
  get length() { return this.items.size; }
  clear() { this.items.clear(); }
  getItem(key: string) { return this.items.has(key) ? this.items.get(key)! : null; }
  key(index: number) { return [...this.items.keys()][index] ?? null; }
  removeItem(key: string) { this.items.delete(key); }
  setItem(key: string, value: string) { this.items.set(key, String(value)); }
}

Object.defineProperty(globalThis, 'localStorage', { value: new MemoryStorage(), configurable: true, writable: true });

beforeEach(() => localStorage.clear());
