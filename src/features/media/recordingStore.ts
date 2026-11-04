import { fixWebmDuration } from '@fix-webm-duration/fix';
import type { CaptionCue } from './captions';

export interface SessionRecording {
  id: string;
  userId: string;
  interviewId: string;
  mode: 'VOICE' | 'VIDEO';
  startedAt: string;
  durationMs: number;
  status: 'recording' | 'saved' | 'interrupted';
  audioType: string;
  videoType?: string;
  uploadedAudioId?: string;
  uploadedVideoId?: string;
  uploadedCaptionsId?: string;
  captions?: CaptionCue[];
}
type Kind = 'audio' | 'video';
let connection: Promise<IDBDatabase> | null = null;
function db() {
  connection ||= new Promise((resolve, reject) => {
    const open = indexedDB.open('interview-session-recordings', 1);
    open.onupgradeneeded = () => {
      const database = open.result;
      database.createObjectStore('sessions', { keyPath: 'id' });
      database.createObjectStore('chunks', { keyPath: ['sessionId', 'kind', 'index'] });
    };
    open.onsuccess = () => resolve(open.result);
    open.onerror = () => reject(open.error);
  });
  return connection;
}
async function write(store: string, value: unknown) {
  const database = await db();
  return new Promise<void>((resolve, reject) => {
    const tx = database.transaction(store, 'readwrite');
    tx.objectStore(store).put(value);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error);
  });
}
async function all<T>(store: string): Promise<T[]> {
  const database = await db();
  return new Promise((resolve, reject) => {
    const request = database.transaction(store).objectStore(store).getAll();
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}
export const recordingStore = {
  save: (session: SessionRecording) => write('sessions', session),
  append: (sessionId: string, kind: Kind, index: number, blob: Blob) =>
    write('chunks', { sessionId, kind, index, blob }),
  async list(userId: string, interviewId: string) {
    return (await all<SessionRecording>('sessions'))
      .filter((s) => s.userId === userId && s.interviewId === interviewId)
      .sort((a, b) => b.startedAt.localeCompare(a.startedAt));
  },
  async blob(session: SessionRecording, kind: Kind) {
    const database = await db();
    const chunks = await new Promise<{ index: number; blob: Blob }[]>((resolve, reject) => {
      const range = IDBKeyRange.bound([session.id, kind, 0], [session.id, kind, Number.MAX_SAFE_INTEGER]);
      const request = database.transaction('chunks').objectStore('chunks').getAll(range);
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    const blob = new Blob(
      chunks.sort((a, b) => a.index - b.index).map((c) => c.blob),
      { type: kind === 'audio' ? session.audioType : session.videoType },
    );
    return blob.type.includes('webm') && session.durationMs > 0
      ? fixWebmDuration(blob, session.durationMs, { logger: false })
      : blob;
  },
  async erase(userId: string, interviewId?: string) {
    const sessions = (await all<SessionRecording>('sessions')).filter(
      (s) => s.userId === userId && (!interviewId || s.interviewId === interviewId),
    );
    const database = await db();
    await new Promise<void>((resolve, reject) => {
      const tx = database.transaction(['sessions', 'chunks'], 'readwrite');
      for (const s of sessions) {
        tx.objectStore('sessions').delete(s.id);
        for (const kind of ['audio', 'video'])
          tx.objectStore('chunks').delete(
            IDBKeyRange.bound([s.id, kind, 0], [s.id, kind, Number.MAX_SAFE_INTEGER]),
          );
      }
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  },
};
