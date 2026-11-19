import { Children, Fragment, isValidElement, useId, type ReactNode } from 'react';
import { Select } from 'antd';
import { ChevronDown } from 'lucide-react';
import '../../styles/select.css';

type Option = { value: string; label: ReactNode; disabled?: boolean };
function optionsFrom(children: ReactNode): Option[] {
  return Children.toArray(children).flatMap((child) => {
    if (
      !isValidElement<{
        value?: string | number;
        children?: ReactNode;
        disabled?: boolean;
      }>(child)
    )
      return [];
    if (child.type === Fragment) return optionsFrom(child.props.children);
    if (child.type !== 'option') return [];
    return [
      {
        value: String(child.props.value ?? ''),
        label: child.props.children,
        disabled: child.props.disabled,
      },
    ];
  });
}

/** One accessible menu for every simple selection; no OS-native popup. */
export default function AppSelect({
  value,
  onChange,
  children,
  id,
  className = '',
  disabled = false,
  ...aria
}: {
  value: string | number;
  onChange: (value: string) => void;
  children: ReactNode;
  id?: string;
  className?: string;
  disabled?: boolean;
  'aria-label'?: string;
  'aria-describedby'?: string;
}) {
  const fallbackId = useId();
  return (
    <Select
      {...aria}
      id={id || fallbackId}
      className={`app-select ${className}`}
      value={String(value)}
      onChange={onChange}
      disabled={disabled}
      options={optionsFrom(children)}
      suffixIcon={<ChevronDown size={16} strokeWidth={1.7} />}
      virtual={false}
      showSearch={false}
      popupMatchSelectWidth
      classNames={{ popup: { root: 'app-select-popup' } }}
    />
  );
}
