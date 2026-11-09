export interface DeviceInfo {
  userAgent: string;
  maxTouchPoints: number;
  screenWidth: number;
  screenHeight: number;
  mobileHint?: boolean;
}

// Use device signals, rather than viewport width: rotating a phone must not
// switch layouts, and a narrow desktop window must not become a phone.
export function detectLayout(info: DeviceInfo): 'phone' | 'desktop' {
  const { userAgent: ua, maxTouchPoints, screenWidth, screenHeight, mobileHint } = info;
  if (/iPad|Tablet|PlayBook|Silk/i.test(ua) || (/Macintosh/i.test(ua) && maxTouchPoints > 1))
    return 'desktop';
  if (/iPhone|iPod|Windows Phone/i.test(ua)) return 'phone';
  if (/Android/i.test(ua)) return /Mobile/i.test(ua) || mobileHint === true ? 'phone' : 'desktop';
  if (/Windows NT|Macintosh|CrOS|X11/i.test(ua)) return 'desktop';
  if (mobileHint === true || /Mobi/i.test(ua)) return 'phone';
  const shortSide = Math.min(screenWidth, screenHeight);
  return maxTouchPoints > 0 && shortSide > 0 && shortSide < 600 ? 'phone' : 'desktop';
}

export function browserLayout() {
  return detectLayout({
    userAgent: navigator.userAgent,
    maxTouchPoints: navigator.maxTouchPoints,
    screenWidth: window.screen.width,
    screenHeight: window.screen.height,
    mobileHint: (navigator as Navigator & { userAgentData?: { mobile: boolean } }).userAgentData?.mobile,
  });
}
