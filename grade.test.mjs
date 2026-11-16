import assert from 'node:assert/strict';
import test from 'node:test';
const grade = await import('./dist/grade.js').catch(error => {
  if (error.code !== 'ERR_MODULE_NOT_FOUND') throw error;
  return {};
});

test('CSV preserves quoted commas, quotes and newlines', () => {
  assert.equal(typeof grade.parse, 'function');
  assert.deepEqual(grade.parse('\uFEFF姓名,Q1\r\n"李,明","a""b\nc"\r\n'), [['姓名','Q1'],['李,明','a"b\nc']]);
  assert.throws(() => grade.parse('a,"b'), /引号/);
});

const key = '题号,题型,答案,分值\n1,单选,A,2\n2,多选,AC,3\n3,填空,北京|北京市,1\n4,主观,,4';
test('grades objective questions by type and leaves written scores pending', () => {
  assert.equal(typeof grade.run, 'function');
  const result = grade.run(key, '姓名,4,3,2,1\n示例,理由, 北京市 ,Ｃ、Ａ,ａ');
  assert.deepEqual(result.students[0].marks, [2,3,1,null]);
  assert.equal(result.maximum, 10);
});
test('requires exactly the expected question columns', () => {
  assert.equal(typeof grade.run, 'function');
  assert.throws(() => grade.run(key,'姓名,1,1,3,4\n示例,A,AC,北京,理由'), /重复/);
});
test('export protects text cells from spreadsheet formulas', () => {
  assert.equal(typeof grade.asCsv, 'function');
  assert.equal(grade.asCsv([['=2+2', 'a"b', 3]]), '\uFEFF"\'=2+2","a""b","3"\r\n');
});
