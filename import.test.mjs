import assert from 'node:assert/strict';
import test from 'node:test';
import {keyFromText, rowsFromText, combineAnswers} from './dist/import.js';
import {parse, run} from './dist/grade.js';

test('converts numbered reference answers, preserves internal punctuation and reports default points', () => {
  const key = keyFromText('标准答案\n１．a（２分）\n2、A、C (3分)\n3: New York, NY\n4：对');
  assert.equal(key.defaultScores, 2);
  assert.deepEqual(parse(key.csv).slice(1), [
    ['1','单选','a','2'], ['2','多选','A、C','3'],
    ['3','填空','New York, NY','1'], ['4','判断','对','1'],
  ]);
});

test('aligns individual TXT and PDF answer rows to the standard key', () => {
  const key = keyFromText('1. B\n2. CA (3分)\n3. 北京').csv;
  const rows = rowsFromText('姓名：学生甲\n2. AC\n1. B', 'file.pdf');
  const more = rowsFromText('1: B\n3: 北京', '学生乙.txt');
  const combined = combineAnswers(key, [rows, more]);
  const scored = run(key, combined);
  assert.deepEqual(scored.students.map(item => [item.name, item.marks]), [
    ['学生甲',[1,3,0]], ['学生乙',[1,0,1]],
  ]);
});

test('rejects duplicate and unknown questions and unsupported layout', () => {
  assert.throws(() => keyFromText('1. A\n1. B'), /重复/);
  assert.throws(() => keyFromText('1. A\n一段位置不明的文字'), /第 2 行/);
  assert.throws(() => combineAnswers(keyFromText('1. A').csv, [
    rowsFromText('2. A','学生.pdf'),
  ]), /题号/);
});
