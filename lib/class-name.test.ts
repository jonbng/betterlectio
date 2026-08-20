import assert from 'node:assert/strict';
import { describe, test } from 'node:test';

import {
  classGroupsMatch,
  extractClassGroup,
  getSchoolYearFromClassName,
  looksLikeAcademicClassPrefix,
  normalizeClassCode,
} from './class-name';
import { getCanonicalHoldKey } from './hold-mapping';

describe('looksLikeAcademicClassPrefix', () => {
  test('accepts grade-based and prefixed class codes', () => {
    for (const code of ['1x', '2ba', '2hf', '2zq', '1.4', 'L2d', 'S2x', 'IB1', '10.st.kl.2', '3hx-u']) {
      assert.equal(looksLikeAcademicClassPrefix(code), true, code);
    }
  });

  test('accepts named classes without a grade digit', () => {
    for (const code of ['BShannon', 'BHamilton', 'BTuring', 'Epsilon', 'gf', 'gø', 'E']) {
      assert.equal(looksLikeAcademicClassPrefix(code), true, code);
    }
  });
});

describe('normalizeClassCode', () => {
  test('peels Lectio hold ids when the tail is a class code', () => {
    assert.equal(normalizeClassCode('t25htxvx_1vx'), '1vx');
    assert.equal(normalizeClassCode('h26hhxc_gf'), 'gf');
  });
});

describe('extractClassGroup / classGroupsMatch', () => {
  test('strips optional student numbers from named classes', () => {
    assert.equal(extractClassGroup('BShannon 17'), 'BShannon');
    assert.equal(classGroupsMatch('BShannon 17', 'BShannon'), true);
    assert.equal(classGroupsMatch('1x 12', '1x'), true);
  });
});

describe('getSchoolYearFromClassName', () => {
  test('reads grade from digit-based codes and returns null for named classes', () => {
    assert.equal(getSchoolYearFromClassName('1x'), 1);
    assert.equal(getSchoolYearFromClassName('3c'), 3);
    assert.equal(getSchoolYearFromClassName('BShannon'), null);
    assert.equal(getSchoolYearFromClassName('Epsilon'), null);
  });
});

describe('getCanonicalHoldKey', () => {
  test('maps named-class holds onto the subject', () => {
    assert.equal(getCanonicalHoldKey('BShannon DA'), 'da');
    assert.equal(getCanonicalHoldKey('BShannon PU'), 'pu');
    assert.equal(getCanonicalHoldKey('BHamilton MA'), 'ma');
    assert.equal(getCanonicalHoldKey('1x MA'), 'ma');
    assert.equal(getCanonicalHoldKey('3hx-u DA'), 'da');
    assert.equal(getCanonicalHoldKey('1x IF'), 'it');
    assert.equal(getCanonicalHoldKey('IF'), 'it');
    assert.equal(getCanonicalHoldKey('1x IT'), 'it');
    assert.equal(getCanonicalHoldKey('IT'), 'it');
    assert.equal(getCanonicalHoldKey('INF'), 'it');
    assert.equal(getCanonicalHoldKey('1x IH'), 'ih');
    assert.equal(getCanonicalHoldKey('Idéhistorie'), 'ih');
  });
});
