import { Bot } from 'lucide-react';

export default function AIInterviewerAvatar() {
  return (
    <span
      className="ai-interviewer-avatar"
      role="img"
      aria-label="AI面试官专属头像"
    >
      <Bot size={25} strokeWidth={1.7} />
      <span aria-hidden="true">AI</span>
    </span>
  );
}
