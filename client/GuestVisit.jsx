import React,{useEffect,useState} from 'react';
import {api} from './api';
import {Story} from './ArchiveSharing';

export default function GuestVisit({invitation,InterviewRoom}){
 const [id,token]=invitation.split('.');
 const path='/guest/'+id;
 const [info,setInfo]=useState(null),[record,setRecord]=useState(null),[error,setError]=useState(''),[busy,setBusy]=useState(false),[message,setMessage]=useState(''),[families,setFamilies]=useState([]);
 async function act(fn){setError('');setBusy(true);try{await fn();}catch(e){setError(e.message);}finally{setBusy(false);}}
 useEffect(()=>{let current=true;
  async function load(){
   await api(path+'/open',{method:'POST',body:{token}});
   const data=await api(path);
   const session=data.started?await api(path+'/interview'):null;
   if(current){setInfo(data);setRecord(session);}
   if(data.kind==='story'){const me=await api('/me').catch(()=>null);if(current)setFamilies(me?.families.filter(f=>f.role!=='viewer'&&f.id!==data.origin_family)||[]);}
  }
  load().catch(e=>{if(current)setError(e.message);});return()=>{current=false;};
 },[path,token]);
 return <main className="guest-page"><header className="guest-brand">Family Tree</header>{error&&<p className="error" role="alert">{error}</p>}{message&&<p className="notice" role="status">{message}</p>}
 {!info?(!error&&<p role="status">Opening your invitation…</p>):info.kind==='story'?<><Story story={info.story} audioBase={path}/>
 {families.length>0&&<form className="panel content-panel" onSubmit={e=>{e.preventDefault();const family_id=new FormData(e.currentTarget).get('family');act(async()=>{await api(path+'/save',{method:'POST',body:{family_id}});setMessage('Story linked in the selected archive.');});}}><label className="field"><span>Save a link in another archive</span><select required name="family"><option value="">Choose an archive</option>{families.map(f=><option key={f.id} value={f.id}>{f.name}</option>)}</select></label><p>Members there can read this story while its original link is active.</p><button className="button" disabled={busy}>Save story link</button></form>}</>:
 record?<InterviewRoom guest base={path} initial={record} config={{ai:info.ai}} canEdit act={act} busy={busy} setToast={setMessage} onRefresh={async()=>{}}/>:
 <section className="panel content-panel"><h1>{info.name}, would you like to tell your story?</h1><p>Your answers will be saved in the inviting family’s private archive. You can skip questions or stop at any time.</p>
 <form onSubmit={e=>{e.preventDefault();const f=new FormData(e.currentTarget);act(async()=>{await api(path+'/start',{method:'POST',body:{language:f.get('language'),consent:f.has('consent'),voice_consent:f.has('voice'),audio_consent:f.has('audio')}});setRecord(await api(path+'/interview'));});}}>
 <label className="field"><span>Interview language</span><select name="language"><option value="en">English</option><option value="pa">ਪੰਜਾਬੀ · Punjabi</option><option value="hi">हिन्दी · Hindi</option><option value="ur">اردو · Urdu</option></select></label>
 <label className="check-field"><input type="checkbox" required name="consent"/>I am the invited storyteller and agree to save my answers in this archive{info.ai?' and send them to OpenAI for prompts and family-history suggestions':''}.</label>
 {info.ai&&<label className="check-field"><input type="checkbox" name="voice"/>I agree to send microphone audio to OpenAI for a live voice conversation.</label>}
 <label className="check-field"><input type="checkbox" name="audio"/>I also agree to keep a private microphone recording.</label>
 <button disabled={busy} className="button">Start my interview</button></form></section>}</main>;
}
