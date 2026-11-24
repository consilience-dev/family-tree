import React from 'react';
import {BookOpen,ChevronRight,FileText} from 'lucide-react';
import {QuestionBox} from './InterviewHome';

export default function HistorianConversation({failed,turns,busy,ask,clear,config,data,base,source,showProfile,Tree,Timeline}){
 const latest=turns.at(-1), subject=data.people.find(p=>p.id===latest?.focus_id);
 return <div className="historian-conversation">
 <header className="conversation-title"><div><span className="historian-mark"><BookOpen size={22}/></span><h1>Family historian</h1></div>
 {turns.length>0&&<button className="text-button" disabled={busy} onClick={clear}>New conversation</button>}</header>
 {!turns.length&&<p>Ask about a relative, a memory, or how people in your family are connected.</p>}
 {!config.ai&&<p className="muted">Demo mode shows excerpts from the fictional interviews.</p>}
 {turns.slice(0,-1).map((t,i)=><details className="past-turn" key={i}><summary>{t.question}</summary><p>{t.answer}</p>{t.sources.map(s=><button key={s.id} className="text-button" onClick={()=>source(s.id)}>{s.title} <FileText size={13}/></button>)}</details>)}
 {latest&&<article className="historian-turn" aria-label="Historian answer">
 <h2>{latest.question}</h2><p className="answer-text">{latest.answer}</p>
 {latest.component.type==='tree'&&(latest.component.root?<Tree key={latest.component.root} base={base} people={data.people} initialRoot={latest.component.root} onPerson={p=>ask('What do we know about '+p.name+'?',p.id)}/>:<p>No people have been added to this archive yet.</p>)}
 {latest.component.type==='timeline'&&<Timeline events={latest.component.events} claims={data.claims} source={source}/>}
 {latest.component.type==='people'&&<div className="people-chips">{latest.component.people.map(p=><button key={p.id} disabled={busy} onClick={()=>ask('Tell me about '+p.name+'.',p.id)}>{p.name} <ChevronRight size={14}/></button>)}</div>}
 {latest.sources.length>0&&<section className="historian-sources"><h3>From the interviews</h3>{latest.sources.map(s=><button className="source-quote" key={s.id} onClick={()=>source(s.id)}><strong>{s.title} · {s.narrator}</strong><p lang={s.language} dir="auto">“{s.text.length>200?s.text.slice(0,200)+'…':s.text}”</p></button>)}</section>}
 {latest.connections?.length>0&&<section className="historian-sources"><h3>Family-reported connections</h3>{latest.connections.map(c=><p key={c.id}>{c.target_name} is {c.source_name}’s {c.kind}.</p>)}</section>}
 {subject&&<div className="suggestions"><button disabled={busy} onClick={()=>ask('Show the timeline of '+subject.name+'’s life.',subject.id)}>Explore their timeline</button><button onClick={()=>showProfile(subject)}>Open {subject.name}’s profile</button></div>}
 </article>}
 <section className="historian-composer">
 {failed&&!busy&&<button className="text-button" onClick={()=>ask(failed.text,failed.personId,failed.interviewId)}>Retry “{failed.text}”</button>}
 {busy&&<p role="status">Looking through your family’s interviews…</p>}
 <QuestionBox onAsk={ask} busy={busy} placeholder={latest?'Ask a follow-up…':'Ask about your family…'}/>
 {!latest&&<div className="suggestions">{['Show our family tree','What do we know about our family’s moves?'].map(q=><button key={q} disabled={busy} onClick={()=>ask(q)}>{q}</button>)}</div>}
 </section></div>;
}
