import React from 'react';
import {api} from './api';

export function RelationshipField({disabled=false}) {
 return <label className="field"><span>This person is my…</span>
  <select name="relationship" disabled={disabled} defaultValue="">
   <option value="">Leave unspecified</option>
   {['sibling','cousin','mother-in-law','father-in-law','parent-in-law'].map(item=><option key={item} value={item}>{item}</option>)}
  </select></label>;
}

export function NamesFields({person={}}) {
 return <>
  <label className="field"><span>Birth name, including birth surname (optional)</span><input name="birth_name" maxLength={160} defaultValue={person.birth_name||''}/></label>
  <label className="field"><span>Former full names (one per line)</span><textarea name="former_names" rows={2} defaultValue={person.former_names?.join('\n')||''}/></label>
 </>;
}

export function MyProfile({own,people,me,owner,base,act,busy,refresh}) {
 return <section className="panel content-panel"><h2>My family profile</h2>
 {own?<p>Signed in as {me.name}. Your person in this family is <strong>{own.name}</strong>.</p>:<form onSubmit={e=>{
   e.preventDefault();const value=new FormData(e.currentTarget).get('person');
   act(async()=>{await api(base+'/my-profile',{method:'POST',body:value?{person_id:value}:{name:me.name}});await refresh();});
 }}>
 <label className="field"><span>Who are you in this family?</span><select name="person" defaultValue="">
 <option value="">Create my profile as {me.name}</option>
 {owner&&people.filter(p=>!p.linked_account_id).map(p=><option value={p.id} key={p.id}>{p.name}</option>)}
 </select></label>
 {!owner&&<p>If your profile already exists, ask for an invitation addressed to that person.</p>}
 <button disabled={busy} className="button">Connect my profile</button></form>}
 </section>;
}

export function FamilyConnections({person,people,edges}) {
 const relatives=edges.filter(e=>!e.claim_id&&(e.source_id===person.id||e.target_id===person.id));
 if(!relatives.length)return null;
 return <section className="panel content-panel"><h2>Family-reported relationships</h2>{relatives.map(e=>{
  const from=people.find(p=>p.id===e.source_id),to=people.find(p=>p.id===e.target_id);
  return <p key={e.id}>{to?.name} is {from?.name}’s {e.kind}.</p>;
 })}</section>;
}
