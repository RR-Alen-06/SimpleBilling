import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { formatSequenceNumber } from '../src/lib/utils/format.ts';

const rootDir = path.resolve(import.meta.dirname, '..');

test('formatSequenceNumber keeps 4 digits up to 9999', () => {
  assert.equal(formatSequenceNumber('BILL', 1, 4), 'BILL-0001');
  assert.equal(formatSequenceNumber('PAY', 53, 4), 'PAY-0053');
  assert.equal(formatSequenceNumber('BILL', 9999, 4), 'BILL-9999');
});

test('formatSequenceNumber switches to 6 digits from 10000 to 999999', () => {
  assert.equal(formatSequenceNumber('BILL', 10000, 4), 'BILL-010000');
  assert.equal(formatSequenceNumber('PAY', 10000, 4), 'PAY-010000');
  assert.equal(formatSequenceNumber('BILL', 999999, 4), 'BILL-999999');
});

test('formatSequenceNumber switches to 8 digits from 1000000 and never truncates', () => {
  assert.equal(formatSequenceNumber('BILL', 1000000, 4), 'BILL-01000000');
  assert.equal(formatSequenceNumber('PAY', 99999999, 4), 'PAY-99999999');
  assert.equal(formatSequenceNumber('BILL', 100000000, 4), 'BILL-100000000');
});

test('formatSequenceNumber respects larger minPadding (e.g. TRANS=6)', () => {
  assert.equal(formatSequenceNumber('TRANS', 1, 6), 'TRANS-000001');
  assert.equal(formatSequenceNumber('TRANS', 10000, 6), 'TRANS-010000');
  assert.equal(formatSequenceNumber('TRANS', 1000000, 6), 'TRANS-01000000');
});

test('SQL migration defines format_sequence_number and updates get_next_sequence & generate_bill_number', () => {
  const sql = fs.readFileSync(
    path.join(rootDir, 'supabase/migrations/20261115_auto_expand_sequence_padding.sql'),
    'utf8'
  );
  assert.match(sql, /CREATE OR REPLACE FUNCTION public\.format_sequence_number/);
  assert.match(sql, /GREATEST\(v_base, 8, v_len\)/);
  assert.match(sql, /GREATEST\(v_base, 6, v_len\)/);
  assert.match(sql, /public\.format_sequence_number\(v_prefix, v_next_val, v_padding\)/);
  assert.match(sql, /public\.format_sequence_number\('BILL', nextval\('bill_number_seq'\), 4\)/);
});
