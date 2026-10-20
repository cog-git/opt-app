/**
 * Hook: returns the current sync status (queue length + online state).
 * Polls the IndexedDB queue every 3 s and tries to simulate sync when online.
 */

import { useState, useEffect, useCallback } from 'react';
import { getQueueLength, simulateSync } from './store';

export interface SyncStatus {
  queued: number;
  online: boolean;
  syncing: boolean;
}

export function useSyncStatus(): SyncStatus {
  const [queued, setQueued] = useState(0);
  const [online, setOnline] = useState(navigator.onLine);
  const [syncing, setSyncing] = useState(false);

  const refresh = useCallback(async () => {
    const q = await getQueueLength();
    setQueued(q);
  }, []);

  // Attempt to sync when online
  const trySync = useCallback(async () => {
    if (!navigator.onLine || syncing) return;
    const q = await getQueueLength();
    if (q === 0) return;
    setSyncing(true);
    try {
      await simulateSync();
      setQueued(0);
    } finally {
      setSyncing(false);
    }
  }, [syncing]);

  useEffect(() => {
    refresh();
    const id = setInterval(() => {
      refresh();
      trySync();
    }, 3000);
    return () => clearInterval(id);
  }, [refresh, trySync]);

  useEffect(() => {
    function onOnline() {
      setOnline(true);
      trySync();
    }
    function onOffline() {
      setOnline(false);
    }
    window.addEventListener('online', onOnline);
    window.addEventListener('offline', onOffline);
    return () => {
      window.removeEventListener('online', onOnline);
      window.removeEventListener('offline', onOffline);
    };
  }, [trySync]);

  return { queued, online, syncing };
}
