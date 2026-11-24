import express from 'express';
import {z} from 'zod';
import {token,hash,id,member,within,fail} from './security.js';
import {startInterview} from './guided-interviews.js';
import * as storage from './storage.js';

const uuid=z.string().uuid(), secret=z.string().regex(/^[\w-]{43}$/);
const editors=['owner','editor'];
const active=`SELECT l.* FROM guest_links l JOIN memberships m ON m.family_id=l.family_id AND m.account_id=l.created_by
 WHERE m.role IN ('editor','owner') AND l.id=$1 AND l.revoked_at IS NULL AND l.expires_at>now()`;
function unavailable(){fail(410,'This link is unavailable. Ask the sender for a new link.');}
function cookie(req){return (req.headers.cookie||'').split(';').map(v=>v.trim()).find(v=>v.startsWith('ft_guest='))?.slice(9).split('.')||[];}
function checkBrowser(link,nonce){
 if(link.browser_hash && (!nonce || hash(nonce)!==link.browser_hash))fail(403,'This interview has already been opened on another browser.');
}
async function authorized(q,req,lock=false){
 const [raw,nonce]=cookie(req);
 const link=(await q(active+' AND l.token_hash=$2'+(lock?' FOR UPDATE OF l':''),[req.guestId,hash(raw||'')])).rows[0];
 if(!link)unavailable();
 checkBrowser(link,nonce);
 return link;
}
export async function guestWrite(req,q){
 const link=await authorized(q,req);
 if(link.kind!=='interview'||!link.browser_hash||link.interview_id!==req.params.interview)unavailable();
}
async function story(q,link){
 const result=(await q(`SELECT i.title,i.language,p.name FROM interviews i JOIN people p ON p.id=i.person_id
 WHERE i.family_id=$1 AND i.id=$2 AND i.status='complete'`,[link.family_id,link.interview_id])).rows[0];
 if(!result)unavailable();
 result.passages=(await q('SELECT speaker,text FROM passages WHERE family_id=$1 AND interview_id=$2 ORDER BY created_at,id',[link.family_id,link.interview_id])).rows;
 result.recordings=link.share_audio?(await q('SELECT r.id FROM recordings r JOIN interviews i ON i.id=r.interview_id WHERE i.audio_consent AND r.family_id=$1 AND r.interview_id=$2',[link.family_id,link.interview_id])).rows:[];
 return result;
}
async function play(q,link,key,res){
 const clip=(await q(`SELECT r.object_key,r.mime FROM recordings r JOIN interviews i ON i.id=r.interview_id
 WHERE r.family_id=$1 AND r.interview_id=$2 AND r.id=$3 AND i.audio_consent`,[link.family_id,link.interview_id,uuid.parse(key)])).rows[0];
 if(!clip||(link.kind==='story'&&!link.share_audio))fail(404,'Recording unavailable.');
 res.type(clip.mime).send(await storage.get(clip.object_key));
}

export function registerGuestLinks(app,db,base,origin){
 const guest=express.Router({mergeParams:true});
 app.use('/api/guest/:link',guest);
 guest.use((req,_res,next)=>{req.guestId=uuid.parse(req.params.link);next();});
 guest.post('/open',async(req,res)=>{
  const raw=secret.parse(req.body.token), link=(await db.q(active+' AND l.token_hash=$2',[req.guestId,hash(raw)])).rows[0];
  if(!link)unavailable();
  const [old,nonce]=cookie(req);
  checkBrowser(link,old===raw?nonce:null);
  res.cookie('ft_guest',raw+'.'+(old===raw&&nonce?nonce:token()),{path:'/api/guest/'+link.id,httpOnly:true,sameSite:'strict',secure:process.env.NODE_ENV==='production',expires:new Date(link.expires_at)});
  res.json({ok:true});
 });
 guest.use(async(req,_res,next)=>{req.guest=await authorized(db.q,req);next();});
 guest.get('/',async(req,res)=>{
  const l=req.guest;
  if(l.kind==='story')return res.json({kind:'story',origin_family:l.family_id,story:await story(db.q,l)});
  const p=await within(db.q,'people',l.family_id,l.person_id);
  res.json({kind:l.kind,name:p.name,started:!!l.interview_id,ai:!!process.env.OPENAI_API_KEY});
 });
 guest.post('/start',async(req,res)=>{
  const b=z.object({consent:z.literal(true),language:z.enum(['en','pa','hi','ur']),audio_consent:z.boolean(),voice_consent:z.boolean()}).parse(req.body);
  await db.tx(async q=>{
   const l=await authorized(q,req,true);
   if(l.kind!=='interview')unavailable();
   if(l.interview_id)return;
   const p=await within(q,'people',l.family_id,l.person_id);
   const session=await startInterview(q,l.family_id,l.created_by,{...b,title:p.name+'’s story',person_id:p.id,prepared_questions:[]},true);
   await q('UPDATE guest_links SET interview_id=$2,browser_hash=$3 WHERE id=$1',[l.id,session.id,hash(cookie(req)[1])]);
  });
  res.json({ok:true});
 });
 guest.get('/recordings/:recording',async(req,res)=>play(db.q,req.guest,req.params.recording,res));
 // Only routes explicitly mounted on this router can serve an interview guest.
 guest.use('/interview',(req,_res,next)=>{
  if(req.guest.kind!=='interview'||!req.guest.browser_hash||!req.guest.interview_id)unavailable();
  next();
 });
 guest.post('/save',async(req,res)=>{
  if(!req.user)fail(401,'Sign in to save this story in an archive.');
  const family=uuid.parse(req.body.family_id);
  if(req.guest.kind!=='story'||family===req.guest.family_id)fail(400,'Choose another archive.');
  await db.tx(async q=>{
   await member(q,family,req.user.id,editors);
   await q('INSERT INTO saved_story_links VALUES($1,$2) ON CONFLICT DO NOTHING',[family,req.guest.id]);
  });
  res.json({ok:true});
 });
 app.get(base+'/saved-stories',async(req,res)=>{
  res.json((await db.q(`SELECT l.id,i.title FROM saved_story_links s JOIN guest_links l ON l.id=s.link_id
    JOIN memberships m ON m.family_id=l.family_id AND m.account_id=l.created_by AND m.role IN ('owner','editor')
    JOIN interviews i ON i.id=l.interview_id WHERE s.family_id=$1 AND l.expires_at>now() AND l.revoked_at IS NULL AND i.status='complete' ORDER BY i.title`,[req.params.family])).rows);
 });
 async function saved(req){
  const l=(await db.q(active+` AND l.kind='story' AND EXISTS(SELECT 1 FROM saved_story_links s WHERE s.link_id=l.id AND s.family_id=$2)`,[uuid.parse(req.params.link),req.params.family])).rows[0];
  if(!l)unavailable();return l;
 }
 app.get(base+'/saved-stories/:link',async(req,res)=>res.json(await story(db.q,await saved(req))));
 app.get(base+'/saved-stories/:link/recordings/:recording',async(req,res)=>play(db.q,await saved(req),req.params.recording,res));
 app.get(base+'/guest-links',async(req,res)=>{
  await member(db.q,req.params.family,req.user.id,editors);
  res.json((await db.q(`SELECT l.id,l.kind,p.name,l.expires_at,l.revoked_at FROM guest_links l JOIN people p ON p.id=l.person_id
   WHERE l.family_id=$1 ORDER BY l.created_at DESC`,[req.params.family])).rows);
 });
 app.post(base+'/guest-links',async(req,res)=>{
  const b=z.discriminatedUnion('kind',[
   z.object({kind:z.literal('interview'),person_id:uuid}),
   z.object({kind:z.literal('story'),interview_id:uuid,permission:z.literal(true),share_audio:z.boolean().default(false)})
  ]).parse(req.body);
  const raw=token(),key=id(),family=req.params.family;
  await db.tx(async q=>{
   await member(q,family,req.user.id,editors);
   let person=b.person_id;
   if(b.kind==='story'){
    const i=await within(q,'interviews',family,b.interview_id,true);
    if(i.status!=='complete'||(b.share_audio&&!i.audio_consent))fail(400,'Choose a completed story with the required consent.');
    person=i.person_id;
   }else await within(q,'people',family,person);
   await q(`INSERT INTO guest_links(id,family_id,person_id,interview_id,kind,token_hash,created_by,share_audio,expires_at)
    VALUES($1,$2,$3,$4,$5,$6,$7,$8,now()+interval '7 days')`,[key,family,person,b.interview_id||null,b.kind,hash(raw),req.user.id,b.share_audio||false]);
  });
  res.json({id:key,url:origin+'/#visit='+key+'.'+raw});
 });
 app.delete(base+'/guest-links/:link',async(req,res)=>{
  await member(db.q,req.params.family,req.user.id,editors);
  await db.q('UPDATE guest_links SET revoked_at=now() WHERE family_id=$1 AND id=$2',[req.params.family,uuid.parse(req.params.link)]);
  res.json({ok:true});
 });
 return function interviewRoute(method,suffix,...handlers){
  app[method](base+'/interviews/:interview'+suffix,...handlers);
  guest[method]('/interview'+suffix,(req,_res,next)=>{
   req.params.family=req.guest.family_id;req.params.interview=req.guest.interview_id;next();
  },...handlers);
 };
}
