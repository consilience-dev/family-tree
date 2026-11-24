import {z} from 'zod';
export const Extract=z.object({claims:z.array(z.object({kind:z.enum(['person','alias','parent','partner','event','fact']),subject_name:z.string().min(1).max(160),object_name:z.string().max(160).nullable(),predicate:z.string().min(1).max(120),value:z.string().max(2000),certainty:z.enum(['stated','uncertain']),passage_id:z.string().uuid(),quote:z.string().min(1).max(4000)})).max(100)});
export async function response(instructions,input,schema){
  const r=await fetch('https://api.openai.com/v1/responses',{method:'POST',headers:{Authorization:`Bearer ${process.env.OPENAI_API_KEY}`,'Content-Type':'application/json'},signal:AbortSignal.timeout(60000),body:JSON.stringify({model:process.env.OPENAI_TEXT_MODEL||'gpt-4.1-mini',store:false,instructions,input:JSON.stringify(input),...(schema?{text:{format:{type:'json_schema',name:'family_evidence',strict:true,schema:z.toJSONSchema(schema,{target:'draft-7'})}}}:{})})});
  if(!r.ok)throw new Error(`Model service unavailable (${r.status}). Please try again.`);
  const data=await r.json();if(data.status&&data.status!=='completed')throw new Error('The model response was incomplete. Please try again.');const text=data.output?.flatMap(x=>x.content||[]).filter(x=>x.type==='output_text').map(x=>x.text).join('');
  if(!text)throw new Error('The model did not return usable text.');
  return schema?schema.parse(JSON.parse(text)):text;
}
export function demoExtract(passages,person){
 // Conservative deterministic demo: retain the exact testimony; do not infer entities.
 return {claims:passages.filter(p=>p.speaker==='interviewee').map(p=>({kind:'fact',subject_name:person.name,object_name:null,predicate:'recollection',value:p.text.slice(0,2000),certainty:'uncertain',passage_id:p.id,quote:p.text.slice(0,2000)}))};
}
