import { describe, expect, it, vi } from 'vitest';
import { handleBack, pushBackHandler } from './backButton';

describe('back button stack', () => {
  it('does nothing when no screen has claimed it', () => {
    expect(handleBack()).toBe(false);
  });

  it('runs the most recent claim only', () => {
    const onboarding = vi.fn();
    const sheet = vi.fn();
    const releaseOnboarding = pushBackHandler(onboarding);
    const releaseSheet = pushBackHandler(sheet);
    expect(handleBack()).toBe(true);
    expect(sheet).toHaveBeenCalledTimes(1);
    expect(onboarding).not.toHaveBeenCalled();

    releaseSheet(); // the sheet closed: back goes to the screen underneath again
    expect(handleBack()).toBe(true);
    expect(onboarding).toHaveBeenCalledTimes(1);
    releaseOnboarding();
    expect(handleBack()).toBe(false);
  });

  it('releases a claim out of order without disturbing the others', () => {
    const a = vi.fn();
    const b = vi.fn();
    const releaseA = pushBackHandler(a);
    const releaseB = pushBackHandler(b);
    releaseA();
    handleBack();
    expect(b).toHaveBeenCalledTimes(1);
    expect(a).not.toHaveBeenCalled();
    releaseB();
    releaseB(); // releasing twice is harmless
    expect(handleBack()).toBe(false);
  });
});
