const form = document.querySelector('#student-form');
const status = document.querySelector('#student-status');
const endpoint = '/api' + location.pathname.replace(/\/$/, '');

async function result(response) {
  const body = await response.json();
  if (!response.ok) throw new Error(body.error || '请求未完成。');
  return body;
}

try {
  const {title, questions} = await result(await fetch(endpoint));
  document.querySelector('#collection-title').textContent = title;
  const fields = questions.map(id => {
    const label = document.createElement('label');
    label.textContent = '第 ' + id + ' 题';
    const input = document.createElement('textarea');
    input.rows = 2;
    input.maxLength = 500;
    label.append(input);
    document.querySelector('#student-questions').append(label);
    return input;
  });
  form.hidden = false;
  form.addEventListener('submit', async event => {
    event.preventDefault();
    const button = form.querySelector('button');
    button.disabled = true;
    status.textContent = '正在提交…';
    try {
      await result(await fetch(endpoint, {method:'POST', headers:{'content-type':'application/json'},
        body:JSON.stringify({name:document.querySelector('#student-name').value,
          answers:fields.map(field => field.value)})}));
      status.textContent = '已提交。老师可以看到你的答卷。';
    } catch (error) {
      status.textContent = error.message;
    } finally {
      button.disabled = false;
    }
  });
} catch (error) {
  document.querySelector('#collection-title').textContent = '暂时无法打开试卷';
  status.textContent = error.message;
}
