import test from 'node:test';
import assert from 'node:assert/strict';
import { selectSlides } from '../lib/export.js';

const slides = [
  { number: 1, name: 'title' },
  { number: 2, name: 'details' },
  { number: 3, name: 'community' },
  { number: 4, name: 'thanks' }
];

test('selects slide numbers, ranges, and stable names in the requested order', () => {
  assert.deepEqual(selectSlides(slides, '1,community,2-3'), [0, 2, 1, 2]);
  assert.deepEqual(selectSlides(slides), [0, 1, 2, 3]);
});

test('rejects invalid selections and ambiguous slide names', () => {
  assert.throws(() => selectSlides(slides, '5'), /out of range/);
  assert.throws(() => selectSlides(slides, '3-2'), /ascending/);
  assert.throws(() => selectSlides(slides, 'unknown'), /Unknown slide/);
  assert.throws(() => selectSlides([...slides, { number: 5, name: 'title' }], 'title'), /Duplicate data-name/);
  assert.throws(() => selectSlides([{ number: 1, name: '' }]), /has no data-name/);
});
