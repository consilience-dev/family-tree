export async function api(path,options={}){
 const res=await fetch('/api'+path,{...options,headers:{...(options.body instanceof Blob||typeof options.body==='string'&&options.headers?.['Content-Type']==='application/sdp'?{}:{'Content-Type':'application/json'}),...options.headers},body:options.body&&!(options.body instanceof Blob)&&typeof options.body!=='string'?JSON.stringify(options.body):options.body});
 if(!res.ok){const data=await res.json().catch(()=>({error:'Connection failed. Please try again.'}));throw new Error(data.error||'Request failed.');}
 return res.headers.get('content-type')?.includes('json')?res.json():res.text();
}
