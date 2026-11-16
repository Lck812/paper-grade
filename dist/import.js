import {asCsv, parse, run} from './grade.js';

const csv = rows => asCsv(rows, false).replace(/^\uFEFF/, '');
const clean = text => text.normalize('NFKC').trim();

function numbered(text, fallback = '') {
  const items = new Map();
  let name = fallback;
  for (const [index, raw] of text.replace(/\r\n?/g, '\n').split('\n').entries()) {
    const line = raw.trim();
    if (!line || /^(标准答案|参考答案|学生答卷|答案|试卷答案)[:：]?$/.test(line)) continue;
    const named = /^姓名\s*[:：]\s*(.+)$/.exec(line);
    if (named && fallback) {
      name = named[1].trim();
      continue;
    }
    const pair = /^([0-9０-９]+)\s*[.．、：:）)]\s*(.*)$/.exec(line);
    if (!pair) throw new Error('第 ' + (index + 1) + ' 行无法识别，请使用「1. 答案」格式。');
    const id = clean(pair[1]);
    if (items.has(id)) throw new Error('题号 ' + id + ' 重复。');
    items.set(id, pair[2]);
  }
  if (!items.size) throw new Error('没有找到带题号的答案。');
  return {name, items};
}

export function keyFromText(text) {
  if (/^\uFEFF?\s*"?题号"?\s*,/.test(text)) { keyIds(text); return {csv:text, defaultScores:0, inferred:false}; }
  const {items} = numbered(text);
  let defaultScores = 0;
  const rows = [['题号','题型','答案','分值']];
  for (const [id, value] of items) {
    const scored = /[(（]\s*([0-9０-９]+(?:[.．][0-9０-９]{1,2})?)\s*分\s*[)）]\s*$/.exec(value);
    const answer = scored ? value.slice(0, scored.index).trim() : value.trim();
    const upper = clean(answer).toUpperCase();
    const choices = upper.replace(/[\s,、;]+/g, '');
    let type = '填空';
    if (!answer) type = '主观';
    else if (/^[A-Z]$/.test(upper)) type = '单选';
    else if (/^[A-Z]{2,6}$/.test(choices)) type = '多选';
    else if (/^(对|错|正确|错误|√|×)$/.test(upper)) type = '判断';
    if (!scored) defaultScores++;
    rows.push([id, type, answer, scored ? clean(scored[1]) : '1']);
  }
  const result = csv(rows);
  keyIds(result);
  return {csv:result, defaultScores, inferred:true};
}

export function keyIds(key) {
  const [, ...rows] = parse(key);
  const ids = rows.map(row => row[0].trim());
  const probe = csv([['姓名', ...ids], ['预览', ...ids.map(() => '')]]);
  return run(key, probe).questions.map(question => question.id);
}

export function rowsFromText(text, filename) {
  return numbered(text, filename.replace(/\.[^.]+$/, '').trim() || '未命名答卷');
}

export function combineAnswers(key, responses, previous = '') {
  const ids = keyIds(key);
  const columns = ['姓名', ...ids];
  const output = [columns];
  if (previous.trim()) {
    run(key, previous);
    const [header, ...rows] = parse(previous);
    const order = columns.map(column => header.findIndex(value => value.trim() === column));
    for (const row of rows) output.push(order.map(index => row[index]));
  }
  for (const {name, items} of responses) {
    for (const id of items.keys()) {
      if (!ids.includes(id)) throw new Error(name + ' 的题号 ' + id + ' 未出现在标准答案中。');
    }
    output.push([name, ...ids.map(id => items.get(id) ?? '')]);
  }
  return csv(output);
}
