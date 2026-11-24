import {test,before,after} from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import {database} from '../server/db.js';
import {createApp} from '../server/app.js';
import {runJob,review} from '../server/extraction.js';
import {id,hash} from '../server/security.js';
let db,app,owner,outsider,viewer,editor,family,person,outsiderFamily,outsiderPerson,session;
const origin='http://localhost:3000';
const post=(agent,path,body)=>agent.post('/api'+path).set('Origin',origin).send(body);
const del=(agent,path)=>agent.delete('/api'+path).set('Origin',origin);
const get=(agent,path)=>agent.get('/api'+path);
const base=()=>'/families/'+family;
before(async()=>{db=await database({path:':memory:'});app=createApp(db,{demo:false,origin});owner=request.agent(app);outsider=request.agent(app);viewer=request.agent(app);editor=request.agent(app);
 for(const [agent,n] of [[owner,'Owner'],[outsider,'Other'],[viewer,'Viewer'],[editor,'Cousin']]){const r=await post(agent,'/auth/register',{name:n,email:n.toLowerCase()+'@test.com',password:'a very strong test password'});assert.equal(r.status,200,r.text);}
 family=(await post(owner,'/families',{name:'Family A'})).body.id;person=(await post(owner,base()+'/people',{name:'Biji'})).body.id;
 outsiderFamily=(await post(outsider,'/families',{name:'Family B'})).body.id;outsiderPerson=(await post(outsider,'/families/'+outsiderFamily+'/people',{name:'Biji'})).body.id;
});
after(async()=>{await db.close();});
test('accounts are distinct from person identities; authentication and CSRF',async()=>{
 assert.equal((await get(request(app),'/me')).status,401);
 assert.equal((await owner.post('/api/families').send({name:'No origin'})).status,403);
 const p=(await get(owner,base()+'/people/'+person)).body.person;assert.equal(p.linked_account_id,null);
 const login=await post(request.agent(app),'/auth/login',{email:'owner@test.com',password:'wrong password xxx'});assert.equal(login.status,401);
});
test('tenant isolation for reads, writes, cross-tenant references, export and tree',async()=>{
 for(const path of ['/overview','/members','/export','/tree?root='+person])assert.equal((await get(outsider,base()+path)).status,403,path);
 assert.equal((await post(outsider,base()+'/people',{name:'Injected'})).status,403);
 assert.equal((await get(owner,base()+'/people/'+outsiderPerson)).status,404);
 assert.equal((await post(owner,base()+'/interviews',{person_id:outsiderPerson,title:'Cross tenant',language:'pa',consent:true})).status,404);
});
test('invite acceptance is single-use and editor/viewer roles are enforced',async()=>{
 let r=await post(owner,base()+'/invites',{role:'editor',hours:48});assert.equal(r.status,200,r.text);const raw=new URL(r.body.url).searchParams.get('invite');
 const stored=(await db.q('SELECT token_hash FROM invites WHERE id=$1',[r.body.id])).rows[0];assert.equal(stored.token_hash,hash(raw));assert.notEqual(stored.token_hash,raw);
 assert.equal((await post(editor,'/invites/accept',{token:raw})).status,200);
 assert.equal((await post(viewer,'/invites/accept',{token:raw})).status,410);
 assert.equal((await post(editor,base()+'/people',{name:'Cousin’s relative'})).status,200);
 r=await post(editor,base()+'/invites',{role:'viewer',hours:1});const raw2=new URL(r.body.url).searchParams.get('invite');assert.equal((await post(viewer,'/invites/accept',{token:raw2})).status,200);
 assert.equal((await get(viewer,base()+'/overview')).status,200);assert.equal((await post(viewer,base()+'/people',{name:'Denied'})).status,403);assert.equal((await post(viewer,base()+'/invites',{role:'editor'})).status,403);assert.equal((await get(viewer,base()+'/export')).status,403);
});
test('revoked and expired invitations cannot be accepted',async()=>{
 const r=await post(owner,base()+'/invites',{role:'editor',hours:1});const raw=new URL(r.body.url).searchParams.get('invite');await del(owner,base()+'/invites/'+r.body.id);assert.equal((await post(outsider,'/invites/accept',{token:raw})).status,410);
 const exp=await post(owner,base()+'/invites',{role:'editor',hours:1});await db.q("UPDATE invites SET expires_at=now()-interval '1 second' WHERE id=$1",[exp.body.id]);assert.equal((await post(outsider,'/invites/accept',{token:new URL(exp.body.url).searchParams.get('invite')})).status,410);
});
test('consent is required; original Punjabi text and deduplication persist',async()=>{
 let r=await post(owner,base()+'/interviews',{person_id:person,title:'ਮੇਰੀ ਕਹਾਣੀ',language:'pa',consent:false});assert.equal(r.status,400);
 r=await post(editor,base()+'/interviews',{person_id:person,title:'ਮੇਰੀ ਕਹਾਣੀ',language:'pa',consent:true});assert.equal(r.status,200,r.text);session=r.body.id;
 const text='ਮੇਰੇ ਪਿਤਾ ਜੀ ਦਾ ਨਾਮ ਅਮਰ ਸਿੰਘ ਸੀ।';
 const p=await post(editor,base()+'/interviews/'+session+'/passages',{text,client_id:'same'});assert.equal(p.status,200,p.text);
 const again=await post(editor,base()+'/interviews/'+session+'/passages',{text,client_id:'same'});assert.equal(again.body.id,p.body.id);
 const saved=(await get(owner,base()+'/interviews/'+session)).body;assert.equal(saved.passages.filter(p=>p.speaker==='interviewee').length,1);assert.equal(saved.passages.find(p=>p.speaker==='interviewee').text,text);assert.equal(saved.session.audio_consent,false);
 assert.equal((await post(owner,base()+'/interviews/'+session+'/voice',{})).status,403);
 assert.equal((await get(outsider,base()+'/sources/'+p.body.id)).status,403);
 const audio=await owner.post('/api'+base()+'/interviews/'+session+'/recordings').set('Origin',origin).set('Content-Type','audio/webm').send(Buffer.from('audio'));assert.equal(audio.status,403,audio.text);
});
test('durable extraction keeps exact quote provenance, never silently merges, and is idempotent',async()=>{
 assert.equal((await post(editor,base()+'/interviews/'+session+'/complete',{})).status,200);assert.equal((await post(editor,base()+'/interviews/'+session+'/complete',{})).status,200);
 assert.equal((await post(editor,base()+'/interviews/'+session+'/passages',{text:'late',client_id:'late'})).status,409);
 assert.equal(await runJob(db),true);assert.equal(await runJob(db),false);
 const cs=(await db.q('SELECT * FROM claims WHERE interview_id=$1',[session])).rows;assert.equal(cs.length,1);assert.equal(cs[0].subject_id,null);assert.equal(cs[0].status,'pending');assert.equal(cs[0].certainty,'uncertain');const p=(await db.q('SELECT * FROM passages WHERE id=$1',[cs[0].passage_id])).rows[0];assert.ok(p.text.includes(cs[0].quote));assert.equal(p.language,'pa');
 assert.equal((await post(editor,base()+'/claims/'+cs[0].id+'/review',{action:'accept',subject_id:outsiderPerson})).status,404);
 assert.equal((await post(viewer,base()+'/claims/'+cs[0].id+'/review',{action:'accept',subject_id:person})).status,403);
 const r=await post(editor,base()+'/claims/'+cs[0].id+'/review',{action:'accept',subject_id:person});assert.equal(r.status,200,r.text);
 assert.equal((await post(editor,base()+'/claims/'+cs[0].id+'/review',{action:'accept',subject_id:person})).status,409);
});
async function addClaim({subject='Biji',kind='parent',value='child',predicate='parent',quote,passage,object='Child'}={}){const p=(await db.q("SELECT * FROM passages WHERE interview_id=$1 AND speaker='interviewee' LIMIT 1",[session])).rows[0];const c=id();await db.q("INSERT INTO claims(id,family_id,interview_id,passage_id,quote,kind,subject_name,object_name,predicate,value,certainty) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,'uncertain')",[c,family,session,passage||p.id,quote||p.text,kind,subject,object,predicate,value]);return c;}
test('bounded directional tree queries, accepted edges only, and cycle prevention',async()=>{
 let prev=person;const chain=[person];for(let n=0;n<8;n++){const child=(await post(owner,base()+'/people',{name:'Generation '+n})).body.id;const c=await addClaim({});const r=await post(owner,base()+'/claims/'+c+'/review',{action:'accept',subject_id:prev,object_id:child,acknowledge_conflict:true});assert.equal(r.status,200,r.text);chain.push(child);prev=child;}
 let t=await get(owner,base()+'/tree?root='+person+'&depth=2&direction=descendants');assert.equal(t.status,200,t.text);assert.equal(t.body.nodes.length,3);assert.equal(t.body.edges.length,2);
 t=await get(owner,base()+'/tree?root='+chain[2]+'&depth=1&direction=ancestors');assert.equal(t.body.nodes.length,2);assert.ok(t.body.nodes.some(x=>x.id===chain[1]));assert.ok(!t.body.nodes.some(x=>x.id===chain[3]));
 assert.equal((await get(owner,base()+'/tree?root='+person+'&depth=7')).status,400);
 const cycle=await addClaim({});const r=await post(owner,base()+'/claims/'+cycle+'/review',{action:'accept',subject_id:prev,object_id:person,acknowledge_conflict:true});assert.equal(r.status,409,r.text);
});
test('conflicting accounts require acknowledgement and keep both sources',async()=>{
 const first=await addClaim({kind:'fact',predicate:'birth_year',value:'1920',object:null});assert.equal((await post(owner,base()+'/claims/'+first+'/review',{action:'accept',subject_id:person})).body.status,'accepted');
 const c=await addClaim({kind:'fact',predicate:'birth_year',value:'1919',object:null});let r=await post(owner,base()+'/claims/'+c+'/review',{action:'accept',subject_id:person});assert.equal(r.status,200,r.text);assert.equal(r.body.status,'conflict');r=await post(owner,base()+'/claims/'+c+'/review',{action:'accept',subject_id:person,acknowledge_conflict:true});assert.equal(r.body.status,'accepted');assert.equal((await db.q("SELECT id FROM claims WHERE family_id=$1 AND subject_id=$2 AND predicate='birth_year' AND status='accepted'",[family,person])).rows.length,2);
});
test('search and historian cite only sources from the requesting family; controlled component',async()=>{
 const search=await get(owner,base()+'/search?q='+encodeURIComponent('ਪਿਤਾ'));assert.ok(search.body.length>0,search.text);
 const r=await post(owner,base()+'/historian',{question:'Who is my family?',view:'tree'});assert.equal(r.status,200,r.text);assert.equal(r.body.component.type,'tree');assert.equal(r.body.sources.length,r.body.citations.length);for(const s of r.body.sources)assert.ok((await db.q('SELECT id FROM passages WHERE id=$1 AND family_id=$2',[s.id,family])).rows.length);
 const other=await post(outsider,'/families/'+outsiderFamily+'/historian',{question:'Biji',view:'stories'});assert.equal(other.body.sources.length,0);
});
test('membership removal immediately blocks new requests, owner cannot be removed',async()=>{
 const ms=(await get(owner,base()+'/members')).body;const cousin=ms.find(x=>x.name==='Cousin');assert.equal((await del(owner,base()+'/members/'+cousin.id)).status,200);assert.equal((await get(editor,base()+'/overview')).status,403);
 assert.equal((await del(owner,base()+'/members/'+ms.find(x=>x.role==='owner').id)).status,409);
});
test('export excludes auth credentials and deleting an interview cascades its evidence and graph',async()=>{
 const r=await get(owner,base()+'/export');assert.equal(r.status,200,r.text);assert.ok(r.body.passages.length);assert.equal(r.body.accounts,undefined);assert.ok(!r.text.includes('password_hash'));assert.ok(!r.text.includes('token_hash'));
 assert.equal((await del(owner,base()+'/interviews/'+session)).status,200);assert.equal((await db.q('SELECT * FROM claims WHERE interview_id=$1',[session])).rows.length,0);assert.equal((await db.q('SELECT * FROM edges WHERE family_id=$1',[family])).rows.length,0);
});
test('owner workspace deletion removes its tenant records while preserving another family',async()=>{
 assert.equal((await del(viewer,base())).status,403);assert.equal((await del(owner,base())).status,200);
 assert.equal((await get(owner,base()+'/overview')).status,403);assert.equal((await db.q('SELECT * FROM people WHERE family_id=$1',[family])).rows.length,0);assert.equal((await db.q('SELECT * FROM memberships WHERE family_id=$1',[family])).rows.length,0);
 assert.equal((await get(outsider,'/families/'+outsiderFamily+'/overview')).status,200);
});
