import {z} from 'zod';
import {id,fail,within,member} from './security.js';

export const relationship = z.enum(['sibling','cousin','mother-in-law','father-in-law','parent-in-law']);
export const nameFields = {
 name: z.string().trim().min(1).max(160),
 birth_name: z.string().trim().max(160).default(''),
 former_names: z.array(z.string().trim().min(1).max(160)).max(20).default([])
};

export async function selfProfile(q,family,account) {
 return (await q('SELECT * FROM people WHERE family_id=$1 AND linked_account_id=$2',[family,account])).rows[0];
}
export async function linkProfile(q,family,account,personId) {
 const previous=await selfProfile(q,family,account);
 const person=await within(q,'people',family,personId,true);
 if ((previous && previous.id!==personId) || (person.linked_account_id && person.linked_account_id!==account))
   fail(409,'This account or profile already has a different link.');
 await q('UPDATE people SET linked_account_id=$3 WHERE family_id=$1 AND id=$2',[family,personId,account]);
}
export async function addConnection(q,family,account,relative,kind) {
 const self=await selfProfile(q,family,account);
 if(!self) fail(409,'Connect your own profile in Members & settings first.');
 if(self.id===relative) fail(400,'Choose another person for this relationship.');
 await within(q,'people',family,relative);
 let source=self.id,target=relative;
 if(['sibling','cousin'].includes(kind) && source>target) [source,target]=[target,source];
 await q('INSERT INTO family_connections(id,family_id,source_id,target_id,kind,reported_by) VALUES($1,$2,$3,$4,$5,$6) ON CONFLICT(family_id,source_id,target_id,kind) DO NOTHING',[id(),family,source,target,kind,account]);
}
export function registerProfileRoutes(app,db,base){
 app.post(base+'/my-profile',async(req,res)=>{
  const {person_id,name}=z.object({person_id:z.string().uuid().optional(),name:nameFields.name.optional()}).parse(req.body);
  await db.tx(async q=>{
   const role=await member(q,req.params.family,req.user.id,['owner','editor']);
   if(person_id && role!=='owner') fail(403,'An invitation addressed to your profile is needed to link an existing person.');
   if(person_id) return linkProfile(q,req.params.family,req.user.id,person_id);
   if(await selfProfile(q,req.params.family,req.user.id)) fail(409,'You already have a profile.');
   await q('INSERT INTO people(id,family_id,name,linked_account_id) VALUES($1,$2,$3,$4)',[id(),req.params.family,name||req.user.name,req.user.id]);
  });
  res.json({ok:true});
 });
 app.patch(base+'/people/:person/names',async(req,res)=>{
  const b=z.object(nameFields).parse(req.body);
  await db.tx(async q=>{
   await member(q,req.params.family,req.user.id,['owner','editor']);
   const p=await within(q,'people',req.params.family,z.string().uuid().parse(req.params.person),true);
   // Keep a previous display name when the person adopts a new surname.
   const former=[...new Set([...b.former_names,...(p.name!==b.name?[p.name]:[])])].filter(n=>n!==b.name);
   await q('UPDATE people SET name=$3,birth_name=$4,former_names=$5 WHERE family_id=$1 AND id=$2',[p.family_id,p.id,b.name,b.birth_name,former]);
  });
  res.json({ok:true});
 });
}

export const storytellerFields={
 person_id:z.string().uuid().optional(),
 new_name:nameFields.name.optional(),
 myself:z.literal(true).optional()
};
export async function selectStoryteller(q,family,user,b){
 if([b.person_id,b.new_name,b.myself].filter(Boolean).length!==1)fail(400,'Choose one storyteller.');
 if(b.person_id)return (await within(q,'people',family,b.person_id)).id;
 if(b.myself){
  await q('SELECT id FROM accounts WHERE id=$1 FOR UPDATE',[user.id]);
  const own=await selfProfile(q,family,user.id);
  if(own)return own.id;
 }
 const person=id();
 await q('INSERT INTO people(id,family_id,name,linked_account_id) VALUES($1,$2,$3,$4)',[person,family,b.myself?user.name:b.new_name,b.myself?user.id:null]);
 return person;
}
