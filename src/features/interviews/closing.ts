export function closingMessage(language: string) {
  return language === 'en-US'
    ? 'Thank you for taking the time to attend this practice interview and for sharing your professional experience. This concludes our interview. A comprehensive review report will be prepared based on your responses and performance, with feedback to support your continued preparation. Thank you for your participation, and we wish you every success in your career.'
    : '感谢您参加本次模拟面试，并分享您的工作经历与专业见解。本次面试到此结束，系统将根据您刚才的回答与表现生成完整的面试复盘报告，为您后续的准备与提升提供参考。感谢您的时间与配合，祝您求职顺利。';
}
