import { useEffect, useState } from 'react';
import type { Company } from './types';

const brands: Record<string, string> = {
  ALIBABA: '/brands/alibaba.png',
  TENCENT: '/brands/tencent.png',
  BYTEDANCE: '/brands/bytedance.svg',
  BAIDU: '/brands/baidu.png',
  JD: '/brands/jd.png',
  HUAWEI: '/brands/huawei.png',
  MEITUAN: '/brands/meituan.svg',
};

export default function CompanyBrand({
  company,
  compact = false,
}: {
  company: Pick<Company, 'name' | 'code' | 'logo_url'>;
  compact?: boolean;
}) {
  const builtIn = brands[company.code];
  const preferred = company.logo_url?.startsWith('https://')
    ? company.logo_url
    : builtIn;
  const [failed, setFailed] = useState<string[]>([]);
  useEffect(() => setFailed([]), [preferred, builtIn]);
  const src = [preferred, builtIn].find(
    (source) => source && !failed.includes(source),
  );
  return (
    <span
      className={`practice-company-brand ${compact ? 'is-compact' : ''} ${src ? '' : 'is-fallback'}`}
    >
      {src ? (
        <img
          src={src}
          alt={`${company.name}品牌标志`}
          loading="lazy"
          decoding="async"
          onError={() => setFailed((current) => [...current, src])}
        />
      ) : (
        <span aria-label={`${company.name}公司标识`}>
          {company.name.slice(0, 1)}
        </span>
      )}
    </span>
  );
}
