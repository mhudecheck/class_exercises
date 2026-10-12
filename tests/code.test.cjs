const {test} = require('node:test');
const assert = require('node:assert/strict');
const G = require('../code-core.js');
function fixture() {
  const p=G.project();p.interviews.push(G.parseTranscript('Interviewer: What happened?\nJamie: I check the list twice.\nInterviewer: Why?\nJamie: I worry I will miss someone.','Jamie'));
  p.categories.push(G.newCategory({label:'Checking twice',inclusion:'Repeated checks',exclusion:'Single checks'}));
  return p;
}
function coded() {
  const p=fixture(),s=p.interviews[0].segments[1];
  p.assignments.push(G.assignment(p,s.id,p.categories[0].id,'I check the list twice.','Repeated checking',true));return p;
}
test('plain text preserves participants, interviewer context, and multiline answers',()=>{
  const i=G.parseTranscript('Interviewer: Tell me more.\nJamie: First line.\nSecond line.\n\nAlex: Another answer.','Test');
  assert.equal(i.segments.length,3);assert.equal(i.segments[0].role,'interviewer');assert.equal(i.segments[1].speaker,'Jamie');assert.equal(i.segments[1].text,'First line.\nSecond line.');
  const chunks=G.makeChunks([i]);assert.equal(chunks[0].segments.length,2);assert.equal(chunks[0].segments[0].question_context,'Tell me more.');
});
test('baseline JSON imports transcript alone and retains simulated provenance',()=>{
  const i=G.parseTranscript(JSON.stringify({format:'customer_interview_practice',persona:{persona_name:'Jamie'},transcript:[{role:'student',text:'What happened?'},{role:'customer',text:'I called twice.'}],assessments:[{text:'Coaching must not be coded'}]}),'JSON','json');
  assert.equal(i.provenance,'simulated');assert.equal(i.segments.length,2);assert.equal(i.segments[1].speaker,'Jamie');assert.equal(i.segments[0].role,'interviewer');
});
test('baseline Markdown excludes coaching and parses message headings',()=>{
  const text='# Customer Interview Practice\n\nFictional practice interview.\n\n## Transcript\n\n### Student (s1)\n\nWhat happened?\n\n### Jamie (c1)\n\nI called twice.\n\n## Coaching\n\nUse better questions.';
  const i=G.parseTranscript(text,'MD','md');assert.equal(i.segments.length,2);assert.equal(i.segments[0].speaker,'Student');assert.equal(i.segments[1].speaker,'Jamie');assert.equal(i.provenance,'simulated');assert.equal(i.segments[1].text,'I called twice.');
});
test('unlabeled text is codeable and long transcripts produce bounded chunks without omissions',()=>{
  const raw='This is a sentence about a real experience. '.repeat(1200),i=G.parseTranscript(raw);
  const chunks=G.makeChunks([i]);assert.ok(chunks.length>1);
  assert.equal(chunks.flatMap(c=>c.segments).length,i.segments.length);assert.ok(chunks.every(c=>c.segments.reduce((sum,s)=>sum+s.text.length+s.question_context.length,0)<=8000));
});
test('empty, malformed and oversized transcript inputs are rejected',()=>{
  for(const raw of ['', ' ', '{}','{"transcript":[]}','{"transcript":[null]}'])assert.throws(()=>G.parseTranscript(raw));
  assert.throws(()=>G.parseTranscript('x'.repeat(500001)));
});
test('exact quotations and first-order references are required',()=>{
  const p=fixture(),s=p.interviews[0].segments[1];
  assert.throws(()=>G.assignment(p,s.id,p.categories[0].id,'Invented quote'));
  assert.throws(()=>G.assignment(p,p.interviews[0].segments[0].id,p.categories[0].id,'What happened?'));
  const a=G.assignment(p,s.id,p.categories[0].id,'check the list');assert.equal(s.text.slice(a.start,a.end),a.quote);
  assert.throws(()=>G.assignment(p,s.id,'invalid','I check the list twice.'));
});
test('automatic coding adds concepts, validates references and commits atomically',()=>{
  const p=fixture(),chunk=G.makeChunks(p.interviews)[0],s=chunk.segments[0],before=G.copy(p);
  const result={new_concepts:[{key:'new1',label:'Fear of missing someone',description:'Worry',inclusion:'Concern',exclusion:'No concern',examples:[]}],assignments:[{segment_id:s.id,category_id:'new1',quote:'Invented',rationale:'Bad'}],uncoded_segment_ids:[chunk.segments[1].id]};
  assert.throws(()=>G.applyCoding(p,chunk,result));assert.deepEqual(p,before);
  result.assignments[0].quote=s.text;G.applyCoding(p,chunk,result);assert.equal(p.categories.length,2);assert.equal(p.assignments.length,1);
});
test('fixed-codebook coding rejects new concepts and cannot silently omit segments',()=>{
  const p=fixture(),chunk=G.makeChunks(p.interviews)[0];
  assert.throws(()=>G.applyCoding(p,chunk,{new_concepts:[{key:'n',label:'New',description:'',inclusion:'',exclusion:'',examples:[]}],assignments:[],uncoded_segment_ids:chunk.segments.map(s=>s.id)},false));
  assert.throws(()=>G.applyCoding(p,chunk,{new_concepts:[],assignments:[],uncoded_segment_ids:[]},false));
  G.applyCoding(p,chunk,{new_concepts:[],assignments:[],uncoded_segment_ids:chunk.segments.map(s=>s.id)},false);assert.equal(p.assignments.length,0);
});
test('concept/theme/dimension hierarchy rejects invalid links and duplicate children',()=>{
  const p=fixture();const t=G.newCategory({label:'Managing uncertainty'},'theme'),d=G.newCategory({label:'Accountability'},'dimension');p.categories.push(t,d);
  G.setParent(p,p.categories[0].id,t.id);G.setParent(p,t.id,d.id);
  assert.throws(()=>G.setParent(p,p.categories[0].id,d.id));assert.throws(()=>G.setParent(p,d.id,p.categories[0].id));
  const result={groups:[{existing_id:t.id,label:t.label,description:'',inclusion:'',exclusion:'',examples:[],child_ids:[p.categories[0].id,p.categories[0].id]}],ungrouped_ids:[]};assert.throws(()=>G.applyGroups(p,'concept',result));
});
test('merge redirects coding and children, preserves reviewed deduplication; delete retains source',()=>{
  const p=coded(),target=G.newCategory({label:'Repeated checks'});p.categories.push(target);
  const originalText=p.interviews[0].segments[1].text;
  G.mergeCategory(p,p.categories[0].id,target.id);assert.equal(p.assignments[0].categoryId,target.id);assert.equal(p.assignments[0].reviewed,true);
  G.deleteCategory(p,target.id);assert.equal(p.assignments.length,0);assert.equal(p.interviews[0].segments[1].text,originalText);
});
test('recoding proposals protect reviewed assignments and require explicit conflict resolution',()=>{
  const p=coded(),candidate=G.copy(p),replacement=G.newCategory({label:'Waiting for certainty'},'concept','ai');candidate.categories.push(replacement);
  candidate.assignments=[G.assignment(candidate,p.assignments[0].segmentId,replacement.id,p.assignments[0].quote,'Alternate interpretation')];
  const proposal=G.proposals(p,candidate);assert.equal(proposal.changes.filter(c=>c.protected).length,2);
  for(const c of proposal.changes)G.acceptChange(p,c);
  assert.equal(p.assignments.length,1);assert.equal(p.assignments[0].reviewed,true);
  for(const c of proposal.changes.filter(c=>c.protected))G.acceptChange(p,c,true);
  assert.equal(p.assignments.length,1);assert.equal(p.assignments[0].categoryId,replacement.id);
});
test('new proposed categories retain their full hierarchy after acceptance',()=>{
  const p=fixture(),candidate=G.copy(p),concept=G.newCategory({label:'New concept'},'concept','ai'),theme=G.newCategory({label:'New theme'},'theme','ai'),dim=G.newCategory({label:'New dimension'},'dimension','ai');
  candidate.categories.push(concept,theme,dim);G.setParent(candidate,concept.id,theme.id);G.setParent(candidate,theme.id,dim.id);
  const proposal=G.proposals(p,candidate);for(const type of ['category','group'])for(const c of proposal.changes.filter(c=>c.type===type))G.acceptChange(p,c);
  assert.equal(p.categories.find(c=>c.id===concept.id).parentId,theme.id);assert.equal(p.categories.find(c=>c.id===theme.id).parentId,dim.id);
});
test('project and codebook exports round-trip without settings',()=>{
  const p=coded(),data=G.exportProject(p),restored=G.validateProject(data);assert.deepEqual(restored,data);assert.ok(!('settings' in data));assert.ok(!JSON.stringify(data).includes('apiKey'));
  const book=G.exportCodebook(p),next=G.project();G.importCodebook(next,book);assert.equal(next.categories[0].label,p.categories[0].label);assert.notEqual(next.categories[0].id,p.categories[0].id);
  const invalid=G.copy(data);invalid.assignments[0].quote='Fabricated';assert.throws(()=>G.validateProject(invalid));
});
test('reports contain evidence and SVG safely escapes category text',()=>{
  const p=coded();p.categories[0].label='<script>alert(1)</script>';
  assert.ok(G.csv(p).includes('I check the list twice.'));assert.ok(G.markdown(p).includes('## Transcripts'));
  const svg=G.svg(p);assert.ok(svg.includes('&lt;script&gt;'));assert.ok(!svg.includes('<script>'));
});
test('Responses refusals, empty output and incomplete analysis are handled',()=>{
  assert.throws(()=>G.responseText({status:'incomplete'}));assert.throws(()=>G.responseText({output:[]}));assert.throws(()=>G.responseText({output:[{content:[{type:'refusal'}]}]}));
  assert.equal(G.responseText({output:[{type:'message',role:'assistant',content:[{type:'output_text',text:'{}'}]}]}),'{}');
});
