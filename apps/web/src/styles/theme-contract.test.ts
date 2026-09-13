import { describe, expect, it } from 'vitest';

import componentsCss from './components.css?raw';
import themeCss from './theme.css?raw';
import tokensCss from './tokens.css?raw';

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

  it('keeps shared learning-area surfaces and actions in the semantic token contract', () => {
    for (const token of [
      '--surface-page:',
      '--surface-raised:',
      '--surface-muted:',
      '--border-subtle:',
      '--action-primary:',
      '--action-primary-text:',
    ]) {
      expect(tokensCss).toContain(token);
      expect(themeCss).toContain(token);
    }
    expect(tokensCss).toContain('--radius-sm: 12px;');
    expect(tokensCss).toContain('--radius-lg: 18px;');
  });
});
