import { useEffect, useState } from 'react';
import { api } from '../../services/api';

export function useEmailCode() {
  const [challengeId, setChallengeId] = useState('');
  const [developmentCode, setDevelopmentCode] = useState('');
  const [remaining, setRemaining] = useState(0);
  const [sending, setSending] = useState(false);
  const [destination, setDestination] = useState('');
  useEffect(() => {
    if (!remaining) return;
    const timer = window.setTimeout(() => setRemaining((value) => Math.max(0, value - 1)), 1000);
    return () => window.clearTimeout(timer);
  }, [remaining]);
  async function send(email: string, purpose: 'REGISTER' | 'RESET_PASSWORD' = 'REGISTER', binding = false) {
    if (sending || remaining) return;
    setSending(true);
    try {
      const result = await api.sendEmailCode(email.trim(), purpose, binding);
      setChallengeId(result.challenge_id);
      setDestination(email.trim().toLowerCase());
      setDevelopmentCode(result.development_code ?? '');
      setRemaining(result.resend_after);
    } finally {
      setSending(false);
    }
  }
  return { challengeId, developmentCode, destination, remaining, sending, send };
}
