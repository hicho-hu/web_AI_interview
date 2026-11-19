import { useEffect, useRef, useState } from 'react';
import { App } from 'antd';
import { useQuery } from '@tanstack/react-query';
import { Download, Eye, FileText, RotateCcw, Trash2, Upload } from 'lucide-react';
import { api } from '../../services/api';
import { queryClient } from '../../app/query';
import { ErrorState, Loading } from '../../components/common/ui';
import { signedUrl, uploadFile } from '../media/upload';
import { useSession } from '../../stores/session';
import OriginalResumePreview from './OriginalResumePreview';
import type { Resume } from '../../types/domain';

const pending = (resume: Resume) => ['PENDING', 'PROCESSING', 'PARSING'].includes(resume.parse_status);
export default function ResumeLibrary({
  selectedId,
  onSelect,
  onBusy,
}: {
  selectedId?: string;
  onSelect?: (id: string) => void;
  onBusy?: (busy: boolean) => void;
}) {
  const { mode, user } = useSession();
  const { modal, message } = App.useApp();
  const input = useRef<HTMLInputElement>(null);
  const active = useRef(true);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState(0);
  const [phase, setPhase] = useState('');
  const [failedResume, setFailedResume] = useState<Resume | null>(null);
  const [preview, setPreview] = useState<Resume | null>(null);
  const [error, setError] = useState<unknown>(null);
  const resumes = useQuery({
    queryKey: ['resumes', user?.id],
    queryFn: api.allResumes,
    refetchInterval: (query) => (query.state.data?.some(pending) ? 2000 : false),
  });
  useEffect(() => {
    active.current = true;
    return () => {
      active.current = false;
    };
  }, []);
  useEffect(() => {
    if (
      !busy &&
      selectedId &&
      resumes.data &&
      !resumes.data.some((r) => r.id === selectedId && r.parse_status === 'READY' && r.available !== false)
    )
      onSelect?.('');
  }, [selectedId, resumes.data, onSelect, busy]);
  async function awaitReady(id: string) {
    for (let i = 0; i < 60 && active.current; i++) {
      const record = await api.resume(id);
      if (record.parse_status === 'READY') {
        setFailedResume(null);
        onSelect?.(record.id);
        return record;
      }
      if (record.parse_status === 'FAILED') {
        setFailedResume(record);
        throw new Error(record.error_message || '未能提取简历文字，请重新导出文件后上传。');
      }
      await new Promise((resolve) => setTimeout(resolve, 1000));
    }
    if (active.current) throw new Error('简历仍在处理中，已保存在简历记录中，稍后可直接选择。');
  }
  async function run(operation: () => Promise<void>) {
    if (busy) return;
    setBusy(true);
    onBusy?.(true);
    setError(null);
    setFailedResume(null);
    try {
      await operation();
    } catch (e) {
      if (active.current) setError(e);
    } finally {
      await queryClient.invalidateQueries({ queryKey: ['resumes'] });
      if (active.current) {
        setBusy(false);
        setPhase('');
        onBusy?.(false);
      }
    }
  }
  async function upload(file: File) {
    if (!/\.(pdf|docx)$/i.test(file.name) || file.size > 10 * 1024 * 1024 || !file.size) {
      void message.error('请上传不超过 10 MB 的 PDF 或 DOCX 简历');
      return;
    }
    await run(async () => {
      setProgress(0);
      setPhase('正在上传简历');
      await api.ensureConsents(['PRIVACY', 'TERMS']);
      const ticket = await uploadFile(
        file,
        {
          filename: file.name,
          size: file.size,
          media_type: 'RESUME',
          content_type: file.name.toLowerCase().endsWith('.pdf')
            ? 'application/pdf'
            : 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        },
        setProgress,
      );
      setPhase('正在提取简历文字');
      const current = await api.resume(ticket.resume_id!);
      if (ticket.reused && current.parse_status === 'FAILED' && current.task_id)
        await api.retryTask(current.task_id);
      const ready = await awaitReady(ticket.resume_id!);
      if (ready)
        void message.success(
          ticket.reused
            ? '同名简历已存在，已复用已有记录；如需更新请先删除或修改文件名'
            : '简历已保存，可用于模拟面试',
        );
    });
  }
  async function retry(record: Resume) {
    await run(async () => {
      setPhase('正在重新解析');
      await api.retryTask(record.task_id!);
      await awaitReady(record.id);
      void message.success('简历解析完成');
    });
  }
  function remove(record: Resume) {
    modal.confirm({
      title: '删除这份简历？',
      content: `删除“${record.filename || '简历'}”后，新面试将无法使用它。`,
      okText: '确认删除',
      cancelText: '取消',
      onOk: async () => {
        await api.deleteResume(record.id);
        if (failedResume?.id === record.id) setFailedResume(null);
        if (selectedId === record.id) onSelect?.('');
        await queryClient.invalidateQueries({ queryKey: ['resumes'] });
      },
    });
  }
  async function download(record: Resume) {
    try {
      const latest = await api.resume(record.id);
      if (!latest.download_url) throw new Error('原文件已过期，请重新上传简历');
      const anchor = document.createElement('a');
      anchor.href = signedUrl(latest.download_url);
      anchor.download = latest.filename || 'resume';
      anchor.target = '_blank';
      anchor.rel = 'noopener';
      anchor.click();
    } catch (e) {
      setError(e);
    }
  }
  const successful =
    resumes.data?.filter((record) => record.parse_status === 'READY' && record.available !== false) ?? [];
  if (mode === 'demo') return <p className="muted">演示模式不收集简历文件，请连接真实后端后使用简历管理。</p>;
  return (
    <div className="resume-library">
      {preview && (
        <OriginalResumePreview key={preview.id} resume={preview} onClose={() => setPreview(null)} />
      )}
      <div className="resume-library-toolbar">
        <p className="muted">
          {onSelect ? '单选一份简历，也可以不使用简历。' : '管理你的简历，开始面试时可直接选择。'}{' '}
          同名文件只保留一份记录。
        </p>
        <button
          type="button"
          className="btn secondary small"
          disabled={busy}
          onClick={() => input.current?.click()}
        >
          <Upload size={15} />
          上传新简历
        </button>
        <input
          ref={input}
          type="file"
          hidden
          accept=".pdf,.docx"
          aria-label="上传个人简历"
          disabled={busy}
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) void upload(file);
            e.target.value = '';
          }}
        />
      </div>
      <p className="muted resume-library-hint">
        支持 PDF / DOCX，最大 10 MB。扫描件请先识别为可复制文字；原文件按页面有效期保留。
      </p>
      {busy && (
        <div role="status" aria-live="polite">
          {phase}
          {phase === '正在上传简历' ? ` ${progress}%` : '…'}
        </div>
      )}
      {error != null && <ErrorState error={error} />}
      {failedResume?.task_id && (
        <button
          type="button"
          className="btn secondary small"
          disabled={busy}
          onClick={() => void retry(failedResume)}
        >
          重新解析刚才上传的简历
        </button>
      )}
      {failedResume && (
        <button type="button" className="text-link" disabled={busy} onClick={() => remove(failedResume)}>
          移除本次上传文件
        </button>
      )}
      {onSelect && (
        <label className="resume-choice">
          <input
            type="radio"
            name="interview-resume"
            value=""
            checked={!selectedId}
            disabled={busy}
            onChange={() => onSelect('')}
          />
          不使用简历
        </label>
      )}
      {resumes.isPending ? (
        <Loading />
      ) : resumes.isError ? (
        <ErrorState error={resumes.error} retry={() => void resumes.refetch()} />
      ) : !successful.length ? (
        <p className="muted">还没有上传简历，可上传新简历或直接开始面试。</p>
      ) : (
        successful.map((record) => {
          const usable = record.parse_status === 'READY' && record.available !== false;
          return (
            <div
              className={`resume-library-record ${selectedId === record.id ? 'selected' : ''}`}
              key={record.id}
            >
              <label className="resume-library-main">
                {onSelect ? (
                  <input
                    type="radio"
                    name="interview-resume"
                    value={record.id}
                    checked={selectedId === record.id}
                    disabled={busy || !usable}
                    onChange={() => onSelect(record.id)}
                  />
                ) : (
                  <FileText size={20} />
                )}
                <span>
                  <strong>{record.filename || '简历文件名暂不可用'}</strong>
                  <small>
                    {usable
                      ? '已就绪'
                      : record.available === false && record.parse_status === 'READY'
                        ? '原文件已过期，请重新上传'
                        : record.parse_status === 'FAILED'
                          ? record.error_message || '解析失败，可重新解析'
                          : '等待上传或解析完成'}{' '}
                    · {new Date(record.created_at).toLocaleDateString()}
                  </small>
                </span>
              </label>
              <div className="resume-library-actions">
                <button
                  type="button"
                  className="icon-btn"
                  aria-label={`查看简历 ${record.filename || ''}`}
                  title="预览完整原文件"
                  onClick={() => setPreview(record)}
                >
                  <Eye size={16} />
                </button>
                {record.download_url && (
                  <button
                    type="button"
                    className="icon-btn"
                    title="下载原文件"
                    aria-label="下载简历原文件"
                    onClick={() => void download(record)}
                  >
                    <Download size={16} />
                  </button>
                )}
                {record.parse_status === 'FAILED' && record.task_id && record.available !== false && (
                  <button
                    type="button"
                    className="btn secondary small"
                    disabled={busy}
                    onClick={() => void retry(record)}
                  >
                    <RotateCcw size={14} />
                    重新解析
                  </button>
                )}
                <button
                  type="button"
                  className="icon-btn"
                  aria-label={`删除简历 ${record.filename || ''}`}
                  title="删除简历"
                  disabled={busy}
                  onClick={() => remove(record)}
                >
                  <Trash2 size={16} />
                </button>
              </div>
            </div>
          );
        })
      )}
    </div>
  );
}
