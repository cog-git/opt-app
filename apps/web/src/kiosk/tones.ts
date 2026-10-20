/**
 * Short Web Audio API tones for clock-in (rising) and clock-out (falling).
 * No files needed — synthesised on the fly.
 *
 * A kiosk button is a user gesture, so the AudioContext is allowed to start —
 * but browsers often hand it back suspended, so we resume() before scheduling.
 * Each note uses a short attack + exponential release so it rings cleanly
 * instead of clicking.
 */

function playTone(freqs: number[], duration = 0.16, gain = 0.22): void {
  try {
    const ctx = new AudioContext();
    // Autoplay policies may hand back a suspended context even inside a click;
    // resume() lets the scheduled notes actually sound.
    void ctx.resume();
    let t = ctx.currentTime;
    for (const freq of freqs) {
      const osc = ctx.createOscillator();
      const env = ctx.createGain();
      osc.connect(env);
      env.connect(ctx.destination);
      osc.type = 'triangle'; // a touch richer than a pure sine, carries better
      osc.frequency.value = freq;
      env.gain.setValueAtTime(0.0001, t);
      env.gain.exponentialRampToValueAtTime(gain, t + 0.015); // quick attack
      env.gain.exponentialRampToValueAtTime(0.0001, t + duration); // release
      osc.start(t);
      osc.stop(t + duration);
      t += duration;
    }
    // close after tones finish
    setTimeout(() => ctx.close(), (freqs.length * duration + 0.3) * 1000);
  } catch {
    // audio not available — silently ignore
  }
}

/** Rising three-note arpeggio: clock IN — bright and welcoming. */
export function playClockInTone(): void {
  playTone([523, 659, 784]); // C5 → E5 → G5
}

/** Falling two-note chime: clock OUT — clearly the reverse of clock-in. */
export function playClockOutTone(): void {
  playTone([784, 523, 392]); // G5 → C5 → G4
}

/** Soft single ping: job selected. */
export function playJobTone(): void {
  playTone([659], 0.12, 0.18); // E5
}

/** Error buzz. */
export function playErrorTone(): void {
  playTone([220, 196], 0.18, 0.16); // low falling
}
