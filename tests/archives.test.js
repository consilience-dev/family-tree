import test from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import {createApp} from '../server/app.js';
import {database} from '../server/db.js';

const origin='http://localhost:3000';
const post=(agent,path,body)=>agent.post('/api'+path).set('Origin',origin).send(body);
const del=(agent,path)=>agent.delete('/api'+path).set('Origin',origin);
const get=(agent,path)=>agent.get('/api'+path);
async function account(app,name){
 const agent=request.agent(app);
 await post(agent,'/auth/register',{name,email:name+'@example.test',password:'fictional test password'}).expect(200);
 return agent;
}
async function addFamily(a,name){return '/families/'+(await post(a,'/families',{name}).expect(200)).body.id;}
async function addPerson(a,path,name){return (await post(a,path+'/people',{name}).expect(200)).body.id;}
async function join(owner,recipient,path,role){
 const r=await post(owner,path+'/invites',{role}).expect(200);
 const token=new URL(r.body.url).searchParams.get('invite');
 await post(recipient,'/invites/accept',{token}).expect(200);
}
async function openLink(owner,guest,path,body){
 const {id,url}=(await post(owner,path+'/guest-links',body).expect(200)).body;
 const token=new URL(url).hash.split('.')[1], guestPath='/guest/'+id;
 await post(guest,guestPath+'/open',{token}).expect(200);
 return {id,token,guestPath};
}

test('archives connect through explicitly confirmed people, only visible with access to both',async()=>{
 const db=await database({path:':memory:'});try{
  const app=createApp(db),a=await account(app,'Host'),b=await account(app,'Cousin'),c=await account(app,'Reader');
  const first=await addFamily(a,'Biji’s archive'),second=await addFamily(b,'Cousin’s archive');
  const left=await addPerson(a,first,'Biji'),right=await addPerson(b,second,'Biji');
  const link={person_id:left,other_family:second.split('/').at(-1),other_person:right};
  await post(a,first+'/connections',link).expect(403);
  await join(b,a,second,'editor');await join(a,c,first,'editor');
  assert.equal((await get(a,first+'/connections')).body.length,0);
  const result=(await post(a,first+'/connections',link).expect(200)).body;
  assert.equal((await post(a,second+'/connections',{person_id:right,other_family:first.split('/').at(-1),other_person:left}).expect(200)).body.id,result.id);
  assert.equal((await get(a,first+'/connections')).body[0].other_name,'Biji');
  assert.equal((await get(a,second+'/connections')).body[0].other_person,left);
  assert.deepEqual((await get(c,first+'/connections')).body,[]);
  assert.equal((await get(c,first+'/overview')).text.includes('Cousin’s archive'),false);
  await get(c,second+'/people-options').expect(403);
  const duplicate=await addPerson(b,second,'Another Biji');
  await post(a,first+'/connections',{...link,other_person:duplicate}).expect(409);
  await join(b,c,second,'viewer');
  assert.equal((await get(c,first+'/connections')).body.length,1);
  await del(c,first+'/connections/'+result.id).expect(403);
  await del(a,first+'/connections/'+result.id).expect(200);
  assert.deepEqual((await get(a,second+'/connections')).body,[]);
  await post(a,first+'/connections',link).expect(200);
  const third=await addFamily(a,'Another branch');
  const add={person_id:left,other_family:third.split('/').at(-1),create_profile:true};
  const created=(await post(a,first+'/connections',add).expect(200)).body;
  assert.equal((await post(a,first+'/connections',add).expect(200)).body.id,created.id);
  const thirdPeople=(await get(a,third+'/people-options')).body;
  assert.equal(thirdPeople.length,1);assert.equal(thirdPeople[0].name,'Biji');
  await del(a,first+'/connections/'+created.id).expect(200);
  const accountId=(await get(a,'/me')).body.user.id;
  await del(b,second+'/members/'+accountId).expect(200);
  assert.deepEqual((await get(a,first+'/connections')).body,[]);
 }finally{await db.close();}
});

test('one guest answers one interview and a separate story link follows the original across archives',async()=>{
 const db=await database({path:':memory:'});try{
  const app=createApp(db),host=await account(app,'Sender'),cousin=await account(app,'Collector'),guest=request.agent(app),other=request.agent(app);
  const first=(await post(host,'/first-story',{name:'Jasbir'}).expect(200)).body;
  await post(host,'/first-story',{name:'duplicate'}).expect(409);
  const base='/families/'+first.family,otherArchive=await addFamily(cousin,'Other archive');
  const {id,token,guestPath}=await openLink(host,guest,base,{kind:'interview',person_id:first.person});
  const welcome=(await get(guest,guestPath).expect(200)).body;
  assert.equal(welcome.name,'Jasbir');assert.equal(welcome.started,false);
  await get(guest,base+'/overview').expect(401);
  await get(guest,guestPath+'/interview').expect(410);
  await post(guest,guestPath+'/start',{consent:false}).expect(400);
  const consent={consent:true,voice_consent:false,audio_consent:false,language:'pa'};
  await post(guest,guestPath+'/start',consent).expect(200);
  await post(guest,guestPath+'/start',consent).expect(200);
  await post(other,guestPath+'/open',{token}).expect(403);
  const session=(await get(guest,guestPath+'/interview').expect(200)).body.session;
  assert.ok(session.guest_consent);assert.equal(session.consent_by,null);
  await post(guest,guestPath+'/interview/passages',{text:'ਮੇਰਾ ਘਰ ਪੰਜਾਬ ਵਿੱਚ ਸੀ।',client_id:'original'}).expect(200);
  await post(guest,guestPath+'/interview/followup',{action:'next'}).expect(200);
  await post(guest,guestPath+'/interview/voice',{}).expect(403);
  await del(guest,guestPath+'/interview').expect(404);
  await post(guest,guestPath+'/interview/complete',{}).expect(200);
  await post(host,base+'/guest-links',{kind:'story',interview_id:session.id}).expect(400);
  const story=await openLink(host,cousin,base,{kind:'story',interview_id:session.id,permission:true});
  const shared=(await get(cousin,story.guestPath).expect(200)).body.story;
  assert.equal(shared.name,'Jasbir');assert.equal(shared.passages[1].text,'ਮੇਰਾ ਘਰ ਪੰਜਾਬ ਵਿੱਚ ਸੀ।');
  await post(cousin,story.guestPath+'/start',consent).expect(410);
  await get(cousin,base+'/overview').expect(403);
  await post(cousin,story.guestPath+'/save',{family_id:otherArchive.split('/').at(-1)}).expect(200);
  assert.deepEqual((await get(cousin,otherArchive+'/saved-stories/'+story.id).expect(200)).body,shared);
  const archive=(await get(cousin,otherArchive+'/export')).body;assert.deepEqual(archive.passages,[]);
  await del(host,base+'/guest-links/'+story.id).expect(200);
  await get(cousin,otherArchive+'/saved-stories/'+story.id).expect(410);
  await get(cousin,story.guestPath).expect(410);
  await db.q("UPDATE guest_links SET expires_at=now()-interval '1 second' WHERE id=$1",[id]);
  await get(guest,guestPath+'/interview').expect(410);
 }finally{await db.close();}
});

test('sharing a transcript keeps its audio private unless separately approved and withdrawal ends playback',async()=>{
 const db=await database({path:':memory:'});try{
  const app=createApp(db),host=await account(app,'Recorder'),guest=request.agent(app);
  const base=await addFamily(host,'Family'),person=await addPerson(host,base,'Biji');
  const i=(await post(host,base+'/interviews',{person_id:person,title:'A memory',consent:true,audio_consent:true,language:'pa'}).expect(200)).body;
  const path=base+'/interviews/'+i.id;
  const clip=(await host.post('/api'+path+'/recordings').set('Origin',origin).set('Content-Type','audio/webm').send(Buffer.from('synthetic clip')).expect(200)).body.id;
  await post(host,path+'/complete',{}).expect(200);
  const read=async audio=>(await openLink(host,guest,base,{kind:'story',permission:true,interview_id:i.id,share_audio:audio})).guestPath;
  const transcript=await read(false);
  assert.deepEqual((await get(guest,transcript)).body.story.recordings,[]);
  await get(guest,transcript+'/recordings/'+clip).expect(404);
  const withAudio=await read(true);
  await get(guest,withAudio+'/recordings/'+clip).expect(200);
  await del(host,path+'/audio').expect(200);
  await get(guest,withAudio+'/recordings/'+clip).expect(404);
  await del(host,path).expect(200);await get(guest,withAudio).expect(410);
 }finally{await db.close();}
});
