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
}

export const sound = new SoundService();
