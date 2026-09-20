import { useEffect, useRef, useState, useCallback } from 'react';
import { sound } from '../services/audio';

export interface UsePhysicalScannerOptions {
  onScan: (scannedData: string) => void;
  enabled?: boolean;
  cooldownMs?: number; // Delay before scanning the same code again (default 2000ms)
  maxKeyIntervalMs?: number; // Maximum ms between keystrokes for hardware scanner (default 75ms)
  minLength?: number; // Minimum barcode/QR length (default 3)
}

export function usePhysicalScanner({
  onScan,
  enabled = true,
  cooldownMs = 2000,
  maxKeyIntervalMs = 75,
  minLength = 3,
}: UsePhysicalScannerOptions) {
  const [lastScannedCode, setLastScannedCode] = useState<string>('');
  const [lastScannedAt, setLastScannedAt] = useState<Date | null>(null);
  const [totalPhysicalScans, setTotalPhysicalScans] = useState<number>(0);
  const [isReceiving, setIsReceiving] = useState<boolean>(false);

  const bufferRef = useRef<string>('');
  const lastKeyTimeRef = useRef<number>(0);
  const lastCodeRef = useRef<string>('');
  const lastScanTimestampRef = useRef<number>(0);
  const clearReceivingTimerRef = useRef<any>(null);

  const handleScanTrigger = useCallback(
    (code: string) => {
      const clean = code.trim();
      if (!clean || clean.length < minLength) return;

      const now = Date.now();
      // Cooldown check for the same code
      if (clean === lastCodeRef.current && now - lastScanTimestampRef.current < cooldownMs) {
        console.log(`[PhysicalScanner] Cooldown active for code "${clean}", ignored.`);
        return;
      }

      lastCodeRef.current = clean;
      lastScanTimestampRef.current = now;

      sound.playScannerBeep();
      setLastScannedCode(clean);
      setLastScannedAt(new Date());
      setTotalPhysicalScans((prev) => prev + 1);
      setIsReceiving(false);

      onScan(clean);
    },
    [onScan, cooldownMs, minLength]
  );

  useEffect(() => {
    if (!enabled) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      const targetTag = target?.tagName?.toUpperCase();
      const isInput = targetTag === 'INPUT' || targetTag === 'TEXTAREA';
      const isDedicatedScannerInput = target?.id === 'physical-scanner-input';

      const now = performance.now();
      const interval = now - lastKeyTimeRef.current;
      lastKeyTimeRef.current = now;

      // Handle Enter (standard barcode gun suffix)
      if (e.key === 'Enter' || e.key === 'Tab') {
        if (bufferRef.current.length >= minLength) {
          e.preventDefault();
          const scanned = bufferRef.current;
          bufferRef.current = '';
          handleScanTrigger(scanned);
          return;
        }
        bufferRef.current = '';
        return;
      }

      // Ignore single modifier keys (Shift, Control, Alt, Meta, CapsLock)
      if (e.key.length > 1) {
        return;
      }

      // If user is actively typing slowly into an ordinary search/form field, let them type
      if (isInput && !isDedicatedScannerInput) {
        // Only treat as scanner if keys arrive at superhuman speed (< maxKeyIntervalMs)
        if (interval > maxKeyIntervalMs && bufferRef.current.length > 0) {
          bufferRef.current = '';
        }
      }

      // If delay between keys was too long (human typing outside input), reset buffer
      if (interval > 150 && bufferRef.current.length > 0) {
        bufferRef.current = '';
      }

      bufferRef.current += e.key;
      setIsReceiving(true);

      if (clearReceivingTimerRef.current) {
        clearTimeout(clearReceivingTimerRef.current);
      }
      clearReceivingTimerRef.current = setTimeout(() => {
        setIsReceiving(false);
      }, 300);
    };

    window.addEventListener('keydown', handleKeyDown, true);
    return () => {
      window.removeEventListener('keydown', handleKeyDown, true);
      if (clearReceivingTimerRef.current) {
        clearTimeout(clearReceivingTimerRef.current);
      }
    };
  }, [enabled, handleScanTrigger, maxKeyIntervalMs, minLength]);

  const resetScannerState = useCallback(() => {
    bufferRef.current = '';
    setIsReceiving(false);
  }, []);

  return {
    lastScannedCode,
    lastScannedAt,
    totalPhysicalScans,
    isReceiving,
    triggerManualScan: handleScanTrigger,
    resetScannerState,
  };
}
