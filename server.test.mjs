import assert from 'node:assert/strict';
import test from 'node:test';
import {createHandler} from './server/handler.mjs';

const handle = createHandler({ '/index.html': 'grade workspace<!-- ACCOUNT -->', '/app.js': 'export {};'});
const site = 'https://grade.example';
test('anonymous visitors see sign-in and cannot reach the workbench', async () => {
  const landing = await handle(new Request(site));
  assert.match(await landing.text(), /signin-with-chatgpt\?return_to=%2Fgrade%2F/);
  for (const path of ['/grade/', '/index.html', '/grade/index.html']) {
    const response = await handle(new Request(site + path));
    assert.notEqual(await response.text(), 'grade workspace');
    assert.equal(response.headers.get('cache-control'), 'no-store');
  }
});
test('hosted identity unlocks the workbench and supplies a sign-out link', async () => {
  const response = await handle(new Request(site + '/grade/', {headers:{
    'oai-authenticated-user-id':'fictional-id',
    'oai-authenticated-user-email':'private@example.invalid',
  }}));
  assert.equal(response.status, 200);
  const body = await response.text();
  assert.match(body, /grade workspace/);
  assert.match(body, /signout-with-chatgpt/);
  assert.doesNotMatch(body, /private@example|fictional-id/);
});
import {DatabaseSync} from 'node:sqlite';
import {readFileSync} from 'node:fs';

test('isolates inbox records by teacher and publishes only question numbers to students', async () => {
  const db = new DatabaseSync(':memory:');
  db.exec(readFileSync(new URL('./drizzle/0000_collections.sql', import.meta.url),'utf8'));
  const env = {DB:{prepare(sql) {
    return {bind(...args) {
      const statement = db.prepare(sql);
      return {
        first: async () => statement.get(...args),
        all: async () => ({results:statement.all(...args)}),
        run: async () => ({meta:statement.run(...args)}),
      };
    }};
  }}};
  const request = (path, id, method = 'GET', body) => handle(new Request(site + path, {
    method,
    headers:{
      'oai-authenticated-user-id':id, 'oai-authenticated-user-email':'test@example.invalid',
      origin:site, 'content-type':'application/json',
    },
    body:body ? JSON.stringify(body) : undefined,
  }), env);
  const key = '题号,题型,答案,分值\n1,单选,B,2';
  const created = await request('/api/inbox','teacher-a','POST',{title:'课堂小测',key:key.replace('\\n','\n')});
  assert.equal(created.status,201);
  const {code} = await created.json();
  const publicQuestion = await request('/api/collect/'+code,'student-a');
  assert.deepEqual(await publicQuestion.json(),{title:'课堂小测',questions:['1']});
  assert.equal((await request('/api/collect/'+code,'student-a','POST',{name:'学生甲',answers:['B']})).status,201);
  assert.equal((await request('/api/inbox','teacher-b')).status,404);
  assert.equal((await request('/api/inbox','teacher-b','DELETE')).status,404);
  const teacherInbox = await (await request('/api/inbox','teacher-a')).json();
  assert.deepEqual(teacherInbox.submissions.map(({name,answers}) => ({name,answers})), [{name:'学生甲',answers:['B']}]);
  assert.equal((await request('/api/inbox','teacher-a','DELETE')).status,204);
  assert.equal((await request('/api/collect/'+code,'student-a')).status,404);
  db.close();
});
