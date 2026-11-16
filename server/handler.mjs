import {keyIds} from '../dist/import.js';

const signin = path => '/signin-with-chatgpt?return_to=' + encodeURIComponent(path);
const signout = '/signout-with-chatgpt?return_to=%2F';
const account = href => '<a class="button" href="' + href + '" target="_top">退出登录</a>';
const collectionCode = /^[a-f0-9]{32}$/;
const types = {html:'text/html; charset=utf-8', js:'text/javascript; charset=utf-8',
  mjs:'text/javascript; charset=utf-8', css:'text/css; charset=utf-8'};

const noStore = {'cache-control':'no-store', 'x-content-type-options':'nosniff',
  'referrer-policy':'no-referrer'};
const html = (body, status = 200) => new Response(body, {status,
  headers:{...noStore, 'content-type':types.html, 'content-security-policy':
    "default-src 'self'; object-src 'none'; base-uri 'none'; form-action 'self'; img-src 'self' data:"}});
const json = (value, status = 200) => new Response(JSON.stringify(value), {
  status, headers:{...noStore, 'content-type':'application/json; charset=utf-8'}});
const problem = (error, status) => json({error}, status);
const redirect = location => new Response(null, {status:302, headers:{...noStore, location}});

function page(content) {
  return '<!doctype html><html lang="zh-CN"><meta charset="utf-8">' +
    '<meta name="viewport" content="width=device-width,initial-scale=1">' +
    '<title>阅卷台</title><link rel="stylesheet" href="/style.css"><main>' +
    content + '</main></html>';
}

async function readJson(request) {
  if (!request.body || !request.headers.get('content-type')?.startsWith('application/json')) {
    throw new Error('请求格式无效。');
  }
  const reader = request.body.getReader();
  const decoder = new TextDecoder();
  let text = '', size = 0;
  for (;;) {
    const {done, value} = await reader.read();
    if (done) break;
    size += value.length;
    if (size > 180_000) {
      await reader.cancel();
      throw new Error('提交内容超出大小限制。');
    }
    text += decoder.decode(value, {stream:true});
  }
  const value = JSON.parse(text + decoder.decode());
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('请求格式无效。');
  return value;
}

function query(db, sql, ...args) {
  return db.prepare(sql).bind(...args);
}

async function inbox(request, db, user) {
  if (request.method === 'DELETE') {
    const result = await query(db, 'DELETE FROM collections WHERE owner=?', user).run();
    return result.meta.changes ? new Response(null, {status:204, headers:noStore}) : problem('当前没有收卷。', 404);
  }
  if (request.method === 'POST') {
    let title, key, questions;
    try {
      ({title, key} = await readJson(request));
      title = typeof title === 'string' ? title.trim() : '';
      if (!title || title.length > 80 || typeof key !== 'string' || key.length > 32_000) {
        throw new Error('请输入 1–80 字的试卷名称，并导入有效的标准答案。');
      }
      questions = keyIds(key);
      if (questions.length > 120) throw new Error('在线收卷最多支持 120 道题。');
    } catch (error) { return problem(error.message, 400); }
    const code = crypto.randomUUID().replaceAll('-', '');
    const inserted = await query(db,
      'INSERT INTO collections(code,owner,title,answer_key,questions,created_at) VALUES(?,?,?,?,?,?) ON CONFLICT(owner) DO NOTHING',
      code, user, title, key, JSON.stringify(questions), Date.now()).run();
    return inserted.meta.changes ? json({code}, 201) : problem('请先处理当前收卷，或删除后再新建。', 409);
  }
  if (request.method !== 'GET') return problem('不支持该请求方法。', 405);
  const collection = await query(db,
    'SELECT code,title,answer_key AS key,questions FROM collections WHERE owner=?', user).first();
  if (!collection) return problem('当前没有收卷。', 404);
  const {results} = await query(db,
    'SELECT name,answers,submitted_at AS submittedAt FROM submissions WHERE code=? ORDER BY submitted_at,author',
    collection.code).all();
  return json({...collection, questions:JSON.parse(collection.questions),
    submissions:results.map(item => ({...item, answers:JSON.parse(item.answers)}))});
}

async function submissions(request, db, code, user) {
  const collection = await query(db, 'SELECT title,questions FROM collections WHERE code=?', code).first();
  if (!collection) return problem('收卷链接已失效。', 404);
  const questions = JSON.parse(collection.questions);
  if (request.method === 'GET') return json({title:collection.title, questions});
  if (request.method !== 'POST') return problem('不支持该请求方法。', 405);
  let name, answers;
  try {
    ({name,answers} = await readJson(request));
    if (typeof name !== 'string' || !name.trim() || name.trim().length > 80 ||
        !Array.isArray(answers) || answers.length !== questions.length ||
        answers.some(answer => typeof answer !== 'string' || answer.length > 500)) {
      throw new Error('请填写姓名并检查题数。每题作答最多 500 字。');
    }
  } catch (error) { return problem(error.message, 400); }
  // One editable submission per signed-in account. The cap is checked inside the write.
  const saved = await query(db,
    'INSERT INTO submissions(code,author,name,answers,submitted_at) ' +
    'SELECT code,?,?,?,? FROM collections WHERE code=? AND ' +
    '((SELECT COUNT(*) FROM submissions WHERE code=?)<300 OR EXISTS(SELECT 1 FROM submissions WHERE code=? AND author=?)) ' +
    'ON CONFLICT(code,author) DO UPDATE SET name=excluded.name,answers=excluded.answers,submitted_at=excluded.submitted_at',
    user, name.trim(), JSON.stringify(answers), Date.now(), code, code, code, user).run();
  return saved.meta.changes ? json({saved:true}, 201) : problem('收卷已关闭或已达到 300 份。', 409);
}

export function createHandler(assets) {
  return async (request, env = {}) => {
    const url = new URL(request.url);
    const path = url.pathname;
    const user = request.headers.get('oai-authenticated-user-email') &&
                 request.headers.get('oai-authenticated-user-id');
    const code = path.split('/').filter(Boolean).at(-1);
    const isStudentPage = /^\/collect\/[a-f0-9]{32}\/?$/.test(path);
    if (path.startsWith('/api/')) {
      if (!user) return problem('请先登录。', 401);
      if (request.method !== 'GET' && request.headers.get('origin') !== url.origin) {
        return problem('请从本站提交。', 403);
      }
      if (!env.DB) return problem('在线收卷暂不可用。', 503);
      try {
        if (path === '/api/inbox') return await inbox(request, env.DB, user);
        if (path === '/api/collect/' + code && collectionCode.test(code)) {
          return await submissions(request, env.DB, code, user);
        }
      } catch {
        return problem('暂时无法处理请求，请稍后重试。', 503);
      }
      return problem('找不到页面。', 404);
    }
    if (!['GET','HEAD'].includes(request.method)) return new Response(null, {status:405});
    if (path === '/') {
      if (user) return redirect('/grade/');
      return html(page('<section class="intro landing"><p class="brand">阅卷台</p>' +
        '<h1>登录后开始阅卷</h1><p>在线收卷，导入文件，批改电子答卷并导出成绩。</p>' +
        '<a class="button primary" target="_top" href="' + signin('/grade/') + '">使用 ChatGPT 账号登录</a></section>'));
    }
    if (path === '/grade') return redirect('/grade/');
    if (path === '/grade/') {
      if (!user) return redirect(signin('/grade/'));
      return html(assets['/index.html'].replace('<!-- ACCOUNT -->', account(signout)));
    }
    if (isStudentPage) {
      if (!user) {
        return html(page('<h1>提交学生答卷</h1><p>登录后按题号填写答案，同一账号可以重新提交。</p>' +
          '<a class="button primary" target="_top" href="' + signin('/collect/' + code) + '">使用 ChatGPT 账号登录</a>'));
      }
      return html(page('<p class="brand">阅卷台 · 学生答卷</p><h1 id="collection-title">正在加载试卷</h1>' +
        '<p>姓名和作答将提交给老师。重新提交会替换本账号的上次答卷。</p>' +
        '<form id="student-form" class="panel" hidden><label>姓名<input id="student-name" required maxlength="80"></label>' +
        '<div id="student-questions"></div><button class="primary">提交答卷</button></form>' +
        '<p id="student-status" role="status"></p>' + account(signout) +
        '<script type="module" src="/student.js"></script>'));
    }
    const file = path.startsWith('/grade/') ? path.slice(6) : path;
    if (file === '/index.html' || !Object.hasOwn(assets, file)) return html(page('<h1>找不到页面</h1><a href="/">返回阅卷台</a>'),404);
    const data = assets[file];
    return new Response(request.method === 'HEAD' ? null : typeof data === 'string' ? data : Uint8Array.from(atob(data.base64), char => char.charCodeAt(0)), {
      headers:{'content-type':types[file.split('.').at(-1)] ?? 'application/octet-stream',
        'x-content-type-options':'nosniff','cache-control':file.startsWith('/vendor/') ? 'public, max-age=3600' : 'no-cache'},
    });
  };
}
