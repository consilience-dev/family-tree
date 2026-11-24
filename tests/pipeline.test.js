import {test} from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import {database} from '../server/db.js';
import {createApp} from '../server/app.js';
import {runJob} from '../server/extraction.js';
import {id} from '../server/security.js';
import {generations} from '../client/tree-layout.js';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
const origin='http://localhost:3000';
async function fixture(){const db=await database({path:':memory:'});const app=createApp(db,{demo:false});const agent=request.agent(app);const post=(path,body)=>agent.post('/api'+path).set('Origin',origin).send(body);await post('/auth/register',{name:'Tester',email:'test@example.com',password:'test password very strong'});const f=(await post('/families',{name:'Fixture'})).body.id;const base='/families/'+f;const person=(await post(base+'/people',{name:'Amar Singh'})).body.id;return {db,app,agent,post,f,base,person};}
test('invalid model provenance rolls back the whole batch and retries durably',async()=>{
 const x=await fixture();const {db,post,base,person}=x;
 const session=(await post(base+'/interviews',{title:'Original',language:'en',consent:true,person_id:person})).body.id;const passage=(await post(base+'/interviews/'+session+'/passages',{text:'I remember a neem tree.',client_id:'one'})).body.id;await post(base+'/interviews/'+session+'/complete',{});
 const originalFetch=globalThis.fetch;process.env.OPENAI_API_KEY='test-placeholder';
 globalThis.fetch=async()=>new Response(JSON.stringify({output:[{content:[{type:'output_text',text:JSON.stringify({claims:[{kind:'fact',subject_name:'Amar Singh',object_name:null,predicate:'memory',value:'A neem tree',certainty:'stated',passage_id:passage,quote:'I remember a neem tree.'},{kind:'fact',subject_name:'Amar Singh',object_name:null,predicate:'birth',value:'1900',certainty:'stated',passage_id:passage,quote:'I was born in 1900.'}]})}]}]}),{status:200});
 try{for(let n=0;n<3;n++){await db.q('UPDATE jobs SET available_at=now()');assert.equal(await runJob(db),true);}const job=(await db.q('SELECT * FROM jobs')).rows[0];assert.equal(job.status,'failed');assert.equal(job.attempts,3);assert.match(job.error,/quote does not match/);assert.equal((await db.q('SELECT * FROM claims')).rows.length,0);assert.equal((await post(base+'/interviews/'+session+'/retry',{})).status,200);assert.equal((await db.q('SELECT attempts FROM jobs')).rows[0].attempts,0);}finally{globalThis.fetch=originalFetch;delete process.env.OPENAI_API_KEY;await db.close();}
});
test('audio requires separate consent, is tenant protected, and is deleted on withdrawal',async()=>{
 const {db,app,agent,post,base,person}=await fixture();try{
 const session=(await post(base+'/interviews',{title:'Consented',language:'en',consent:true,audio_consent:true,person_id:person})).body.id;
 const r=await agent.post('/api'+base+'/interviews/'+session+'/recordings').set('Origin',origin).set('Content-Type','audio/webm').send(Buffer.from('synthetic test audio'));assert.equal(r.status,200,r.text);
 assert.equal((await agent.get('/api'+base+'/recordings/'+r.body.id)).status,200);assert.equal((await request(app).get('/api'+base+'/recordings/'+r.body.id)).status,401);
 assert.equal((await agent.delete('/api'+base+'/interviews/'+session+'/audio').set('Origin',origin)).status,200);assert.equal((await agent.get('/api'+base+'/recordings/'+r.body.id)).status,404);
 assert.equal((await agent.post('/api'+base+'/interviews/'+session+'/recordings').set('Origin',origin).set('Content-Type','audio/webm').send(Buffer.from('more'))).status,403);
 }finally{await db.close();}
});
test('accepted aliases retain provenance and disappear when their source is deleted',async()=>{
 const {db,agent,post,base,f,person}=await fixture();try{
 const i=(await post(base+'/interviews',{title:'Names',language:'en',consent:true,person_id:person})).body.id;const p=(await post(base+'/interviews/'+i+'/passages',{text:'They call me Bapu.',client_id:'one'})).body.id;const c=id();await db.q("INSERT INTO claims(id,family_id,interview_id,passage_id,quote,kind,subject_name,predicate,value,certainty) VALUES($1,$2,$3,$4,'They call me Bapu.','alias','Amar Singh','alias','Bapu','stated')",[c,f,i,p]);assert.equal((await post(base+'/claims/'+c+'/review',{action:'accept',subject_id:person})).body.status,'accepted');let profile=(await agent.get('/api'+base+'/people/'+person)).body;assert.ok(profile.person.aliases.includes('Bapu'));
 await agent.delete('/api'+base+'/interviews/'+i).set('Origin',origin);profile=(await agent.get('/api'+base+'/people/'+person)).body;assert.ok(!profile.person.aliases.includes('Bapu'));assert.equal((await db.q('SELECT * FROM person_aliases')).rows.length,0);
 }finally{await db.close();}
});
test('durable local PostgreSQL survives close and reopen',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'family-tree-db-'));try{let db=await database({path:dir});const f=id();await db.q('INSERT INTO families(id,name) VALUES($1,$2)',[f,'Persistent family']);await db.close();db=await database({path:dir});assert.equal((await db.q('SELECT name FROM families WHERE id=$1',[f])).rows[0].name,'Persistent family');await db.close();}finally{await rm(dir,{recursive:true,force:true});}
});
test('tree presentation keeps partners in the same visual generation',()=>{
 const nodes=['grandma','grandpa','parent','partner','child'].map(id=>({id}));const edges=[['grandma','grandpa','partner'],['grandma','parent','parent'],['parent','partner','partner'],['parent','child','parent']].map(([source_id,target_id,kind])=>({source_id,target_id,kind}));const levels=generations(nodes,edges);assert.equal(levels.grandma,levels.grandpa);assert.equal(levels.parent,levels.partner);assert.equal(levels.parent,levels.grandma+1);assert.equal(levels.child,levels.parent+1);
});
test('historian rejects model citations outside the retrieved evidence set',async()=>{
 const {db,post,base,person}=await fixture();const originalFetch=globalThis.fetch;
 try{const i=(await post(base+'/interviews',{title:'Evidence',language:'en',consent:true,person_id:person})).body.id;await post(base+'/interviews/'+i+'/passages',{text:'We lived in Amritsar.',client_id:'one'});process.env.OPENAI_API_KEY='test-placeholder';globalThis.fetch=async()=>new Response(JSON.stringify({status:'completed',output:[{content:[{type:'output_text',text:JSON.stringify({answer:'An unsupported answer',citations:[id()]})}]}]}),{status:200});
 const r=await post(base+'/historian',{question:'Where did we live?',view:'stories'});assert.equal(r.status,502,r.text);assert.match(r.body.error,/invalid source/);
 }finally{globalThis.fetch=originalFetch;delete process.env.OPENAI_API_KEY;await db.close();}
});

test('a sister accepts her own profile and hosts her mother-in-law in the same family',async()=>{
 const {db,app,agent,post,base,person}=await fixture();
 const sister=request.agent(app);
 const send=(path,body)=>sister.post('/api'+path).set('Origin',origin).send(body);
 try{
  await post(base+'/my-profile',{person_id:person}).expect(200);
  const relative=(await post(base+'/people',{name:'Simran Gill',birth_name:'Simran Kaur'}).expect(200)).body;
  const invite=(await post(base+'/invites',{person_id:relative.id,relationship:'sibling',role:'editor'}).expect(200)).body;
  const token=new URL(invite.url).searchParams.get('invite');
  await send('/auth/register',{name:'Simran',email:'sister@example.com',password:'another strong password'}).expect(200);
  assert.equal((await send('/invites/preview',{token}).expect(200)).body.person_name,'Simran Gill');
  await send(base+'/people',{name:'Another person'}).expect(403);
  await send('/invites/accept',{token}).expect(400);
  await send('/invites/accept',{token,confirmed_person:person}).expect(400);
  await send('/invites/accept',{token,confirmed_person:relative.id}).expect(200);
  await send('/invites/accept',{token,confirmed_person:relative.id}).expect(410);
  await sister.patch('/api'+base+'/people/'+relative.id+'/names').set('Origin',origin).send({name:'Simran Mann',birth_name:'Simran Kaur'}).expect(200);
  const narrator=(await send(base+'/people',{name:'Jasbir Mann'}).expect(200)).body;
  const interview=(await send(base+'/interviews',{person_id:narrator.id,title:'Jasbir’s story',language:'pa',consent:true,relationship:'mother-in-law'}).expect(200)).body;
  assert.equal(interview.interviewer_person_id,relative.id);
  const saved=(await agent.get('/api'+base+'/interviews/'+interview.id).expect(200)).body.session;
  assert.deepEqual([saved.interviewer_name,saved.person_name],['Simran Mann','Jasbir Mann']);
  const overview=(await agent.get('/api'+base+'/overview').expect(200)).body;
  const simran=overview.people.find(p=>p.id===relative.id);
  assert.deepEqual(simran.former_names,['Simran Gill']);assert.equal(simran.birth_name,'Simran Kaur');
  assert.equal(narrator.linked_account_id,null);
  const tree=(await agent.get('/api'+base+'/tree').query({root:person,depth:2}).expect(200)).body;
  assert.deepEqual(tree.edges.map(e=>e.kind).sort(),['mother-in-law','sibling']);
  const ancestors=(await agent.get('/api'+base+'/tree').query({root:relative.id,depth:2,direction:'ancestors'})).body;
  assert.equal(ancestors.nodes.length,1);
  const self=(await send(base+'/interviews',{person_id:relative.id,title:'My story',language:'en',consent:true}).expect(200)).body;
  assert.equal(self.person_id,self.interviewer_person_id);
 }finally{await db.close();}
});

test('guided Punjabi questions resume, accept prepared questions and preserve short-answer evidence',async()=>{
 const {db,agent,post,base,person}=await fixture();
 const originalFetch=globalThis.fetch;
 try{
  const prepared='ਤੁਹਾਡੇ ਘਰ ਦਾ ਕੀ ਨਾਮ ਸੀ?';
  const session=(await post(base+'/interviews',{person_id:person,title:'Places',language:'pa',consent:true,prepared_questions:[prepared]}).expect(200)).body;
  const path=base+'/interviews/'+session.id;
  const load=async()=>(await agent.get('/api'+path).expect(200)).body;
  const first=(await load()).passages[0];
  assert.equal(first.text,'ਤੁਹਾਡਾ ਜਨਮ ਕਿੱਥੇ ਹੋਇਆ ਸੀ?');
  const answer=(await post(path+'/passages',{text:'ਅੰਮ੍ਰਿਤਸਰ',client_id:'birthplace'}).expect(200)).body;
  assert.equal(answer.question_id,first.id);
  const source=(await agent.get('/api'+base+'/sources/'+answer.id).expect(200)).body;
  assert.equal(source.question.text,first.text);
  process.env.OPENAI_API_KEY='test-placeholder';
  const probe='ਅੰਮ੍ਰਿਤਸਰ ਦੇ ਕਿਸ ਇਲਾਕੇ ਵਿੱਚ?';
  globalThis.fetch=async(_url,init)=>{
   const input=JSON.parse(JSON.parse(init.body).input);
   assert.equal(input.topic,'Birthplace');assert.equal(input.passages.at(-1).text,answer.text);
   return Response.json({output:[{content:[{type:'output_text',text:probe}]}]});
  };
  assert.equal((await post(path+'/followup',{action:'deepen'}).expect(200)).body.text,probe);
  delete process.env.OPENAI_API_KEY;
  assert.equal((await post(path+'/followup',{}).expect(200)).body.topic,1);
  assert.equal((await post(path+'/followup',{action:'skip'}).expect(200)).body.topic,2);
  assert.equal((await post(path+'/followup',{action:'jump',target:6}).expect(200)).body.text,prepared);
  await post(path+'/followup',{action:'jump',target:7}).expect(400);
  const custom='ਉੱਥੇ ਹੋਰ ਕੌਣ ਸੀ?';
  await post(path+'/followup',{action:'custom',question:custom}).expect(200);
  let transcript=await load();
  assert.equal(transcript.passages.at(-1).text,custom);assert.equal(transcript.session.guide_topic,6);
  await post(path+'/followup',{action:'skip'}).expect(200);
  assert.equal((await post(path+'/followup',{}).expect(200)).body.text,null);
  await post(path+'/complete',{}).expect(200);
  process.env.OPENAI_API_KEY='test-placeholder';
  globalThis.fetch=async(_url,init)=>{
   const input=JSON.parse(JSON.parse(init.body).input);
   assert.equal(input.passages.find(p=>p.id===answer.id).question_id,first.id);
   const claims=[{kind:'fact',subject_name:'Amar Singh',object_name:null,predicate:'birth_place',value:answer.text,certainty:'stated',passage_id:answer.id,quote:answer.text}];
   return Response.json({output:[{content:[{type:'output_text',text:JSON.stringify({claims})}]}]});
  };
  await runJob(db);
  const claim=(await db.q('SELECT * FROM claims')).rows[0];
  assert.deepEqual([claim.status,claim.predicate,claim.passage_id],['pending','birth_place',answer.id]);
 }finally{globalThis.fetch=originalFetch;delete process.env.OPENAI_API_KEY;await db.close();}
});
