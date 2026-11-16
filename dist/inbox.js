import {asCsv} from './grade.js';

export function startInbox({key, answers, onChange}) {
  const inbox = document.querySelector('#inbox');
  const status = document.querySelector('#inbox-status');
  const setup = document.querySelector('#inbox-setup');
  const opened = document.querySelector('#inbox-open');
  let record;
  inbox.hidden = false;

  async function request(method = 'GET', body) {
    const response = await fetch('/api/inbox', {method,
      headers:body ? {'content-type':'application/json'} : undefined,
      body:body ? JSON.stringify(body) : undefined});
    if (response.status === 204 || (method === 'GET' && response.status === 404)) return null;
    const data = await response.json();
    if (!response.ok) throw new Error(data.error);
    return data;
  }

  function loadAnswers() {
    key.value = record.key;
    answers.value = record.submissions.length ? asCsv([
      ['姓名', ...record.questions],
      ...record.submissions.map(item => [item.name,...item.answers]),
    ],false) : '';
    onChange();
  }

  async function refresh(initial = false) {
    status.textContent = '正在查看答卷…';
    try {
      record = await request();
      setup.hidden = Boolean(record);
      opened.hidden = !record;
      if (!record) {
        status.textContent = '还没有在线收卷。导入标准答案后即可生成学生链接。';
        return;
      }
      document.querySelector('#collection-name').textContent = record.title;
      const link = new URL('/collect/'+record.code, location.origin).href;
      document.querySelector('#collection-link').value = link;
      document.querySelector('#collection-count').textContent = '已收到 ' + record.submissions.length + ' 份答卷';
      document.querySelector('#submission-list').replaceChildren(...record.submissions.map(item => {
        const row = document.createElement('li');
        row.textContent = item.name + ' · ' + new Date(item.submittedAt).toLocaleString('zh-CN');
        return row;
      }));
      status.textContent = '';
      if (initial && !key.value.trim() && !answers.value.trim()) loadAnswers();
    } catch (error) { status.textContent = error.message; }
  }

  document.querySelector('#inbox-create').addEventListener('click', async event => {
    const button = event.currentTarget;
    button.disabled = true;
    try {
      await request('POST',{title:document.querySelector('#inbox-title').value, key:key.value});
      await refresh();
    } catch (error) { status.textContent = error.message; }
    finally { button.disabled = false; }
  });

  document.querySelector('#inbox-refresh').addEventListener('click', () => refresh());
  document.querySelector('#inbox-copy').addEventListener('click', async () => {
    const link = document.querySelector('#collection-link');
    try {
      await navigator.clipboard.writeText(link.value);
      status.textContent = '学生链接已复制。';
    } catch {
      link.select();
      status.textContent = '请复制选中的学生链接。';
    }
  });
  document.querySelector('#inbox-load').addEventListener('click', () => {
    if (!record) return;
    if ((key.value.trim() || answers.value.trim()) && !confirm('将在线标准答案和答卷载入编辑区？当前编辑内容会被替换。')) return;
    loadAnswers();
    document.querySelector('#form').scrollIntoView({block:'start'});
  });
  document.querySelector('#inbox-delete').addEventListener('click', async event => {
    if (!confirm('删除在线收卷和所有已收答卷？学生链接也会失效。')) return;
    const button = event.currentTarget;
    button.disabled = true;
    try {
      await request('DELETE');
      await refresh();
    } catch (error) { status.textContent = error.message; }
    finally { button.disabled = false; }
  });
  void refresh(true);
}
