import { describe, expect, it } from 'vitest';

import componentsCss from './components.css?raw';
import themeCss from './theme.css?raw';

describe('dark-theme contrast contract', () => {
  it('provides a light treatment for external sidebar SVG images', () => {
    expect(themeCss).toMatch(
      /body\.theme-dark \.module-icon img,[\s\S]*?filter:\s*brightness\(0\) invert\(1\)/,
    );
  });

  it('uses theme variables instead of a hard-coded white governance heading end color', () => {
    expect(componentsCss).toContain(
      'linear-gradient(135deg, var(--admin-paper), var(--admin-surface-end) 68%)',
    );
    expect(themeCss).toContain('--admin-surface-end:');
  });
});
