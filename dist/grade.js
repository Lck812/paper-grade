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


export function parseRubric(answer) {
  const normalized = answer.normalize('NFKC').trim();
  if (!normalized.startsWith('评分点:')) return null;
  const entries = normalized.slice('评分点:'.length).split(/[;\n]/).map(line => line.trim()).filter(Boolean);
  const seen = new Set();
  if (!entries.length || entries.length > 40) throw new Error('请填写 1–40 个评分点。');
  return entries.map(entry => {
    const pair = /^([^=]+)=(.*)$/.exec(entry);
    const value = pair?.[1].trim();
    if (!value || !points.test(value) || Number(value) <= 0) throw new Error('评分点需写成「分值=关键词」。');
    const terms = pair[2].split('|').map(term => term.trim());
    if (!terms.length || terms.length > 20 || terms.some(term => !term || term.length > 80)) {
      throw new Error('请为每个评分点填写有效关键词。');
    }
    for (const term of terms) {
      const normalizedTerm = normalize(term);
      if (seen.has(normalizedTerm)) throw new Error('评分点包含重复关键词「' + term + '」。');
      seen.add(normalizedTerm);
    }
    return {points:Number(value), terms};
  });
}

function gradeWritten(question, response) {
  const text = normalize(response);
  if (!text) return {mark:0, reason:'空白答卷，得 0 分。'};
  if (!question.rubric) {
    return text === normalize(question.answer)
      ? {mark:question.max, reason:'与参考答案一致。'}
      : {mark:null, reason:'缺少可匹配的评分点，请复核。'};
  }
  const hit = [], missed = [];
  let possibleNegation = false;
  const clauses = text.split(/[，,。！？!?；;\n]/u);
  for (const criterion of question.rubric) {
    let matched = false;
    for (const phrase of criterion.terms.map(normalize)) {
      for (const clause of clauses) {
        let from = 0, index;
        while ((index = clause.indexOf(phrase, from)) !== -1) {
          from = index + phrase.length;
          const before = clause.slice(Math.max(0,index - 10),index);
          const after = clause.slice(from,from + 10);
          if ((/^[A-Z0-9]/.test(phrase) && /[A-Z0-9]$/.test(before)) ||
              (/[A-Z0-9]$/.test(phrase) && /^[A-Z0-9]/.test(after))) continue;
          if (/(?:没有|并未|并非|不是|不能|不需要|未|无|不|NOT |NO )\s*(?:发生|出现|发生了)?\s*$/.test(before) ||
              /^\s*(?:不会发生|没有发生|不成立)/.test(after)) {
            possibleNegation = true;
          } else matched = true;
        }
      }
    }
    (matched ? hit : missed).push(criterion);
  }
  if (possibleNegation) return {mark:null, reason:'评分词附近检测到否定表达，请复核。'};
  const describe = items => items.map(item => item.terms[0] + ' ' + item.points + '分').join('、');
  const reason = [
    hit.length ? '已匹配 ' + describe(hit) : '',
    missed.length ? '未匹配 ' + describe(missed) : '',
  ].filter(Boolean).join('。');
  return {mark:total(hit.map(item => item.points)), reason};
}

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
    const max = Number(score);
    const rubric = type === '主观' ? parseRubric(answer) : null;
    if (rubric && total(rubric.map(item => item.points)) !== max) {
      throw new Error('第 ' + id + ' 题的评分点合计须等于该题满分。');
    }
    return {id, type, answer, accepted, max, rubric};
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
    const explanations = [];
    const marks = questions.map((q, i) => {
      if (q.type === '主观') {
        const {mark,reason} = gradeWritten(q, responses[i]);
        explanations[i] = reason;
        return mark;
      }
      const value = normalize(responses[i]);
      const correct = q.type === '多选' ? choices(value) === choices(q.answer) : q.accepted.includes(value);
      return correct ? q.max : 0;
    });
    return {name: row[0].trim(), responses, marks, explanations};
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
