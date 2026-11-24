import React,{useEffect,useState} from 'react';
import {api} from './api';

export default function ArchiveConnections({family,families,person,onOpen}){
 const [links,setLinks]=useState([]),[other,setOther]=useState(''),[choices,setChoices]=useState([]),[selected,setSelected]=useState(''),[editing,setEditing]=useState(false);
 const [error,setError]=useState(''),[busy,setBusy]=useState(false),[version,refresh]=useState(0);
 const path='/families/'+family+'/connections';
 const writable=families.filter(f=>f.id!==family&&f.role!=='viewer');
 const canWrite=families.some(f=>f.id===family&&f.role!=='viewer');
 useEffect(()=>{
  let current=true;
  api(path).then(rows=>{if(current)setLinks(rows);}).catch(e=>{if(current)setError(e.message);});
  return()=>{current=false;};
 },[path,version]);
 useEffect(()=>{
  let current=true;setChoices([]);setSelected('');
  if(other)api('/families/'+other+'/people-options').then(rows=>{if(current)setChoices(rows);}).catch(e=>{if(current)setError(e.message);});
  return()=>{current=false;};
 },[other]);
 async function change(action){
  setBusy(true);setError('');try{await action();setEditing(false);refresh(v=>v+1);}catch(e){setError(e.message);}finally{setBusy(false);}
 }
 if(families.length<2)return null;
 const visible=links.filter(l=>!person||l.person_id===person.id);
 return <section className="panel content-panel"><h2>Where your archives connect</h2>
 {error&&<p role="alert">{error}</p>}
 {visible.length===0&&<p>{person?'You can connect this person to their profile in another archive you belong to.':'Open a person’s profile to connect them to another of your archives.'}</p>}
 {visible.map(l=><div className="member-row" key={l.id}><div><strong>{l.person_name}</strong><p>Also appears as {l.other_name} in {l.archive_name}</p></div>
 <button className="text-button" onClick={()=>onOpen(l)}>Open profile</button>
 {person&&canWrite&&writable.some(f=>f.id===l.other_family)&&<button disabled={busy} className="text-button" onClick={()=>change(()=>api(path+'/'+l.id,{method:'DELETE'}))}>Unlink</button>}</div>)}
 {person&&canWrite&&writable.length>0&&(editing?<form onSubmit={e=>{e.preventDefault();change(()=>api(path,{method:'POST',body:{person_id:person.id,other_family:other,...(selected==='create'?{create_profile:true}:{other_person:selected})}}));}}>
 <label className="field"><span>Other archive</span><select required value={other} onChange={e=>setOther(e.target.value)}><option value="">Choose an archive</option>{writable.map(f=><option key={f.id} value={f.id}>{f.name}</option>)}</select></label>
 <label className="field"><span>Profile of the same person</span><select required value={selected} onChange={e=>setSelected(e.target.value)}><option value="">Choose their profile</option>{choices.map(p=><option key={p.id} value={p.id}>{p.name}{p.birth_name?' · born '+p.birth_name:''}</option>)}{other&&<option value="create">Add {person.name} as a new profile there</option>}</select></label>
 {selected==='create'&&<p>The new profile starts with the name {person.name}. You can add details inside that archive.</p>}<p>People who can open both archives will see this connection. Each archive keeps its own stories.</p>
 <div className="button-row"><button className="button" disabled={busy||!selected}>Confirm same person</button><button type="button" className="button secondary" onClick={()=>setEditing(false)}>Cancel</button></div></form>:
 <button className="button secondary" onClick={()=>setEditing(true)}>Connect to another archive</button>)}</section>;
}
