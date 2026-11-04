import { uploadFile } from './upload';
import { recordingStore, type SessionRecording } from './recordingStore';
import type { CaptureResult } from './ConversationCapture';
import { captionsVtt } from './captions';

export async function uploadSession(result: CaptureResult, onProgress: (value: number) => void) {
  const { session } = result;
  const kinds = (['audio', 'video', 'captions'] as const).filter((kind) => result[kind]);
  for (const [index, kind] of kinds.entries()) {
    const blob = result[kind];
    const property =
      kind === 'audio' ? 'uploadedAudioId' : kind === 'video' ? 'uploadedVideoId' : 'uploadedCaptionsId';
    if (!blob || session[property]) continue;
    const ticket = await uploadFile(
      blob,
      {
        filename: `interview-${session.id}-${kind}.${kind === 'captions' ? 'vtt' : blob.type.includes('mp4') ? (kind === 'audio' ? 'm4a' : 'mp4') : 'webm'}`,
        media_type:
          kind === 'audio' ? 'SESSION_AUDIO' : kind === 'video' ? 'SESSION_VIDEO' : 'SESSION_CAPTIONS',
        content_type: blob.type,
        size: blob.size,
        interview_id: session.interviewId,
        duration_ms: Math.round(session.durationMs),
      },
      (value) => onProgress(Math.round((index * 100 + value) / kinds.length)),
    );
    session[property] = ticket.asset_id;
    await recordingStore.save(session).catch(() => undefined);
  }
  return session;
}
export async function loadCapture(session: SessionRecording): Promise<CaptureResult> {
  return {
    session,
    audio: await recordingStore.blob(session, 'audio'),
    video: session.videoType ? await recordingStore.blob(session, 'video') : undefined,
    captions: session.captions?.length ? captionsVtt(session.captions) : undefined,
    persisted: true,
  };
}
