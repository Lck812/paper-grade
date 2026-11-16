import {keyFromText, rowsFromText, combineAnswers} from './import.js';
import {extractPdf} from './pdf.js';
import {startInbox} from './inbox.js';
import {asCsv, run, total} from './grade.js';

const get = id => document.getElementById(id);
const key = get('key');
const answers = get('answers');
const resultPanel = get('result');
const status = get('status');
const example = {
  key: '题号,题型,答案,分值\n1,单选,B,2\n2,多选,AC,3\n3,判断,对,1\n4,填空,北京|北京市,2\n5,主观,说明水循环的主要过程,4',
  answers: '姓名,1,2,3,4,5\n学生甲,B,CA,对,北京市,水蒸发后凝结成云，再降水回到地表。\n学生乙,A,A,对,北京,水从地表蒸发。\n学生丙,B,AC,错,,'
};
let result;

function message(text, error = false) {
  status.textContent = text;
  status.classList.toggle('error', error);
}

function clearResult() {
  const hadResult = Boolean(result);
  result = undefined;
  resultPanel.hidden = true;
  message(hadResult ? '表格已修改，请重新批改。' : '');
}

function download(name, text) {
  const location = URL.createObjectURL(new Blob([text], {type:'text/csv;charset=utf-8'}));
  const link = document.createElement('a');
  link.href = location;
  link.download = name;
  link.click();
  setTimeout(() => URL.revokeObjectURL(location), 3000);
}

for (const field of [key, answers]) field.addEventListener('input', clearResult);
async function fileText(file) {
  const pdf = /\.pdf$/i.test(file.name);
  if (file.size > (pdf ? 12_000_000 : 5_000_000)) throw new Error(file.name + ' 超出大小限制。');
  const bytes = await file.arrayBuffer();
  if (pdf) return extractPdf(bytes);
  try { return new TextDecoder('utf-8', {fatal:true}).decode(bytes); }
  catch { return new TextDecoder('gb18030', {fatal:true}).decode(bytes); }
}

for (const input of document.querySelectorAll('[data-target]')) {
  input.addEventListener('change', async () => {
    const files = Array.from(input.files);
    if (!files.length) return;
    input.disabled = true;
    message('正在读取 ' + files.length + ' 个文件…');
    try {
      if (files.length > 30) throw new Error('每次最多上传 30 份答卷。');
      if (input.dataset.target === 'key') {
        const parsed = keyFromText(await fileText(files[0]));
        key.value = parsed.csv;
        clearResult();
        message(parsed.inferred
          ? '已提取答案。请核对题型和分值。' + (parsed.defaultScores ? ' 有 ' + parsed.defaultScores + ' 道题暂设为 1 分。' : '')
          : '已导入标准答案，请核对内容。');
        return;
      }
      if (files.length === 1 && /\.csv$/i.test(files[0].name)) {
        if (answers.value.trim() && !confirm('用这个班级 CSV 替换当前编辑区的答卷？')) return;
        answers.value = await fileText(files[0]);
      } else {
        if (files.some(file => /\.csv$/i.test(file.name))) throw new Error('班级 CSV 请单独上传。');
        if (!key.value.trim()) throw new Error('请先导入标准答案。');
        const rows = [];
        for (const file of files) {
          try { rows.push(rowsFromText(await fileText(file), file.name)); }
          catch (error) { throw new Error(file.name + '：' + error.message); }
        }
        answers.value = combineAnswers(key.value, rows, answers.value);
      }
      clearResult();
      message('已导入 ' + files.length + ' 个答卷文件，请检查内容后开始批改。');
    } catch (error) { message('导入失败。' + error.message, true); }
    finally {
      input.value = '';
      input.disabled = false;
    }
  });
}
for (const button of document.querySelectorAll('[data-template]')) {
  button.addEventListener('click', () => {
    const target = button.dataset.template;
    download(target === 'key' ? '标准答案模板.csv' : '学生答卷模板.csv', '\uFEFF' + example[target].replaceAll('\n', '\r\n'));
  });
}
get('demo').addEventListener('click', () => {
  if ((key.value.trim() || answers.value.trim()) && !confirm('用示例替换当前表格？')) return;
  key.value = example.key;
  answers.value = example.answers;
  clearResult();
  message('已载入 3 份示例答卷。点击「开始批改」查看结果。');
});

function element(tag, text, className) {
  const node = document.createElement(tag);
  node.textContent = text;
  if (className) node.className = className;
  return node;
}
function updateSummary() {
  const pending = result.students.reduce((count, student) => count + student.marks.filter(mark => mark === null).length, 0);
  get('summary').textContent = result.students.length + ' 份答卷 · 满分 ' + result.maximum + ' · ' + pending + ' 项待复核';
}
function updateScore(cell, marks) {
  cell.textContent = total(marks) + (marks.includes(null) ? '（暂计）' : '');
}
function draw() {
  const {questions, students} = result;
  const header = document.createElement('tr');
  for (const label of ['姓名', '得分', ...questions.map(q => q.id + ' · ' + q.type)]) {
    const th = element('th', label);
    th.scope = 'col';
    header.append(th);
  }
  get('head').replaceChildren(header);
  const rows = students.map(student => {
    const row = document.createElement('tr');
    const name = element('th', student.name);
    name.scope = 'row';
    const score = document.createElement('td');
    updateScore(score, student.marks);
    row.append(name, score);
    questions.forEach((question, index) => {
      const cell = document.createElement('td');
      const mark = student.marks[index];
      cell.append(element('span', '作答：' + (student.responses[index] || '（空白）'), 'detail'));
      if (question.answer) cell.append(element('span', '参考：' + question.answer, 'detail'));
      if (question.type === '主观') {
        const input = document.createElement('input');
        input.type = 'number';
        input.min = '0';
        input.max = String(question.max);
        input.step = '0.01';
        input.placeholder = '待评分';
        input.setAttribute('aria-label', student.name + '第 ' + question.id + ' 题得分，满分 ' + question.max);
        input.addEventListener('input', () => {
          student.marks[index] = input.value !== '' && input.validity.valid ? input.valueAsNumber : null;
          input.setAttribute('aria-invalid', String(!input.validity.valid));
          updateScore(score, student.marks);
          updateSummary();
        });
        input.addEventListener('change', () => input.reportValidity());
        cell.append(input);
      } else cell.append(element('strong', mark + ' / ' + question.max, mark ? '' : 'miss'));
      row.append(cell);
    });
    return row;
  });
  get('body').replaceChildren(...rows);
  updateSummary();
  resultPanel.hidden = false;
}

get('form').addEventListener('submit', event => {
  event.preventDefault();
  if (result) {
    resultPanel.scrollIntoView({block:'nearest'});
    return;
  }
  try {
    result = run(key.value, answers.value);
    draw();
    message('批改结果已生成。');
    resultPanel.scrollIntoView({block:'nearest'});
  } catch (error) {
    clearResult();
    message(error.message, true);
  }
});
get('export').addEventListener('click', () => {
  if (!result) return;
  const {questions, students, maximum} = result;
  const rows = [['姓名','当前得分','满分','状态', ...questions.map(q => q.id + '题得分')]];
  for (const {name, marks} of students) {
    rows.push([name, total(marks), maximum, marks.includes(null) ? '待复核' : '已完成', ...marks]);
  }
  download('阅卷成绩.csv', asCsv(rows));
});

if (location.pathname === '/grade/') {
  startInbox({key, answers, onChange:clearResult});
  document.querySelector('a[href^="/signout-with-chatgpt"]')?.addEventListener('click', event => {
    if ((key.value.trim() || answers.value.trim()) &&
        !confirm('退出后当前编辑区内容会清空。确认已导出需要保留的成绩？')) event.preventDefault();
  });
  window.addEventListener('pageshow', event => {
    if (event.persisted) location.reload();
  });
}
