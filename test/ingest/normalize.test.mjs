import { describe, it, expect } from 'vitest';
import { normalizeName, sanitize } from '../../scripts/ingest/normalize.mjs';

describe('normalizeName', () => {
  it('strips diacritics and lowercases (AE2 data side)', () => {
    expect(normalizeName('Félix Sánchez')).toBe('felix sanchez');
  });

  it('collapses and trims whitespace', () => {
    expect(normalizeName('  José   Bautista  ')).toBe('jose bautista');
  });

  it('folds a variety of Caribbean-name accents', () => {
    expect(normalizeName('Andruw Jones')).toBe('andruw jones');
    expect(normalizeName('Robinson Canó')).toBe('robinson cano');
    expect(normalizeName('François')).toBe('francois');
  });

  it('is idempotent', () => {
    const once = normalizeName('Vladimir Guerrero Jr.');
    expect(normalizeName(once)).toBe(once);
  });

  it('handles null and undefined without throwing', () => {
    expect(normalizeName(null)).toBe('');
    expect(normalizeName(undefined)).toBe('');
  });
});

describe('sanitize', () => {
  it('strips angle brackets so ingested markup cannot inject', () => {
    expect(sanitize('Bad<script>Name')).toBe('BadscriptName');
  });

  it('preserves legitimate punctuation and casing', () => {
    expect(sanitize("O'Neal-Smith Jr.")).toBe("O'Neal-Smith Jr.");
  });

  it('collapses embedded control characters and whitespace', () => {
    expect(sanitize('a\t\n b')).toBe('a b');
  });
});
