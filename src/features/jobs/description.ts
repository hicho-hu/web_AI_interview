import type { JobFunction } from './functionCatalog';

type Profile = { responsibilities: string[]; requirements: string[] };
const profiles: Record<string, Profile> = {
  backend: {
    responsibilities: [
      '负责后端服务、业务接口与数据模型设计，推进需求开发及上线。',
      '优化数据库、缓存和异步任务，排查性能、稳定性与安全问题。',
    ],
    requirements: [
      '掌握所选岗位的开发语言、常用框架、数据结构与网络基础。',
      '熟悉关系型数据库、事务、索引和缓存，能解释技术方案的选择与权衡。',
    ],
  },
  frontend: {
    responsibilities: [
      '负责 Web 页面与组件开发，完成接口联调和跨端适配。',
      '优化页面性能、交互体验、可访问性及前端工程质量。',
    ],
    requirements: [
      '掌握 HTML、CSS、JavaScript / TypeScript 及常用前端框架。',
      '熟悉组件设计、状态管理、浏览器机制和自动化测试。',
    ],
  },
  mobile: {
    responsibilities: [
      '负责移动端功能、界面和客户端架构开发，完成发布与版本迭代。',
      '处理性能、兼容性、网络及稳定性问题。',
    ],
    requirements: [
      '掌握目标移动平台的语言、框架、生命周期和平台规范。',
      '熟悉客户端数据存储、网络通信、调试与性能分析。',
    ],
  },
  ai: {
    responsibilities: [
      '围绕业务场景完成模型选型、实验评估与 AI 功能落地。',
      '建设数据处理、模型调用及效果评测流程，持续优化效果、时延与成本。',
    ],
    requirements: [
      '理解机器学习或大模型的核心原理，掌握 Python 与相关工具。',
      '能结合真实案例说明数据质量、评测方法、部署方案及效果改进。',
    ],
  },
  data: {
    responsibilities: [
      '负责数据采集、清洗、建模或分析，建立可靠的数据指标。',
      '定位数据质量与业务问题，通过分析或数据产品支持决策。',
    ],
    requirements: [
      '熟悉 SQL、数据处理及所选岗位相关的分析或开发工具。',
      '理解数据口径、数据质量、统计方法及业务指标之间的关系。',
    ],
  },
  qa: {
    responsibilities: [
      '根据需求与系统风险设计测试方案、用例和自动化验证。',
      '跟踪缺陷、定位问题并推进质量改进，保障版本交付。',
    ],
    requirements: [
      '熟悉测试方法、接口测试、缺陷管理及常用测试工具。',
      '能说明测试覆盖、边界场景、问题定位及质量度量的方法。',
    ],
  },
  ops: {
    responsibilities: [
      '负责系统部署、监控、故障处理与容量管理，保障服务稳定运行。',
      '推进自动化运维、发布流程及基础设施优化。',
    ],
    requirements: [
      '熟悉操作系统、网络、容器及常用运维工具。',
      '理解可用性、监控告警、故障恢复、安全与成本控制。',
    ],
  },
  security: {
    responsibilities: [
      '识别系统与业务安全风险，开展安全评估、防护和应急处置。',
      '推动安全规范、风险整改及安全运营改进。',
    ],
    requirements: [
      '熟悉网络、应用或数据安全基础及常见攻击防护方法。',
      '具备安全问题分析、验证与修复跟踪能力。',
    ],
  },
  product: {
    responsibilities: [
      '开展用户与业务调研，梳理需求、定义产品方案和验收标准。',
      '协调设计、研发与运营推进迭代，通过数据和反馈评估产品效果。',
    ],
    requirements: [
      '熟悉需求分析、产品规划、原型设计和指标体系。',
      '能解释需求优先级、方案取舍及业务价值，提供完整产品案例。',
    ],
  },
  design: {
    responsibilities: [
      '根据业务需求完成设计方案、视觉或交互表达，推动方案落地。',
      '维护设计规范，结合用户反馈与交付效果持续优化。',
    ],
    requirements: [
      '掌握所选设计岗位的方法、工具、专业规范与交付流程。',
      '能通过作品说明设计目标、思考过程、方案取舍及最终效果。',
    ],
  },
  sales: {
    responsibilities: [
      '识别客户需求，开展客户沟通、方案介绍与商务推进。',
      '维护客户关系，跟进交付与回款，完成业务目标。',
    ],
    requirements: [
      '熟悉目标行业、产品价值、客户开发和商务沟通。',
      '能说明客户转化、异议处理、谈判与业绩复盘的具体案例。',
    ],
  },
  service: {
    responsibilities: [
      '及时响应客户咨询与问题，协调资源完成处理并跟进结果。',
      '沉淀服务流程与常见问题，改进客户满意度。',
    ],
    requirements: [
      '具备清晰的沟通、问题判断、投诉处理与服务意识。',
      '熟悉业务流程，能说明复杂问题处理及服务质量改进案例。',
    ],
  },
  operation: {
    responsibilities: [
      '围绕业务目标制定运营计划，执行活动、内容或用户运营。',
      '跟踪关键指标，复盘效果并持续优化增长和转化。',
    ],
    requirements: [
      '理解目标用户、业务链路及常用运营指标。',
      '具备活动策划、数据分析、跨团队推进与效果复盘能力。',
    ],
  },
  finance: {
    responsibilities: [
      '负责所选财务岗位的核算、报表、预算或财务分析工作。',
      '检查数据准确性和流程合规性，识别风险并提出改进建议。',
    ],
    requirements: [
      '熟悉会计准则、财税规范、内部控制及相关业务流程。',
      '能结合案例说明账务处理、分析判断和风险控制方法。',
    ],
  },
  hr: {
    responsibilities: [
      '执行招聘、员工发展、绩效或组织支持等岗位相关工作。',
      '优化人力资源流程与员工体验，支持业务团队目标。',
    ],
    requirements: [
      '了解人力资源管理方法、劳动用工规范及岗位相关流程。',
      '具备沟通协调、需求分析和流程改进能力。',
    ],
  },
};

function profileKey(role: JobFunction) {
  const name = `${role.name} ${role.subcategoryName}`;
  if (/产品|策划/.test(name)) return 'product';
  if (/测试/.test(name)) return 'qa';
  if (/前端|Web|网页/i.test(name)) return 'frontend';
  if (/Android|iOS|鸿蒙|移动开发|客户端/i.test(name)) return 'mobile';
  if (/人工智能|算法|机器学习|深度学习|大模型|自然语言|计算机视觉|AIGC/i.test(name)) return 'ai';
  if (/数据/.test(name) && role.categoryCode === '9F02') return 'data';
  if (/信息安全|网络安全|安全工程师/.test(name) && role.categoryCode === '9F02') return 'security';
  if (/运维|技术支持/.test(name) && role.categoryCode === '9F02') return 'ops';
  if (role.categoryCode === '9F02') return 'backend';
  if (/客服/.test(name)) return 'service';
  if (role.categoryCode === '9F01') return 'sales';
  if (role.categoryCode === '9F05' || role.categoryCode === '9F06') return 'operation';
  if (role.categoryCode === '9F07') return 'design';
  if (role.categoryCode === '9F04' && !/法务|合规/.test(name)) return 'finance';
  if (role.categoryCode === '9F03' && !/行政|后勤/.test(name)) return 'hr';
  return '';
}

/** Local templates are a starting JD, never attributed to an actual employer. */
export function generateJobDescription(
  selected: JobFunction[],
  saved: { job_title: string; jd_text: string }[] = [],
) {
  const roles = [...new Map(selected.map((role) => [role.code, role])).values()];
  if (!roles.length) return '';
  const exact = saved.find(
    (job) => job.job_title === roles.map((role) => role.name).join('、') && job.jd_text.trim(),
  );
  if (exact) return exact.jd_text.trim();
  const responsibilities: string[] = [];
  const requirements = new Set<string>();
  for (const role of roles) {
    const existing = saved.find((job) => job.job_title === role.name && job.jd_text.trim());
    if (existing) {
      responsibilities.push(`【${role.name}】\n${existing.jd_text.trim()}`);
      continue;
    }
    const profile = profiles[profileKey(role)] || {
      responsibilities: [
        `负责${role.name}相关工作，围绕${role.subcategoryName}的业务目标制定并执行工作计划。`,
        `遵循${role.categoryName}相关流程与专业规范，处理实际问题并持续改进工作质量。`,
      ],
      requirements: [
        `具备${role.name}所需的专业知识、常用工具与业务流程经验。`,
        `能结合${role.subcategoryName}的实际案例说明工作方法、问题处理与交付成果。`,
      ],
    };
    responsibilities.push(
      `【${role.name}】\n${profile.responsibilities.map((line) => `• ${line}`).join('\n')}`,
    );
    profile.requirements.forEach((line) => requirements.add(line));
    if (/^Python$/i.test(role.name)) requirements.add('熟悉 Python、常用 Web 框架、依赖管理及异步编程。');
    if (/^Java$/i.test(role.name)) requirements.add('熟悉 Java、JVM、并发编程及 Spring 生态。');
  }
  requirements.add('具备清晰表达、团队协作及问题分析能力，能用真实经历说明方案和结果。');
  return [
    `目标岗位：${roles.map((role) => role.name).join('、')}`,
    '岗位职责',
    responsibilities.join('\n\n'),
    '任职要求',
    [...requirements].map((line) => `• ${line}`).join('\n'),
  ].join('\n\n');
}

const normalize = (line: string) => line.trim().replace(/^(?:[•\-*]|\d+[.、)])\s*/, '');

/** Carry manual additions and deletions forward when a selection changes. */
export function mergeJobDescription(current: string, previous: string, next: string) {
  if (!current.trim() || current === previous) return next;
  if (!previous) return current.trim() === next.trim() ? current : `${next}\n\n补充要求\n${current.trim()}`;
  const oldLines = new Set(previous.split('\n').map(normalize).filter(Boolean));
  const currentLines = new Set(current.split('\n').map(normalize).filter(Boolean));
  const nextLines = new Set(next.split('\n').map(normalize).filter(Boolean));
  const deleted = new Set([...oldLines].filter((line) => !currentLines.has(line)));
  const additions = current.split('\n').filter((line) => {
    const text = normalize(line);
    return text && text !== '补充要求' && !oldLines.has(text) && !nextLines.has(text);
  });
  const base = next
    .split('\n')
    .filter((line) => !/^[•\-*]/.test(line.trim()) || !deleted.has(normalize(line)))
    .join('\n');
  return additions.length ? `${base}\n\n补充要求\n${additions.join('\n')}` : base;
}
