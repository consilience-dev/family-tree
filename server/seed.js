import {id,password} from './security.js';
async function seedOriginal(db){
 if((await db.q("SELECT id FROM accounts WHERE email='demo@familytree.local'")).rows.length)return;
 await db.tx(async q=>{
 const a=id(),f=id();await q('INSERT INTO accounts VALUES($1,$2,$3,$4,now())',[a,'Alex Singh','demo@familytree.local',password(id()+id())]);await q('INSERT INTO families(id,name) VALUES($1,$2)',[f,'The Singh family']);await q("INSERT INTO memberships VALUES($1,$2,'owner')",[f,a]);
 const names=[['Harjit Kaur','The keeper of our earliest stories. Born in Punjab.'],['Gurdev Singh','A teacher, a gardener, and a devoted grandfather.'],['Amar Singh','Carries a love of music across generations.'],['Simran Kaur','Brings everyone together around the dinner table.'],['Raj Singh','A collector of photographs and family memories.'],['Alex Singh','Asking the questions we always meant to ask.'],['Maya Singh','The next chapter of the family story.']];const ids=names.map(()=>id());
 for(let n=0;n<names.length;n++)await q('INSERT INTO people(id,family_id,name,description,aliases) VALUES($1,$2,$3,$4,$5)',[ids[n],f,...names[n],n===0?['Biji','ਹਰਜੀਤ ਕੌਰ']:[]]);
 const i=id();await q("INSERT INTO interviews(id,family_id,person_id,created_by,title,language,consent_at,consent_by,status) VALUES($1,$2,$3,$4,$5,'en',now(),$4,'complete')",[i,f,ids[0],a,'A courtyard full of memories']);
 const memories=["My name is Harjit Kaur. Everyone in the family calls me Biji. Gurdev Singh was my husband. Our children are Amar Singh and Raj Singh. Amar's partner is Simran Kaur, and their children are Alex Singh and Maya Singh.","When I was small, our courtyard was the whole world. My mother would sit under the neem tree and braid my hair. I can still remember the smell of the rain on the warm earth.","We moved to Amritsar in 1952, I think. Gurdev had found work as a teacher. We carried two trunks and a little brass pot from my mother. I kept it all these years.","ਹਰ ਐਤਵਾਰ ਸਾਰਾ ਪਰਿਵਾਰ ਇਕੱਠਾ ਹੁੰਦਾ ਸੀ। ਮੈਂ ਆਪਣੇ ਬੱਚਿਆਂ ਨੂੰ ਆਪਣੇ ਬਚਪਨ ਦੀਆਂ ਕਹਾਣੀਆਂ ਸੁਣਾਉਂਦੀ ਸੀ।"];
 const ps=[];for(let n=0;n<memories.length;n++){ps[n]=id();await q("INSERT INTO passages(id,family_id,interview_id,speaker,text,language,client_id) VALUES($1,$2,$3,'interviewee',$4,$5,$6)",[ps[n],f,i,memories[n],n===3?'pa':'en','seed-'+n]);}
 const rels=[[0,1,'partner'],[0,2,'parent'],[1,2,'parent'],[0,4,'parent'],[1,4,'parent'],[2,3,'partner'],[2,5,'parent'],[3,5,'parent'],[2,6,'parent'],[3,6,'parent']];
 for(const [from,to,kind] of rels){const c=id();await q("INSERT INTO claims(id,family_id,interview_id,passage_id,quote,kind,subject_name,object_name,predicate,value,certainty,status,subject_id,object_id,reviewed_by,reviewed_at) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$6,$8,'stated','accepted',$9,$10,$11,now())",[c,f,i,ps[0],memories[0],kind,names[from][0],names[to][0],ids[from],ids[to],a]);await q('INSERT INTO edges VALUES($1,$2,$3,$4,$5,$6)',[id(),f,ids[from],ids[to],kind,c]);}
 const event=id();await q("INSERT INTO claims(id,family_id,interview_id,passage_id,quote,kind,subject_name,predicate,value,certainty,status,subject_id,reviewed_by,reviewed_at) VALUES($1,$2,$3,$4,$5,'event','Harjit Kaur','About 1952','Moved to Amritsar','uncertain','accepted',$6,$7,now())",[event,f,i,ps[2],memories[2],ids[0],a]);await q('INSERT INTO events VALUES($1,$2,$3,$4,$5,$6)',[id(),f,ids[0],'Moved to Amritsar','About 1952',event]);
 await q("INSERT INTO claims(id,family_id,interview_id,passage_id,quote,kind,subject_name,predicate,value,certainty,candidates) VALUES($1,$2,$3,$4,$5,'alias','Harjit Kaur','also known as','Biji','stated',$6)",[id(),f,i,ps[0],'Everyone in the family calls me Biji.',JSON.stringify([{id:ids[0],name:names[0][0]}])]);
 await q("INSERT INTO claims(id,family_id,interview_id,passage_id,quote,kind,subject_name,predicate,value,certainty,candidates) VALUES($1,$2,$3,$4,$5,'fact','Harjit Kaur','childhood memory',$5,'stated',$6)",[id(),f,i,ps[1],memories[1],JSON.stringify([{id:ids[0],name:names[0][0]}])]);
 });
}


export async function seed(db){
 await seedOriginal(db);
 await db.tx(async q=>{
  const source=(await q(`SELECT i.person_id,i.created_by,i.family_id FROM interviews i
    JOIN accounts a ON a.id=i.created_by JOIN passages p ON p.interview_id=i.id
    WHERE a.email='demo@familytree.local' AND p.client_id='seed-0' LIMIT 1`)).rows[0];
  if(!source)return;
  const second='194839b7-ea71-43e3-ae32-e6ab6fc4089f';
  const added=await q("INSERT INTO families(id,name) VALUES($1,'Biji’s childhood archive') ON CONFLICT DO NOTHING RETURNING id",[second]);
  if(!added.rows.length)return;
  const profile=id();
  await q("INSERT INTO memberships VALUES($1,$2,'owner')",[second,source.created_by]);
  await q("INSERT INTO people(id,family_id,name,description) VALUES($1,$2,'Harjit Kaur','Known to her grandchildren as Biji.')",[profile,second]);
  const pair=source.family_id<second?[source.family_id,source.person_id,second,profile]:[second,profile,source.family_id,source.person_id];
  await q('INSERT INTO archive_connections(id,family_a,person_a,family_b,person_b,confirmed_by) VALUES($1,$2,$3,$4,$5,$6)',[id(),...pair,source.created_by]);
 });
}
