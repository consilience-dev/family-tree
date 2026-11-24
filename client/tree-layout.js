// Partners share a visual generation. This is display layout only, never a genealogical inference.
export function generations(nodes,edges){
 const group=new Map(nodes.map(n=>[n.id,n.id]));
 function find(id){let g=group.get(id);while(g!==group.get(g))g=group.get(g);return g;}
 for(const e of edges)if(e.kind==='partner'&&group.has(e.source_id)&&group.has(e.target_id))group.set(find(e.target_id),find(e.source_id));
 const levels=Object.fromEntries(nodes.map(n=>[find(n.id),0]));
 for(let n=0;n<nodes.length;n++){let changed=false;for(const e of edges){if(e.kind!=='parent'||!group.has(e.source_id)||!group.has(e.target_id))continue;const a=find(e.source_id),b=find(e.target_id);if(a!==b&&levels[b]<=levels[a]){levels[b]=Math.min(nodes.length,levels[a]+1);changed=true;}}if(!changed)break;}
 return Object.fromEntries(nodes.map(n=>[n.id,levels[find(n.id)]]));
}
