import { test, expect } from '@playwright/test';
import { readFileSync } from 'node:fs';
import type { Resume, User } from '../../src/types/domain';
test.skip(!process.env.PRODUCTION_PREVIEW, '仅验证已构建的生产产物');
test('生产构建保留已配置的体验登录，独立演示和路由分包可运行', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto('/login');
  await expect(page.getByRole('button', { name: '使用邮箱登录', exact: true })).toBeVisible();
  await page.getByRole('checkbox').check();
  await page.getByRole('tab', { name: '体验账号', exact: true }).click();
  await expect(page.getByRole('button', { name: '进入我的练习空间' })).toBeVisible();
  await page.getByRole('button', { name: '体验文字面试演示' }).click();
  await expect(page.getByRole('heading', { name: /准备好更进一步/ })).toBeVisible();
  await page.getByRole('link', { name: '新建模拟面试' }).click();
  await expect(page.getByLabel('岗位描述 JD')).toBeVisible();
  await page.reload();
  await expect(page.getByLabel('岗位描述 JD')).toBeVisible();
  expect(errors).toEqual([]);
});

function syntheticPDF() {
  const content = 'BT /F1 16 Tf 30 100 Td (Synthetic resume preview) Tj ET\n';
  const objects = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 300 200] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>',
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
    `<< /Length ${Buffer.byteLength(content)} >>\nstream\n${content}endstream`,
  ];
  let data = '%PDF-1.4\n';
  const offsets = [0];
  for (const [index, object] of objects.entries()) {
    offsets.push(Buffer.byteLength(data));
    data += `${index + 1} 0 obj\n${object}\nendobj\n`;
  }
  const xref = Buffer.byteLength(data);
  data += `xref\n0 ${offsets.length}\n0000000000 65535 f \n`;
  for (const offset of offsets.slice(1)) data += `${String(offset).padStart(10, '0')} 00000 n \n`;
  data += `trailer\n<< /Size ${offsets.length} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return Buffer.from(data);
}

// A generated, single-paragraph DOCX; no personal data or external resources.
const syntheticDOCX = Buffer.from(
  'UEsDBBQAAAAIAK+2dl33VP4j2QAAAGQBAAATAAAAW0NvbnRlbnRfVHlwZXNdLnhtbJWQu1LDMBBFf0WjlrHWUDAMYzsFjxIowgfsyGtbg16jVUL4e9YJSZGOUrpn75G22xyCV3sq7FLs9a1ptaJo0+ji3OvP7WvzoDdDt/3JxErQyL1eas2PAGwXCsgmZYqSTKkErHIsM2S0XzgT3LXtPdgUK8Xa1LVDD90zTbjzVb0c5PqkLeRZq6cTuLp6jTl7Z7FKDvs4XlmaP4ORySPDi8t8I4CGoXuX/xQ3kvrAUt8wSB18pzLCmOwuiMKs4L98aZqcpcv82pZLssQsiwreXJKALp7fAce1Db9QSwMEFAAAAAgAr7Z2XTZX3tyiAAAAGAEAAAsAAABfcmVscy8ucmVsc43POw7CMAwG4KtE3qkLA0KoaReE1BWVA0SJm0Y0DyXhdXsyMFDEwGj792e56R52ZjeKyXjHYV3VwMhJr4zTHM7DcbWDrm1ONItcEmkyIbGy4hKHKeewR0xyIitS5QO5Mhl9tCKXMmoMQl6EJtzU9RbjpwFLk/WKQ+zVGtjwDPSP7cfRSDp4ebXk8o8TX4kii6gpc7j7qFC921VhAdsGFy+2L1BLAwQUAAAACACvtnZdLa2II7kAAAAGAQAAEQAAAHdvcmQvZG9jdW1lbnQueG1sRU9JDsIwDPxKlDu4BakqVZcbZyTgASU1baRmkRMI8HqSSIjLeCzPjO12eKmVPZGcNLrj5bbgDLUwk9Rzx6+X46bmQ9+GZjLioVB7FvXaNaHji/e2AXBiQTW6rbGo4+xuSI0+tjRDMDRZMgKdi3FqhV1RVKBGqXmKvJnpnapNQAl8f35rv6CXghG6uJBZwqfE0EKaJqSM2eNQ+FM22vn8YSFdVZaHouKRL5FX9b7mkA0/Lfz2wv+n/gtQSwECFAMUAAAACACvtnZd91T+I9kAAABkAQAAEwAAAAAAAAAAAAAAgAEAAAAAW0NvbnRlbnRfVHlwZXNdLnhtbFBLAQIUAxQAAAAIAK+2dl02V97cogAAABgBAAALAAAAAAAAAAAAAACAAQoBAABfcmVscy8ucmVsc1BLAQIUAxQAAAAIAK+2dl0trYgjuQAAAAYBAAARAAAAAAAAAAAAAACAAdUBAAB3b3JkL2RvY3VtZW50LnhtbFBLBQYAAAAAAwADALkAAAC9AgAAAAA=',
  'base64',
);

for (const extension of ['pdf', 'docx'] as const) {
  test(`生产简历 ${extension.toUpperCase()}：同源签名读取、CSP 下预览和原文件下载`, async ({
    page,
    baseURL,
  }) => {
    const origin = new URL(baseURL!).origin;
    const csp = readFileSync(new URL('../../nginx.conf', import.meta.url), 'utf8').match(
      /add_header Content-Security-Policy "([^"]+)"/,
    )![1];
    const bytes = extension === 'pdf' ? syntheticPDF() : syntheticDOCX;
    const contentType =
      extension === 'pdf'
        ? 'application/pdf'
        : 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
    const user: User = {
      id: 'resume-preview-user',
      uid: '10000003',
      nickname: '合成简历测试',
      status: 'ACTIVE',
      remaining_interviews: 1,
      created_at: '2026-11-22T00:00:00Z',
    };
    const filePath = `/ai-interview/user/10000003/accepted/resume-preview.${extension}`;
    const bucket = 'https://ai-interview-storage.oss-cn-hangzhou.aliyuncs.com';
    const query = (version: number) =>
      `?x-oss-security-token=synthetic%2Btoken%2Fvalue%3D&x-oss-signature=fresh-${version}`;
    const resume: Resume = {
      id: 'resume-preview',
      asset_id: 'resume-asset',
      filename: `synthetic-resume.${extension}`,
      parse_status: 'READY',
      task_id: null,
      available: true,
      content_type: contentType,
      download_url: bucket + filePath + '?x-oss-signature=stale-list-url',
      created_at: user.created_at,
    };
    let refreshed = 0;
    const fileRequests: string[] = [];
    const errors: string[] = [];
    page.on('pageerror', (error) => errors.push(error.message));
    await page.addInitScript((user) => {
      // PDF viewer frames do not expose the app's session storage.
      if (window.top !== window) return;
      sessionStorage.setItem(
        'interview-session',
        JSON.stringify({ state: { token: 'synthetic', user, mode: 'live' }, version: 0 }),
      );
      const violations: string[] = [];
      (window as unknown as { __resumeCspViolations: string[] }).__resumeCspViolations = violations;
      document.addEventListener('securitypolicyviolation', (event) =>
        violations.push(
          JSON.stringify({
            directive: event.effectiveDirective,
            blocked: event.blockedURI,
            source: event.sourceFile,
            line: event.lineNumber,
          }),
        ),
      );
    }, user);
    await page.route(
      (url) => url.origin === origin && url.pathname === '/profile',
      async (route) => {
        const response = await route.fetch();
        await route.fulfill({ response, headers: { ...response.headers(), 'content-security-policy': csp } });
      },
    );
    await page.route('**/api/v1/**', async (route) => {
      const path = new URL(route.request().url()).pathname;
      let data: unknown;
      if (path.endsWith('/users/me')) data = user;
      else if (path.endsWith('/users/me/consents')) data = { policy_version: '1.0', items: [] };
      else if (path.endsWith('/resumes/resume-preview')) {
        refreshed++;
        data = { ...resume, download_url: bucket + filePath + query(refreshed) };
      } else if (path.endsWith('/resumes')) data = { items: [resume], total: 1, page: 1, page_size: 100 };
      else throw new Error(`Unexpected preview fixture API: ${path}`);
      await route.fulfill({ json: { code: 'OK', message: 'success', data, request_id: 'resume-preview' } });
    });
    await page.route(`${bucket}/**`, (route) => route.abort('accessdenied'));
    await page.route(
      (url) => url.origin === origin && url.pathname === filePath,
      (route) => {
        fileRequests.push(route.request().url());
        if (extension === 'docx' && fileRequests.length === 1) return route.abort('connectionfailed');
        return route.fulfill({ contentType, body: bytes });
      },
    );
    await page.goto('/profile');
    await page.locator('summary').filter({ hasText: '我的简历' }).click();
    const previewButton = page.getByRole('button', { name: `查看简历 ${resume.filename}`, exact: true });
    await expect(previewButton).toBeVisible();
    const pdfNavigation =
      extension === 'pdf'
        ? page.waitForEvent('framenavigated', (frame) => frame.url().startsWith('blob:'))
        : null;
    await previewButton.click();
    const modal = page.getByRole('dialog');
    if (extension === 'docx') {
      await expect(modal.getByRole('alert')).toContainText('简历原文件连接失败');
      await modal.getByRole('button', { name: '重试', exact: true }).click();
    }
    await expect(modal.getByRole('link', { name: '下载原文件', exact: true })).toBeVisible();
    expect(fileRequests.at(-1)).toBe(origin + filePath + query(refreshed));
    expect(refreshed).toBe(extension === 'docx' ? 2 : 1);
    if (extension === 'docx') {
      await expect(
        modal.frameLocator('iframe[title="简历原文件 DOCX 预览"]').getByText('Synthetic resume preview'),
      ).toBeVisible();
      await expect(modal.getByText('正在加载完整简历…')).toHaveCount(0);
    } else {
      await pdfNavigation;
      await expect(modal.locator('iframe[title="简历原文件 PDF 预览"]')).toHaveAttribute('src', /^blob:/);
    }
    const downloadPromise = page.waitForEvent('download');
    await modal.getByRole('link', { name: '下载原文件', exact: true }).click();
    const download = await downloadPromise;
    expect(download.suggestedFilename()).toBe(resume.filename);
    expect(readFileSync((await download.path())!)).toEqual(bytes);
    expect(
      await page.evaluate(
        () => (window as unknown as { __resumeCspViolations: string[] }).__resumeCspViolations,
      ),
    ).toEqual([]);
    expect(errors).toEqual([]);
  });
}
