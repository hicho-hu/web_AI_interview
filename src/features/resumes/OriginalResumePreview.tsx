import { useEffect, useRef, useState } from 'react';
import { Modal } from 'antd';
import { Download, Minus, Plus, RotateCcw } from 'lucide-react';
import { api } from '../../services/api';
import { signedUrl } from '../media/upload';
import { ErrorState, Loading } from '../../components/common/ui';
import type { Resume } from '../../types/domain';
import '../../styles/resume-preview.css';

// Word content is rendered inside an isolated document. External resources,
// scripts, forms and altChunk HTML are never loaded from uploaded documents.
const documentShell = `<!doctype html><html><head><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; img-src data: blob:; font-src data: blob:; base-uri 'none'; form-action 'none'"><style>html,body{margin:0;background:#edf0f5}#pages{width:max-content;min-width:100%;transform-origin:top left}.docx-wrapper{padding:20px!important;background:transparent!important;min-width:max-content}section.docx{margin-bottom:20px!important;box-shadow:0 2px 10px #24335018!important}img{max-width:100%}a{pointer-events:none}</style></head><body><div id="document-styles"></div><div id="pages"></div></body></html>`;
const maxBytes = 10 * 1024 * 1024;

export default function OriginalResumePreview({ resume, onClose }: { resume: Resume; onClose: () => void }) {
  const frame = useRef<HTMLIFrameElement>(null);
  const [file, setFile] = useState<{
    url: string;
    data: ArrayBuffer;
    pdf: boolean;
    name: string;
  } | null>(null);
  const [error, setError] = useState<unknown>(null);
  const [loading, setLoading] = useState(true);
  const [retry, setRetry] = useState(0);
  const [frameReady, setFrameReady] = useState(0);
  const [zoom, setZoom] = useState(1);
  useEffect(() => {
    const controller = new AbortController();
    let objectURL = '';
    setFile(null);
    setError(null);
    setLoading(true);
    void (async () => {
      const latest = await api.resume(resume.id);
      if (controller.signal.aborted) return;
      if (!latest.download_url) throw new Error('简历原文件已过期，请重新上传。');
      const response = await fetch(signedUrl(latest.download_url), {
        signal: controller.signal,
        credentials: 'omit',
      });
      if (!response.ok) throw new Error('原文件读取失败，请重试。');
      if (Number(response.headers.get('content-length')) > maxBytes)
        throw new Error('原文件超过预览大小限制。');
      const data = await response.arrayBuffer();
      if (controller.signal.aborted) return;
      if (!data.byteLength || data.byteLength > maxBytes) throw new Error('原文件大小不符合预览要求。');
      const pdf = /\.pdf$/i.test(latest.filename || '') || latest.content_type === 'application/pdf';
      const signature = new Uint8Array(data.slice(0, 5));
      if (
        pdf ? String.fromCharCode(...signature) !== '%PDF-' : signature[0] !== 0x50 || signature[1] !== 0x4b
      )
        throw new Error('文件格式无法识别，请下载原文件查看。');
      objectURL = URL.createObjectURL(
        new Blob([data], {
          type: pdf
            ? 'application/pdf'
            : 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        }),
      );
      setFile({
        data,
        url: objectURL,
        pdf,
        name: latest.filename || resume.filename || '简历',
      });
      if (pdf) setLoading(false);
    })().catch((reason) => {
      if (!controller.signal.aborted) {
        setError(reason);
        setLoading(false);
      }
    });
    return () => {
      controller.abort();
      if (objectURL) URL.revokeObjectURL(objectURL);
    };
  }, [resume.id, resume.filename, retry]);
  useEffect(() => {
    if (!file || file.pdf || !frameReady) return;
    let cancelled = false;
    void (async () => {
      const doc = frame.current?.contentDocument;
      const pages = doc?.getElementById('pages');
      const styles = doc?.getElementById('document-styles');
      if (!pages || !styles) return;
      const { renderAsync } = await import('docx-preview');
      if (cancelled) return;
      pages.replaceChildren();
      styles.replaceChildren();
      await renderAsync(file.data, pages, styles, {
        inWrapper: true,
        ignoreWidth: false,
        ignoreHeight: false,
        ignoreFonts: false,
        breakPages: true,
        ignoreLastRenderedPageBreak: false,
        useBase64URL: true,
        renderHeaders: true,
        renderFooters: true,
        renderFootnotes: true,
        renderEndnotes: true,
        renderAltChunks: false,
        renderComments: false,
      });
      if (!cancelled) setLoading(false);
    })().catch((reason) => {
      if (!cancelled) {
        setError(reason);
        setLoading(false);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [file, frameReady]);
  useEffect(() => {
    const pages = frame.current?.contentDocument?.getElementById('pages');
    if (pages) pages.style.zoom = String(zoom);
  }, [zoom, file, loading]);
  return (
    <Modal
      open
      title={resume.filename || '简历原文件预览'}
      width={1120}
      onCancel={onClose}
      footer={null}
      className="original-resume-modal"
      destroyOnHidden
    >
      <div className="resume-original-toolbar">
        <span>原文件完整预览 · {file?.pdf ? 'PDF' : 'DOCX'}</span>
        <div>
          {file && !file.pdf && (
            <>
              <button
                type="button"
                className="icon-btn"
                aria-label="缩小简历"
                disabled={zoom <= 0.4}
                onClick={() => setZoom((value) => Math.max(0.4, value - 0.1))}
              >
                <Minus size={16} />
              </button>
              <span>{Math.round(zoom * 100)}%</span>
              <button
                type="button"
                className="icon-btn"
                aria-label="放大简历"
                disabled={zoom >= 1.6}
                onClick={() => setZoom((value) => Math.min(1.6, value + 0.1))}
              >
                <Plus size={16} />
              </button>
            </>
          )}
          {file && (
            <a className="btn secondary small" href={file.url} download={file.name}>
              <Download size={14} />
              下载原文件
            </a>
          )}
        </div>
      </div>
      {error ? (
        <ErrorState
          error={error}
          retry={() => {
            setFrameReady(0);
            setRetry((value) => value + 1);
          }}
        />
      ) : (
        <div className="resume-original-viewer">
          {loading && (
            <div className="resume-preview-loading">
              <Loading label="正在加载完整简历…" />
            </div>
          )}
          {file &&
            (file.pdf ? (
              <iframe title="简历原文件 PDF 预览" src={`${file.url}#view=FitH`} />
            ) : (
              <iframe
                ref={frame}
                title="简历原文件 DOCX 预览"
                sandbox="allow-same-origin"
                srcDoc={documentShell}
                onLoad={() => setFrameReady((value) => value + 1)}
              />
            ))}
        </div>
      )}
      {error != null && (
        <button className="text-link" onClick={() => setRetry((value) => value + 1)}>
          <RotateCcw size={14} />
          重新读取原文件
        </button>
      )}
    </Modal>
  );
}
