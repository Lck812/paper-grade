export function parse(input) {
  const source = input.replace(/^\uFEFF/, '').replace(/\r\n?/g, '\n');
  const rows = [];
  let row = [], cell = '', quoted = false, closed = false;
  for (let i = 0; i <= source.length; i++) {
    const char = source[i];
    if (quoted) {
      if (char === undefined) throw new Error('CSV 有未闭合的引号。');
      if (char !== '"') cell += char;
      else if (source[i + 1] === '"') { cell += '"'; i++; }
      else { quoted = false; closed = true; }
    } else if (char === ',' || char === '\n' || char === undefined) {
      row.push(cell);
      cell = '';
      closed = false;
      if (char !== ',') {
        if (row.some(value => value.trim())) rows.push(row);
        row = [];
      }
    } else if (closed || (char === '"' && cell)) {
      throw new Error('CSV 引号位置不正确。');
    } else if (char === '"') quoted = true;
    else cell += char;
  }
  return rows;
}

const normalize = value => value.normalize('NFKC').trim().toUpperCase();
const choices = value => [...new Set(normalize(value).replace(/[\s,、;|]+/g, ''))].sort().join('');
const points = /^\d{1,6}(?:\.\d{1,2})?$/;

export function run(keyText, answerText) {
  const [keyHeader, ...keyRows] = parse(keyText);
  if (keyHeader?.map(value => value.trim()).join(',') !== '题号,题型,答案,分值' || !keyRows.length) {
    throw new Error('答案表需要表头「题号,题型,答案,分值」和至少一道题。');
  }
  const ids = new Set();
  const questions = keyRows.map((row, index) => {
    const [id, type, answer, score] = row.map(value => value.trim());
    if (row.length !== 4 || !id || id === '姓名' || !['单选','多选','判断','填空','主观'].includes(type) ||
        !points.test(score) || Number(score) <= 0 || (type !== '主观' && !answer)) {
      throw new Error('答案表第 ' + (index + 1) + ' 题的题号、题型、答案或分值有误。');
    }
    if (ids.has(id)) throw new Error('答案表有重复题号：' + id);
    ids.add(id);
    const accepted = type === '填空' ? answer.split('|').map(normalize).filter(Boolean) : [normalize(answer)];
    if (!accepted.length || (type === '单选' && !/^[A-Z]$/.test(accepted[0])) ||
        (type === '多选' && !/^[A-Z]+$/.test(choices(answer)))) {
      throw new Error('请检查第 ' + id + ' 题的标准答案。');
    }
    return {id, type, answer, accepted, max: Number(score)};
  });
  const [header, ...rows] = parse(answerText);
  const columns = header?.map(value => value.trim()) ?? [];
  if (new Set(columns).size !== columns.length) throw new Error('答卷表有重复列。');
  if (columns[0] !== '姓名' || columns.length !== questions.length + 1 || questions.some(q => !columns.includes(q.id)) || !rows.length) {
    throw new Error('答卷表首列需要是「姓名」，其余列须与答案表题号一一对应，并包含至少一份答卷。');
  }
  const mapping = questions.map(q => columns.indexOf(q.id));
  const students = rows.map((row, index) => {
    if (row.length !== columns.length || !row[0].trim()) throw new Error('第 ' + (index + 1) + ' 份答卷的姓名或列数有误。');
    const responses = mapping.map(column => row[column]);
    const marks = questions.map((q, i) => {
      if (q.type === '主观') return null;
      const value = normalize(responses[i]);
      const correct = q.type === '多选' ? choices(value) === choices(q.answer) : q.accepted.includes(value);
      return correct ? q.max : 0;
    });
    return {name: row[0].trim(), responses, marks};
  });
  return {questions, students, maximum: total(questions.map(q => q.max))};
}

export const total = scores => scores.reduce((sum, score) => sum + Math.round(score * 100), 0) / 100;

export function asCsv(rows, protect = true) {
  return '\uFEFF' + rows.map(row => row.map(value => {
    let text = String(value ?? '');
    if (protect && typeof value === 'string' && /^[\s\uFEFF]*[=+\-@＝＋－＠]|^[\t\r\n]/u.test(text)) text = "'" + text;
    return '"' + text.replaceAll('"', '""') + '"';
  }).join(',')).join('\r\n') + '\r\n';
}
