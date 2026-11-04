type SystemAvatarProps = {
  avatarKey?: string | null;
  label?: string;
  className?: string;
};

export function SystemAvatar({ avatarKey, label = '系统头像', className = '' }: SystemAvatarProps) {
  const index = Math.max(0, Number(avatarKey?.replace('avatar-', '') ?? 1) - 1);
  const column = index % 4;
  const row = Math.floor(index / 4);
  return (
    <span
      className={`system-avatar ${className}`.trim()}
      role="img"
      aria-label={label}
      style={{ backgroundPosition: `${(column / 3) * 100}% ${(row / 3) * 100}%` }}
    />
  );
}
