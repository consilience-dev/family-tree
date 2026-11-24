import React,{useState} from 'react';
import {api} from './api';
import {RelationshipField} from './FamilyIdentity';

export default function InterviewSetup({base,firstStory,people,own,me,preset,sendLink,config,act,busy,onCreated,onClose,languages}){
 const [who,setWho]=useState(preset||''),[url,setUrl]=useState(''),[copied,setCopied]=useState(false);
 const self=who==='self'||who===own?.id;
 async function submit(e){
  e.preventDefault();const f=new FormData(e.currentTarget);
  const name=who==='new'?f.get('name').trim():self?me.name:people.find(p=>p.id===who)?.name;
  let person=who==='new'?{new_name:name}:who==='self'?{myself:true}:{person_id:who};
  const prepared_questions=String(f.get('questions')||'').split('\n').map(s=>s.trim()).filter(Boolean);
  await act(async()=>{
   let archive=base;
   if(!archive){
    const initial=await firstStory(name,who==='self');
    archive='/families/'+initial.family;person={person_id:initial.person};setWho(initial.person);
   }
   if(sendLink){
    const r=await api(archive+'/guest-links',{method:'POST',body:{...person,kind:'interview',prepared_questions}});
    setUrl(r.url);await onCreated(null,archive);return;
   }
   const r=await api(archive+'/interviews',{method:'POST',body:{...person,title:f.get('title')?.trim()||name+'’s interview',language:f.get('language'),
    prepared_questions,relationship:f.get('relationship')||undefined,consent:f.has('consent'),voice_consent:f.has('voice'),audio_consent:f.has('audio')}});
   await onCreated(r,archive);
  });
 }
 if(url)return <div className="setup-form"><p>Send this link to the storyteller. They choose their language and give permission when they open it.</p><label className="field"><span>Interview link · expires in 7 days</span><input readOnly value={url} onFocus={e=>e.target.select()}/></label>
 <div className="button-row"><button className="button" onClick={()=>act(async()=>{await navigator.clipboard.writeText(url);setCopied(true);})}>{copied?'Copied':'Copy interview link'}</button><button className="button secondary" onClick={onClose}>Done</button></div></div>;
 return <form className="setup-form" onSubmit={submit}>
 <label className="field"><span>Who is telling the story?</span><select required value={who} onChange={e=>setWho(e.target.value)}>
 <option value="">Choose a storyteller</option>{!sendLink&&<option value="self">Myself · {own?.name||me.name}</option>}<option value="new">Someone new</option>
 {people.filter(p=>sendLink||p.id!==own?.id||p.id===preset).map(p=><option key={p.id} value={p.id}>{p.name}</option>)}</select></label>
 {who==='new'&&<label className="field"><span>Storyteller’s name</span><input name="name" required maxLength={160}/></label>}
 {!sendLink&&<label className="field"><span>Interview language</span><select name="language">{Object.entries(languages).map(([key,name])=><option key={key} value={key}>{name}</option>)}</select></label>}
 <details><summary>Customize questions{!sendLink?' and details':''}</summary>
 {!sendLink&&<label className="field"><span>Interview title (optional)</span><input name="title" maxLength={160}/></label>}
 <label className="field"><span>Additional questions (optional)</span><textarea name="questions" rows={3} maxLength={5010} placeholder="One question per line, in the storyteller’s language. Up to 10."/></label>
 {!sendLink&&own&&!self&&<RelationshipField/>}</details>
 {sendLink?<p>The private link opens a guided interview. Your relative can take part without an account.</p>:<fieldset><legend>Permission to interview</legend>
 <label className="check-field"><input required name="consent" type="checkbox"/><span>{self?'I agree':'The storyteller agrees'} to save the transcript in this family archive{config.ai?' and send it to OpenAI for questions and family-history suggestions':''}.</span></label>
 {config.ai&&<label className="check-field"><input name="voice" type="checkbox"/><span>{self?'I agree':'They agree'} to send microphone audio to OpenAI for live voice.</span></label>}
 <label className="check-field"><input name="audio" type="checkbox"/><span>{self?'I agree':'They agree'} to keep a private microphone recording.</span></label></fieldset>}
 <button className="button" disabled={busy}>{sendLink?'Create interview link':'Begin interview'}</button></form>;
}
