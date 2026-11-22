// Matches backend-generated object keys, never arbitrary URLs or document paths.
const owner = '/ai-interview/user/[A-Za-z0-9-]+';
const asset = '[A-Za-z0-9-]+';
export const ossIncomingObjectPath = `${owner}/incoming/${asset}\\.[A-Za-z0-9]+`;
export const ossAudioObjectPath = `${owner}/generated/${asset}\\.(?:wav|mp3)`;
export const ossResumeObjectPath = `${owner}/accepted/${asset}\\.(?:pdf|docx)`;
export const ossAcceptedObjectPath = `${owner}/accepted/${asset}\\.(?:pdf|docx|png|jpg|jpeg|wav|mp3|m4a|mp4|aac|webm|vtt)`;
