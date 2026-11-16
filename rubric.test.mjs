import assert from 'node:assert/strict';
import test from 'node:test';
import {asCsv,run} from './dist/grade.js';
import {keyFromText} from './dist/import.js';

const rule = '评分点：2=蒸发|汽化；1=凝结；1=降水|下雨';
const key = (answer = rule, score = 4) => asCsv([['题号','题型','答案','分值'],['1','主观',answer,score]],false);
const papers = (...answers) => asCsv([['姓名','1'], ...answers.map((answer,i) => ['学生'+i,answer])],false);

test('scores alternatives once, awards partial credit, and explains deductions', () => {
  const scored = run(key(),papers('汽化后凝结，最后下雨','蒸发或汽化','完全跑题',''));
  assert.deepEqual(scored.students.map(s => s.marks[0]),[4,2,0,0]);
  assert.match(scored.students[1].explanations[0], /蒸发.*2分/);
  assert.match(scored.students[1].explanations[0], /未匹配.*凝结/);
});

test('keeps contradictory statements for review and rejects score mismatches', () => {
  const scored = run(key(),papers('水蒸发但没有凝结','并未汽化'));
  assert.deepEqual(scored.students.map(s => s.marks[0]),[null,null]);
  assert.match(scored.students[1].explanations[0], /否定/);
  assert.throws(() => run(key(rule,3),papers('汽化')), /合计/);
  assert.throws(() => run(key('评分点：1=；3=蒸发'),papers('汽化')), /评分点/);
});

test('scores an exact reference match and leaves open-text differences for review', () => {
  const scored = run(key('浮力向上'),papers(' 浮力向上 ','浮力方向竖直向上',''));
  assert.deepEqual(scored.students.map(s => s.marks[0]),[4,null,0]);
});

test('recognizes a rubric in a numbered TXT or extracted PDF', () => {
  const imported = keyFromText('1. '+rule);
  assert.equal(imported.defaultScores,0);
  const scored = run(imported.csv,papers('凝结并下雨'));
  assert.equal(scored.maximum,4);
  assert.equal(scored.students[0].marks[0],2);
});
