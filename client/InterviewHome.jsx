import React,{useState} from 'react';
import {Mic,Link,ArrowUpRight,ArrowRight,MessageCircle} from 'lucide-react';

export function QuestionBox({onAsk,busy,label='Ask your family historian',placeholder='What would you like to know?',autoFocus=false}){
 const [question,setQuestion]=useState('');
 return <form className="question-box" onSubmit={e=>{
  e.preventDefault();const text=question.trim();
  if(text&&!busy){onAsk(text);setQuestion('');}
 }}>
  <input aria-label={label} value={question} maxLength={1000} onChange={e=>setQuestion(e.target.value)} placeholder={placeholder} autoFocus={autoFocus} required/>
  <button aria-label="Send question" disabled={busy||!question.trim()}><ArrowRight size={20}/></button>
 </form>;
}

export default function InterviewHome({canEdit,start,invite,ask,busy,interviews,renderInterview,onAll,pending,onReview}){
 return <div className="interview-home">
 <section className="interview-intro">
  <span className="home-mic" aria-hidden="true"><Mic size={26}/></span>
  <h1>Whose story would you<br className="wide-break"/> like to record?</h1>
  <p>Sit down with a parent or grandparent, tell your own story, or send someone an interview to do in their own time.</p>
  {canEdit&&<div className="home-actions"><button className="button primary-action" onClick={start}><Mic size={18}/>Start an interview</button>
  <button className="button secondary" onClick={invite}><Link size={17}/>Send an interview link</button></div>}
 </section>
 <section className="home-historian">
 <MessageCircle size={24} aria-hidden="true"/><div><h2>Ask your family historian</h2><p>Explore the people, places, and memories in your interviews.</p>
 {ask?<><QuestionBox onAsk={ask} busy={busy} placeholder="Where did our family grow up?"/>
 <button className="text-button" disabled={busy} onClick={()=>ask('Show me our family tree.')}>Show our family tree <ArrowUpRight size={15}/></button></>:<p>Your historian will be ready after you save a story.</p>}</div>
 </section>
 {interviews.length>0&&<section className="home-recent"><div className="section-heading"><h2>Recent interviews</h2><button className="text-button" onClick={onAll}>View all <ArrowRight size={15}/></button></div>{interviews.slice(0,3).map(renderInterview)}</section>}
 {canEdit&&pending>0&&<button className="text-button review-link" onClick={onReview}>Review {pending} suggested {pending===1?'fact':'facts'} from interviews <ArrowRight size={15}/></button>}
 </div>;
}
