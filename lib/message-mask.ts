// message-mask.ts — 聊天气泡「阅后遮罩」配置与工具
// 消息明文显示设定秒数后，被随机遮罩字符替换；点击可恢复明文。

export const MASK_SECONDS_KEY = 'dodobox_mask_seconds';
export const MASK_CHARSET_KEY = 'dodobox_mask_charset';

// 自定义事件名：同标签页内设置变更时派发，供聊天页实时响应
export const MASK_SETTINGS_EVENT = 'dodobox:mask-settings-changed';

// 屏显秒数选项；0 表示「无限制」= 不遮罩（明文常驻）
export const MASK_SECONDS_OPTIONS = [5, 10, 30, 0] as const;

export interface MaskCharset {
  id: string;
  labelKey: string;
  chars: string;
}

export const MASK_CHARSETS: readonly MaskCharset[] = [
  { id: 'blocks', labelKey: 'settings.mask_charset_blocks', chars: '░▒▓█▚▙▛▜▞' },
  { id: 'hangul', labelKey: 'settings.mask_charset_hangul', chars: '가나다라마바사아자차카타파하국난달랑맘봄솔' },
  { id: 'braille', labelKey: 'settings.mask_charset_braille', chars: '⠁⠂⠃⠄⠅⠆⠇⠈⠉⠊⠋⠌⠍⠎⠏⠐⠑⠒' },
  { id: 'symbols', labelKey: 'settings.mask_charset_symbols', chars: '#@%&$*?!§¶' },
];

export const DEFAULT_CHARSET_ID = 'blocks';
export const DEFAULT_MASK_SECONDS = 5; // 默认5s

export function getCharsById(id: string): string {
  const found = MASK_CHARSETS.find((c) => c.id === id);
  return (found ?? MASK_CHARSETS[0]).chars;
}

export function getMaskSeconds(): number {
  if (typeof window === 'undefined') return DEFAULT_MASK_SECONDS;
  try {
    const raw = localStorage.getItem(MASK_SECONDS_KEY);
    if (raw === null) return DEFAULT_MASK_SECONDS;
    const n = Number(raw);
    return Number.isFinite(n) && n >= 0 ? n : DEFAULT_MASK_SECONDS;
  } catch {
    return DEFAULT_MASK_SECONDS;
  }
}

export function setMaskSeconds(seconds: number): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(MASK_SECONDS_KEY, String(seconds));
    window.dispatchEvent(new Event(MASK_SETTINGS_EVENT));
  } catch {
    // localStorage 不可用 — 非关键
  }
}

export function getMaskCharsetId(): string {
  if (typeof window === 'undefined') return DEFAULT_CHARSET_ID;
  try {
    const raw = localStorage.getItem(MASK_CHARSET_KEY);
    if (!raw) return DEFAULT_CHARSET_ID;
    return MASK_CHARSETS.some((c) => c.id === raw) ? raw : DEFAULT_CHARSET_ID;
  } catch {
    return DEFAULT_CHARSET_ID;
  }
}

export function setMaskCharsetId(id: string): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(MASK_CHARSET_KEY, id);
    window.dispatchEvent(new Event(MASK_SETTINGS_EVENT));
  } catch {
    // 非关键
  }
}

/**
 * 将文本逐字符替换为遮罩字符：空白字符（空格/换行/制表）原样保留以维持气泡形状，
 * 其余字符从 chars 中随机取。chars 为空时原样返回。
 */
export function maskText(text: string, chars: string): string {
  if (!text || !chars) return text;
  const pool = Array.from(chars);
  let out = '';
  for (const ch of text) {
    if (/\s/.test(ch)) {
      out += ch;
    } else {
      out += pool[Math.floor(Math.random() * pool.length)];
    }
  }
  return out;
}
