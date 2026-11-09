import { describe, expect, it } from 'vitest';
import { detectLayout, type DeviceInfo } from '../src/utils/device';

describe('手机专用 H5，PC 和平板沿用原布局', () => {
  const classify = (userAgent: string, extra: Partial<DeviceInfo> = {}) =>
    detectLayout({ userAgent, maxTouchPoints: 5, screenWidth: 390, screenHeight: 844, ...extra });

  it.each([
    'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) Mobile/15E148 Safari/604.1',
    'Mozilla/5.0 (Linux; Android 15; Pixel 9) Chrome/140.0 Mobile Safari/537.36',
    'Mozilla/5.0 (iPhone) MicroMessenger/8.0 Mobile',
    'Mozilla/5.0 (Linux; Android 14; SM-F956B) Mobile',
  ])('手机浏览器自动使用 H5: %s', (ua) => {
    expect(classify(ua)).toBe('phone');
    expect(classify(ua, { screenWidth: 844, screenHeight: 390 })).toBe('phone');
  });

  it.each([
    'Mozilla/5.0 (iPad; CPU OS 18_0 like Mac OS X) Mobile/15E148',
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15) Version/18.0 Mobile/15E148 Safari/604.1',
    'Mozilla/5.0 (Linux; Android 15; SM-X710) Chrome/140.0 Safari/537.36',
    'Mozilla/5.0 (Linux; Android 15; Tablet) Mobile',
  ])('平板即使窗口较窄也使用原版本: %s', (ua) => {
    expect(classify(ua)).toBe('desktop');
  });

  it.each([
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/140.0',
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15) Chrome/140.0',
    'Mozilla/5.0 (X11; Linux x86_64) Firefox/140.0',
  ])('PC 窄窗口仍使用原版本: %s', (ua) => {
    expect(classify(ua, { maxTouchPoints: 0 })).toBe('desktop');
  });

  it('仅对未知的小屏触摸设备兜底，不将触摸平板识别成手机', () => {
    expect(classify('Unknown browser')).toBe('phone');
    expect(classify('Unknown browser', { screenWidth: 744, screenHeight: 1133 })).toBe('desktop');
    expect(classify('Unknown browser', { maxTouchPoints: 0 })).toBe('desktop');
    expect(classify('Unknown browser', { screenWidth: 0, screenHeight: 0 })).toBe('desktop');
  });
});
