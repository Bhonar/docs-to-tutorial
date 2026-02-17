import { describe, it, expect } from 'vitest';
import { rgbaToHex, darkenHex, detectTheme, inferIndustry } from '../branding.js';

describe('rgbaToHex', () => {
  it('passes through hex colors', () => {
    expect(rgbaToHex('#FF6600')).toBe('#FF6600');
    expect(rgbaToHex('#abc')).toBe('#aabbcc');
  });

  it('strips alpha from 8-digit hex', () => {
    expect(rgbaToHex('#FF6600AA')).toBe('#FF6600');
  });

  it('converts rgb()', () => {
    expect(rgbaToHex('rgb(255, 102, 0)')).toBe('#ff6600');
    expect(rgbaToHex('rgb(0, 0, 0)')).toBe('#000000');
    expect(rgbaToHex('rgb(255, 255, 255)')).toBe('#ffffff');
  });

  it('converts rgba()', () => {
    expect(rgbaToHex('rgba(255, 102, 0, 0.5)')).toBe('#ff6600');
  });

  it('converts hsl()', () => {
    // hsl(0, 100%, 50%) = pure red
    expect(rgbaToHex('hsl(0, 100%, 50%)')).toBe('#ff0000');
    // hsl(120, 100%, 50%) = pure green
    expect(rgbaToHex('hsl(120, 100%, 50%)')).toBe('#00ff00');
    // hsl(240, 100%, 50%) = pure blue
    expect(rgbaToHex('hsl(240, 100%, 50%)')).toBe('#0000ff');
    // hsl(0, 0%, 50%) = gray
    expect(rgbaToHex('hsl(0, 0%, 50%)')).toBe('#808080');
  });

  it('converts hsla()', () => {
    expect(rgbaToHex('hsla(0, 100%, 50%, 0.5)')).toBe('#ff0000');
  });

  it('converts named colors', () => {
    expect(rgbaToHex('rebeccapurple')).toBe('#663399');
    expect(rgbaToHex('coral')).toBe('#FF7F50');
    expect(rgbaToHex('white')).toBe('#FFFFFF');
    expect(rgbaToHex('black')).toBe('#000000');
    expect(rgbaToHex('dodgerblue')).toBe('#1E90FF');
  });

  it('returns default for unknown formats', () => {
    expect(rgbaToHex('oklch(0.7 0.15 200)')).toBe('#0066FF');
    expect(rgbaToHex('lab(50% 40 60)')).toBe('#0066FF');
    expect(rgbaToHex('not-a-color')).toBe('#0066FF');
  });

  it('handles empty/null/undefined', () => {
    expect(rgbaToHex('')).toBe('#0066FF');
    expect(rgbaToHex(null as any)).toBe('#0066FF');
    expect(rgbaToHex(undefined as any)).toBe('#0066FF');
  });
});

describe('darkenHex', () => {
  it('darkens a hex color', () => {
    const result = darkenHex('#FF6600', 0.5);
    expect(result).toBe('#803300');
  });

  it('handles full darken (black)', () => {
    const result = darkenHex('#FF6600', 0);
    expect(result).toBe('#000000');
  });

  it('handles no darken (same color)', () => {
    const result = darkenHex('#FF6600', 1);
    expect(result).toBe('#ff6600');
  });

  it('returns default for invalid hex', () => {
    expect(darkenHex('not-hex', 0.5)).toBe('#003D99');
    expect(darkenHex('#abc', 0.5)).toBe('#003D99'); // too short
  });
});

describe('detectTheme', () => {
  it('detects light theme from white background', () => {
    expect(detectTheme({
      primary: '#0066FF',
      secondary: '#003D99',
      accent: '#66B3FF',
      background: '#FFFFFF',
    })).toBe('light');
  });

  it('detects dark theme from dark background', () => {
    expect(detectTheme({
      primary: '#0066FF',
      secondary: '#003D99',
      accent: '#66B3FF',
      background: '#1A1A1A',
    })).toBe('dark');
  });

  it('defaults to light for invalid colors', () => {
    expect(detectTheme({
      primary: '#0066FF',
      secondary: '#003D99',
      accent: '#66B3FF',
      background: 'not-a-color',
    })).toBe('light');
  });
});

describe('inferIndustry', () => {
  it('detects tech', () => {
    expect(inferIndustry('React Documentation', 'A JavaScript library for building user interfaces')).toBe('tech');
  });

  it('detects ecommerce', () => {
    expect(inferIndustry('Best Online Store', 'Buy products at great prices in our marketplace')).toBe('ecommerce');
  });

  it('returns general for unknown', () => {
    expect(inferIndustry('Hello World', 'Just a test page')).toBe('general');
  });
});
