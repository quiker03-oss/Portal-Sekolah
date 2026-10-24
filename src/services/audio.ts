// Audio feedback using Web Audio API
class SoundService {
  private ctx: AudioContext | null = null;

  private initCtx() {
    if (!this.ctx && typeof window !== 'undefined') {
      const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      if (AudioCtx) {
        this.ctx = new AudioCtx();
      }
    }
    if (this.ctx && this.ctx.state === 'suspended') {
      this.ctx.resume().catch(() => {});
    }
  }

  playSuccess() {
    try {
      this.initCtx();
      if (!this.ctx) return;
      
      const now = this.ctx.currentTime;
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();

      osc.type = 'sine';
      osc.frequency.setValueAtTime(587.33, now); // D5
      osc.frequency.setValueAtTime(880, now + 0.08); // A5

      gain.gain.setValueAtTime(0.15, now);
      gain.gain.exponentialRampToValueAtTime(0.01, now + 0.3);

      osc.connect(gain);
      gain.connect(this.ctx.destination);

      osc.start(now);
      osc.stop(now + 0.3);
    } catch {
      // Audio playback might be restricted by user gesture policy
    }
  }

  playScannerBeep() {
    try {
      this.initCtx();
      if (!this.ctx) return;
      const now = this.ctx.currentTime;
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(1760, now); // A6 crisp scanner gun beep
      gain.gain.setValueAtTime(0.25, now);
      gain.gain.exponentialRampToValueAtTime(0.01, now + 0.09);
      osc.connect(gain);
      gain.connect(this.ctx.destination);
      osc.start(now);
      osc.stop(now + 0.09);
    } catch {
      // Audio playback might be restricted
    }
  }

  speak(text: string) {
    if ("speechSynthesis" in window) {
      window.speechSynthesis.cancel();
      const utterance = new SpeechSynthesisUtterance(text);
      utterance.lang = "id-ID";
      utterance.rate = 0.85;
      utterance.pitch = 1.1;
      
      const voices = window.speechSynthesis.getVoices();
      const idVoice = voices.find(v => v.lang.includes("id-ID") || v.lang.includes("id_ID") || v.lang.includes("Indonesia"));
      if (idVoice) {
        utterance.voice = idVoice;
      }
      window.speechSynthesis.speak(utterance);
    }
  }

  playBell(type: string = 'masuk') {
    try {
      this.initCtx();
      if (!this.ctx) return;
      const now = this.ctx.currentTime;
      let notes: number[] = [];
      let noteLength = 0.5;

      const C5 = 523.25, E5 = 659.25, F5 = 698.46, G5 = 783.99, A5 = 880.00, C6 = 1046.50;

      switch (type) {
        case 'istirahat':
          notes = [C6, G5, E5];
          noteLength = 0.6;
          break;
        case 'pulang':
          notes = [C6, A5, F5, C5];
          noteLength = 0.7;
          break;
        case 'ganti_jam':
          notes = [G5, C6];
          noteLength = 0.4;
          break;
        case 'masuk':
        default:
          notes = [C5, E5, G5, C6];
          noteLength = 0.5;
          break;
      }

      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.type = "sine";
      gain.gain.setValueAtTime(0, now);
      osc.connect(gain);
      gain.connect(this.ctx.destination);
      osc.start(now);
      
      let time = now;
      notes.forEach((freq) => {
        osc.frequency.setValueAtTime(freq, time);
        gain.gain.setTargetAtTime(0.5, time, 0.05);
        time += noteLength;
        gain.gain.setTargetAtTime(0, time - 0.1, 0.1);
      });
      osc.stop(time + 1);
    } catch { }
  }

  playError() {
    try {
      this.initCtx();
      if (!this.ctx) return;

      const now = this.ctx.currentTime;
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();

      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(220, now);
      osc.frequency.setValueAtTime(160, now + 0.12);

      gain.gain.setValueAtTime(0.2, now);
      gain.gain.exponentialRampToValueAtTime(0.01, now + 0.35);

      osc.connect(gain);
      gain.connect(this.ctx.destination);

      osc.start(now);
      osc.stop(now + 0.35);
    } catch {
      // Ignore
    }
  }

  // ==========================================
  // GAMIFIED EDUCATIONAL QUIZ SOUND EFFECTS
  // ==========================================
  private isMuted: boolean = false;

  getMuted(): boolean {
    if (typeof window !== 'undefined') {
      try {
        return localStorage.getItem('portal_sekolah_audio_muted') === 'true';
      } catch {
        return this.isMuted;
      }
    }
    return this.isMuted;
  }

  setMuted(muted: boolean) {
    this.isMuted = muted;
    if (typeof window !== 'undefined') {
      try {
        localStorage.setItem('portal_sekolah_audio_muted', muted ? 'true' : 'false');
      } catch {}
    }
  }

  toggleMute(): boolean {
    const next = !this.getMuted();
    this.setMuted(next);
    return next;
  }

  /**
   * Sound 1: Triumphant Win/Correct Answer Jingle
   * Gentle, cheerful C5-E5-G5-C6 major arpeggio
   */
  playGameCorrect() {
    if (this.getMuted()) return;
    try {
      this.initCtx();
      if (!this.ctx) return;

      const now = this.ctx.currentTime;
      const notes = [523.25, 659.25, 783.99, 1046.5]; // C5, E5, G5, C6
      const noteDuration = 0.08;

      notes.forEach((freq, idx) => {
        if (!this.ctx) return;
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();

        osc.type = 'sine';
        osc.frequency.setValueAtTime(freq, now + idx * noteDuration);

        gain.gain.setValueAtTime(0, now + idx * noteDuration);
        gain.gain.linearRampToValueAtTime(0.2, now + idx * noteDuration + 0.02);
        gain.gain.exponentialRampToValueAtTime(0.001, now + (idx + 1.4) * noteDuration);

        osc.connect(gain);
        gain.connect(this.ctx.destination);

        osc.start(now + idx * noteDuration);
        osc.stop(now + (idx + 1.5) * noteDuration);
      });
    } catch {}
  }

  /**
   * Sound 2: Friendly, Non-Punitive "Belum Tepat" Warm Chime
   * Soft warm tone that gently encourages trying again without startling the child.
   */
  playGameWrongFriendly() {
    if (this.getMuted()) return;
    try {
      this.initCtx();
      if (!this.ctx) return;

      const now = this.ctx.currentTime;
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();

      osc.type = 'triangle';
      osc.frequency.setValueAtTime(329.63, now); // E4
      osc.frequency.linearRampToValueAtTime(261.63, now + 0.18); // C4

      gain.gain.setValueAtTime(0.12, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.28);

      osc.connect(gain);
      gain.connect(this.ctx.destination);

      osc.start(now);
      osc.stop(now + 0.28);
    } catch {}
  }

  /**
   * Sound 3: Star Earned / Sparkle Sound
   */
  playGameStar() {
    if (this.getMuted()) return;
    try {
      this.initCtx();
      if (!this.ctx) return;

      const now = this.ctx.currentTime;
      const freqs = [1318.51, 1567.98, 2093.0]; // E6, G6, C7
      freqs.forEach((freq, i) => {
        if (!this.ctx) return;
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(freq, now + i * 0.06);
        gain.gain.setValueAtTime(0.1, now + i * 0.06);
        gain.gain.exponentialRampToValueAtTime(0.001, now + i * 0.06 + 0.25);
        osc.connect(gain);
        gain.connect(this.ctx.destination);
        osc.start(now + i * 0.06);
        osc.stop(now + i * 0.06 + 0.25);
      });
    } catch {}
  }

  /**
   * Sound 4: Badge Unlocked / Level Up Fanfare
   */
  playGameBadge() {
    if (this.getMuted()) return;
    try {
      this.initCtx();
      if (!this.ctx) return;

      const now = this.ctx.currentTime;
      const chords = [
        [523.25, 659.25], // C5, E5
        [587.33, 739.99], // D5, F#5
        [659.25, 830.61], // E5, G#5
        [783.99, 1046.5], // G5, C6
      ];

      chords.forEach((chord, step) => {
        chord.forEach((freq) => {
          if (!this.ctx) return;
          const osc = this.ctx.createOscillator();
          const gain = this.ctx.createGain();
          osc.type = 'sine';
          const t = now + step * 0.12;
          osc.frequency.setValueAtTime(freq, t);
          gain.gain.setValueAtTime(0.12, t);
          gain.gain.exponentialRampToValueAtTime(0.001, t + 0.4);
          osc.connect(gain);
          gain.connect(this.ctx.destination);
          osc.start(t);
          osc.stop(t + 0.45);
        });
      });
    } catch {}
  }

  /**
   * Sound 5: Gentle Click / Selection Tap
   */
  playGameClick() {
    if (this.getMuted()) return;
    try {
      this.initCtx();
      if (!this.ctx) return;
      const now = this.ctx.currentTime;
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(800, now);
      gain.gain.setValueAtTime(0.06, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.04);
      osc.connect(gain);
      gain.connect(this.ctx.destination);
      osc.start(now);
      osc.stop(now + 0.04);
    } catch {}
  }

  /**
   * Sound 6: Soft Clock Tick for Timed Mode
   */
  playGameTick() {
    if (this.getMuted()) return;
    try {
      this.initCtx();
      if (!this.ctx) return;
      const now = this.ctx.currentTime;
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(1000, now);
      gain.gain.setValueAtTime(0.04, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.03);
      osc.connect(gain);
      gain.connect(this.ctx.destination);
      osc.start(now);
      osc.stop(now + 0.03);
    } catch {}
  }
}

export const sound = new SoundService();
