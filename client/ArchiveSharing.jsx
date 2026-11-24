import React,{useEffect,useState} from 'react';
import {api} from './api';

export function Story({story,audioBase}){
 return <article className="panel content-panel"><h2>{story.title}</h2><p>As told by {story.name}</p>
 {story.passages.map((p,n)=><div className={'message '+p.speaker} key={n}><small>{p.speaker==='interviewer'?'Question':story.name}</small><p lang={story.language} dir="auto">{p.text}</p></div>)}
 {story.recordings.map(r=><audio key={r.id} controls preload="none" src={'/api'+audioBase+'/recordings/'+r.id}/>)}</article>;
}

export function SavedStories({base}){
 const [rows,setRows]=useState([]),[opened,setOpened]=useState(null),[error,setError]=useState('');
 useEffect(()=>{let current=true;api(base+'/saved-stories').then(r=>{if(current)setRows(r);}).catch(e=>{if(current)setError(e.message);});return()=>{current=false;};},[base]);
 if(!rows.length&&!error)return null;
 return <section className="panel content-panel"><h2>Stories shared from other archives</h2>{error&&<p role="alert">{error}</p>}
 {rows.map(r=><button className="text-button" key={r.id} onClick={async()=>{try{setOpened({id:r.id,story:await api(base+'/saved-stories/'+r.id)});}catch(e){setOpened(null);setError(e.message);}}}>{r.title}</button>)}
 {opened&&<Story story={opened.story} audioBase={base+'/saved-stories/'+opened.id}/>}</section>;
}

export function ShareControls({base,people,interviews,kind,onClose}){
 const [picked,setPicked]=useState(''),[url,setUrl]=useState(''),[busy,setBusy]=useState(false),[error,setError]=useState('');
 const isStory=kind==='story', options=isStory?interviews.filter(i=>i.status==='complete'):people;
 const choice=options.find(o=>o.id===picked);
 async function create(e){e.preventDefault();const form=new FormData(e.currentTarget);setError('');setBusy(true);
  try{const result=await api(base+'/guest-links',{method:'POST',body:isStory?{kind,interview_id:picked,permission:form.has('permission'),share_audio:form.has('audio')}:{kind,person_id:picked}});setUrl(result.url);}catch(e){setError(e.message);}finally{setBusy(false);}
 }
 return <>{error&&<p role="alert">{error}</p>}{url?<><label className="field"><span>Private link · expires in 7 days</span><input readOnly value={url} onFocus={e=>e.target.select()}/></label><button className="button" onClick={async()=>{try{await navigator.clipboard.writeText(url);onClose();}catch{setError('Select and copy the link above.');}}}>Copy link</button></>:<form onSubmit={create}>
 <p>{isStory?'Anyone with this link can read the selected interview, including its questions and answers.':'Send this link privately to the storyteller. They choose their language and give permission before the interview starts. They can resume in the same browser.'}</p>
 <label className="field"><span>{isStory?'Story to share':'Who will tell their story?'}</span><select required value={picked} onChange={e=>setPicked(e.target.value)}><option value="">Choose {isStory?'a story':'a person'}</option>{options.map(o=><option key={o.id} value={o.id}>{o.title||o.name}{isStory?' · '+o.person_name:''}</option>)}</select></label>
 {!options.length&&<p>{isStory?'Finish an interview first to share its story.':'Add the storyteller under People first.'}</p>}
 {isStory&&<><label className="check-field"><input required type="checkbox" name="permission"/>The storyteller agrees to share this transcript with link recipients.</label>{choice?.audio_consent&&<label className="check-field" key={picked}><input type="checkbox" name="audio"/>The storyteller also agrees to share the saved recordings.</label>}</>}
 <button disabled={busy||!picked} className="button">Create seven-day link</button></form>}</>;
}

export function ManageGuestLinks({base}){
 const [rows,setRows]=useState([]),[error,setError]=useState(''),[version,reload]=useState(0);
 useEffect(()=>{let current=true;api(base+'/guest-links').then(r=>{if(current)setRows(r);}).catch(e=>{if(current)setError(e.message);});return()=>{current=false;};},[base,version]);
 if(!rows.length&&!error)return null;
 return <section className="panel content-panel"><h2>Story and interview links</h2>{error&&<p role="alert">{error}</p>}{rows.map(r=>{
  const active=!r.revoked_at&&new Date(r.expires_at)>new Date();
  return <div className="member-row" key={r.id}><div><strong>{r.name}</strong><p>{r.kind==='story'?'Shared story':'Interview invitation'} · {active?'Expires '+new Date(r.expires_at).toLocaleDateString():r.revoked_at?'Turned off':'Expired'}</p></div>{active&&<button className="text-button" onClick={async()=>{try{await api(base+'/guest-links/'+r.id,{method:'DELETE'});reload(v=>v+1);}catch(e){setError(e.message);}}}>Turn off link</button>}</div>;
 })}</section>;
}
