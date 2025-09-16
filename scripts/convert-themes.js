const fs = require('fs');
const path = require('path');

const themeDir = path.join(__dirname, '..', 'themes');

const NAMED_COLORS = {
  white: '#FFFFFF',
  black: '#000000',
  transparent: 'rgba(0, 0, 0, 0)'
};

function selectorToRegex(selector) {
  return selector
    .replace(/[-/\\^$*+?.()|[\]{}]/g, '\\$&')
    .replace(/\s+/g, '\\s*');
}

function extractProperty(css, selectors, property) {
  const list = Array.isArray(selectors) ? selectors : [selectors];
  for (const selector of list) {
    const blockPattern = new RegExp(`${selectorToRegex(selector)}[^\\{]*\\{([^}]*)\}`, 'i');
    const match = css.match(blockPattern);
    if (!match) continue;
    const body = match[1];
    const declarations = body.split(';');
    for (const declaration of declarations) {
      const [rawProp, ...rawValue] = declaration.split(':');
      if (!rawValue.length) continue;
      if (rawProp && rawProp.trim().toLowerCase() === property.toLowerCase()) {
        return rawValue.join(':').trim();
      }
    }
  }
  return null;
}

function parseColor(input) {
  if (!input) return null;
  const value = input.trim().toLowerCase();
  if (NAMED_COLORS[value]) {
    return parseColor(NAMED_COLORS[value]);
  }
  if (value.startsWith('#')) {
    let hex = value.slice(1);
    if (hex.length === 3) {
      hex = hex
        .split('')
        .map((c) => c + c)
        .join('');
    }
    if (hex.length === 6 || hex.length === 8) {
      const r = parseInt(hex.slice(0, 2), 16);
      const g = parseInt(hex.slice(2, 4), 16);
      const b = parseInt(hex.slice(4, 6), 16);
      let a = 1;
      if (hex.length === 8) {
        a = parseInt(hex.slice(6, 8), 16) / 255;
      }
      return { r, g, b, a };
    }
  }
  const rgbaMatch = value.match(/rgba?\s*\(([^)]+)\)/i);
  if (rgbaMatch) {
    const parts = rgbaMatch[1]
      .split(',')
      .map((part) => part.trim())
      .filter(Boolean);
    if (parts.length >= 3) {
      const r = Math.max(0, Math.min(255, Math.round(parseFloat(parts[0]))));
      const g = Math.max(0, Math.min(255, Math.round(parseFloat(parts[1]))));
      const b = Math.max(0, Math.min(255, Math.round(parseFloat(parts[2]))));
      const a = parts.length >= 4 ? Math.max(0, Math.min(1, parseFloat(parts[3]))) : 1;
      if (Number.isFinite(r) && Number.isFinite(g) && Number.isFinite(b) && Number.isFinite(a)) {
        return { r, g, b, a };
      }
    }
  }
  return null;
}

function componentToHex(value) {
  return value.toString(16).padStart(2, '0').toUpperCase();
}

function colorToString(color) {
  if (!color) return null;
  const { r, g, b, a = 1 } = color;
  if (a >= 0.999) {
    return `#${componentToHex(r)}${componentToHex(g)}${componentToHex(b)}`;
  }
  const alpha = Math.round(a * 1000) / 1000;
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

function normalizeColor(value) {
  const parsed = parseColor(value);
  return parsed ? colorToString(parsed) : null;
}

function withAlpha(value, alpha) {
  const parsed = parseColor(value);
  if (!parsed) return null;
  return colorToString({ ...parsed, a: Math.max(0, Math.min(1, alpha)) });
}

function adjustColor(value, amount) {
  const parsed = parseColor(value);
  if (!parsed) return null;
  const target = amount >= 0 ? 255 : 0;
  const ratio = Math.max(0, Math.min(1, Math.abs(amount)));
  const r = Math.round(parsed.r + (target - parsed.r) * ratio);
  const g = Math.round(parsed.g + (target - parsed.g) * ratio);
  const b = Math.round(parsed.b + (target - parsed.b) * ratio);
  return colorToString({ r, g, b, a: parsed.a });
}

function luminance(value) {
  const parsed = parseColor(value);
  if (!parsed) return 0;
  const { r, g, b } = parsed;
  const linear = [r, g, b].map((component) => {
    const c = component / 255;
    return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
  });
  return 0.2126 * linear[0] + 0.7152 * linear[1] + 0.0722 * linear[2];
}

function fallbackColor(...candidates) {
  for (const candidate of candidates) {
    const normalized = normalizeColor(candidate);
    if (normalized) return normalized;
  }
  return null;
}

function inferColorScheme(bgColor) {
  const lum = luminance(bgColor);
  return lum < 0.45 ? 'dark' : 'light';
}

function toTitleCase(slug) {
  return slug
    .replace(/[-_]+/g, ' ')
    .replace(/\b\w/g, (char) => char.toUpperCase())
    .replace(/\bOled\b/g, 'OLED');
}

const files = fs
  .readdirSync(themeDir)
  .filter((file) => file.endsWith('.css'))
  .sort();

for (const file of files) {
  const filePath = path.join(themeDir, file);
  const css = fs.readFileSync(filePath, 'utf8');
  const id = path.basename(file, '.css');

  const bodyBg = fallbackColor(extractProperty(css, 'body', 'background-color'));
  const bodyColor = fallbackColor(extractProperty(css, 'body', 'color'));
  const sidebarBg = fallbackColor(extractProperty(css, '.sidebar', 'background-color'));
  const sidebarBorder = fallbackColor(
    extractProperty(css, '.sidebar', 'border-right'),
    extractProperty(css, '.sidebar', 'border-left'),
    extractProperty(css, '.divider', 'border-bottom')
  );
  const sessionItemBg = fallbackColor(extractProperty(css, '.session-item', 'background-color'));
  const sidebarLabel = fallbackColor(extractProperty(css, '.sidebar-label', 'color'));
  const sidebarBtnBg = fallbackColor(extractProperty(css, '.sidebar-btn', 'background-color'));
  const sidebarBtnColor = fallbackColor(extractProperty(css, '.sidebar-btn', 'color'));
  const sidebarBtnHover = fallbackColor(extractProperty(css, '.sidebar-btn:hover', 'background-color'));
  const chatMainBg = fallbackColor(extractProperty(css, '.chat-main', 'background-color'));
  const userMsgBg = fallbackColor(extractProperty(css, '.user-message', 'background-color'));
  const userMsgColor = fallbackColor(extractProperty(css, '.user-message', 'color'));
  const aiMsgBg = fallbackColor(extractProperty(css, '.ai-message', 'background-color'));
  const aiMsgColor = fallbackColor(extractProperty(css, '.ai-message', 'color'));
  const composerBg = fallbackColor(extractProperty(css, '.chat-input-container', 'background-color'));
  const composerBorder = fallbackColor(extractProperty(css, '.chat-input-container', 'border-top'));
  const chatInputBg = fallbackColor(extractProperty(css, '#chat-input', 'background-color'));
  const chatInputColor = fallbackColor(extractProperty(css, '#chat-input', 'color'));
  const chatInputBorder = fallbackColor(extractProperty(css, '#chat-input', 'border'));
  const sendBtnBg = fallbackColor(
    extractProperty(css, '#send-button', 'background-color'),
    extractProperty(css, '#send-button, #voice-input-btn', 'background-color')
  );
  const sendBtnColor = fallbackColor(
    extractProperty(css, '#send-button', 'color'),
    extractProperty(css, '#send-button, #voice-input-btn', 'color')
  );
  const sendBtnHover = fallbackColor(extractProperty(css, '#send-button:hover', 'background-color'));
  const sendBtnDisabled = fallbackColor(extractProperty(css, '#send-button:disabled', 'background-color'));

  const scheme = inferColorScheme(bodyBg || sidebarBg || chatMainBg);
  const accent = sendBtnBg || '#3F6DF4';
  const accentText = sendBtnColor || (scheme === 'dark' ? '#0F172A' : '#FFFFFF');
  const accentHover = sendBtnHover || adjustColor(accent, scheme === 'dark' ? -0.15 : 0.12);
  const accentDisabled = sendBtnDisabled || withAlpha(accent, scheme === 'dark' ? 0.35 : 0.4);
  const accentSoft = withAlpha(accent, 0.22);

  const textPrimary = bodyColor || (scheme === 'dark' ? '#F5F5F5' : '#0F172A');
  const textSecondary =
    sidebarLabel ||
    withAlpha(textPrimary, scheme === 'dark' ? 0.75 : 0.65) ||
    (scheme === 'dark' ? 'rgba(240, 240, 240, 0.7)' : 'rgba(15, 23, 42, 0.6)');
  const textInverse = userMsgColor || (scheme === 'dark' ? '#111111' : '#FFFFFF');

  const background = bodyBg || chatMainBg || '#0F172A';
  const wallpaper = adjustColor(background, scheme === 'dark' ? -0.05 : 0.08) || background;
  const panel = sidebarBg || composerBg || chatMainBg || background;
  const panelAlt = sessionItemBg || adjustColor(panel, scheme === 'dark' ? 0.08 : -0.08) || panel;
  const windowBg = chatMainBg || panel;
  const border =
    sidebarBorder ||
    chatInputBorder ||
    composerBorder ||
    withAlpha(textPrimary, scheme === 'dark' ? 0.35 : 0.22) ||
    (scheme === 'dark' ? 'rgba(255, 255, 255, 0.25)' : 'rgba(15, 23, 42, 0.2)');

  const chatUserBackground = userMsgBg || accent;
  const chatUserText = userMsgColor || textInverse;
  const chatAssistantBackground = aiMsgBg || panel;
  const chatAssistantText = aiMsgColor || textPrimary;

  const composerBackground = composerBg || panel;
  const inputBackground = chatInputBg || composerBackground;
  const inputBorder = chatInputBorder || composerBorder || border;
  const inputText = chatInputColor || textPrimary;

  const ghostBg = sidebarBtnBg || 'transparent';
  const ghostText = sidebarBtnColor || textPrimary;
  const ghostHover = sidebarBtnHover || accentSoft;

  const shadow =
    scheme === 'dark'
      ? '0 24px 48px rgba(0, 0, 0, 0.5)'
      : '0 24px 48px rgba(15, 23, 42, 0.18)';

  const variables = {
    '--theme-background': background,
    '--theme-wallpaper': wallpaper,
    '--theme-window': windowBg,
    '--theme-panel': panel,
    '--theme-panel-alt': panelAlt,
    '--theme-border': border,
    '--theme-border-strong': adjustColor(border, scheme === 'dark' ? -0.2 : 0.2) || border,
    '--theme-text-primary': textPrimary,
    '--theme-text-secondary': textSecondary,
    '--theme-text-inverse': textInverse,
    '--theme-accent': accent,
    '--theme-accent-text': accentText,
    '--theme-accent-hover': accentHover,
    '--theme-accent-disabled': accentDisabled,
    '--theme-accent-soft': accentSoft,
    '--theme-chat-user-bg': chatUserBackground,
    '--theme-chat-user-text': chatUserText,
    '--theme-chat-assistant-bg': chatAssistantBackground,
    '--theme-chat-assistant-text': chatAssistantText,
    '--theme-composer-bg': composerBackground,
    '--theme-input-bg': inputBackground,
    '--theme-input-border': inputBorder,
    '--theme-input-text': inputText,
    '--theme-ghost-bg': ghostBg,
    '--theme-ghost-text': ghostText,
    '--theme-ghost-hover': ghostHover,
    '--theme-shadow': shadow
  };

  const lines = [];
  lines.push(`/* Auto-generated theme variables for ${toTitleCase(id)} */`);
  lines.push(`:root[data-theme='${id}'] {`);
  lines.push(`  color-scheme: ${scheme};`);
  for (const [key, raw] of Object.entries(variables)) {
    const value = raw || '#777777';
    lines.push(`  ${key}: ${value};`);
  }
  lines.push('}');
  lines.push('');

  fs.writeFileSync(filePath, lines.join('\n'));
}
