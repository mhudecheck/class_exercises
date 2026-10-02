const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');

const html = fs.readFileSync(path.join(__dirname,'../interview.html'),'utf8');
const helpers = html.slice(html.indexOf('  const MODEL ='),html.indexOf('  // Browser application:'));
const context = vm.createContext({crypto:require('node:crypto').webcrypto,URL});
vm.runInContext(helpers + '\n globalThis.helpers = {parsePersonas,matchedJobs,personaForModel,computeScore,validateStructured,validateReferences,responseText,customerInput,exportRecord,markdownRecord,PROFILE_SCHEMA,ASSESSMENT_SCHEMA,CUSTOMER_SCHEMA,VISUAL_SCHEMA,visualForPersona,dictationDraft,speechChunks,mouthShape,portraitSource,profileVoiceStyle,naturalVoice,speechEndpoint,naturalSpeechInstructions};',context);
const h = context.helpers;
const plain = value => JSON.parse(JSON.stringify(value));
const persona = {id:'p1',persona_name:'Jamie',buying_role:'Clinic administrator',demographics_background:'Runs a small clinic',face_image_data_url:'data:image/png;base64,AA==',face_prompt:'Private portrait prompt'};
const assessment = () => ({scores:{customer_life:3,past_behavior:2,listening:4},feedback:[{criterion:'customer_life',message_ids:['s1'],explanation:'Asked about the workflow.'}],suggested_improvement:'Ask for a recent example.',revised_question:'',flags:[],discoveries:[]});

test('accepts persona exports and preserves their existing fields',() => {
  const parsed = h.parsePersonas(JSON.stringify({input_text:'Clinic reminders',personas:[{...persona,motivations_goals:'Save time',decision_team:true,behaviors_needs:'Simple scheduling'}],buying_committee:[{id:'p1'}]}));
  assert.equal(parsed.businessContext,'Clinic reminders');
  assert.equal(parsed.personas[0].face_image_data_url,persona.face_image_data_url);
  assert.equal(parsed.personas[0].decision_team,true);
  assert.equal(parsed.personas[0].behaviors_needs,'Simple scheduling');
});

test('accepts saved JTBD state and matches only the selected customer’s jobs',() => {
  const parsed = h.parsePersonas(JSON.stringify({inputText:'Clinic operations',personas:[persona,{persona_name:'Alex'}],jobStories:[{persona_id:'p1',job_story:'When someone cancels, I want to refill the slot.'},{persona_name:'Alex',job_story:'When I book, I want a reminder.'}]}));
  assert.equal(parsed.businessContext,'Clinic operations');
  assert.equal(h.matchedJobs(parsed.personas[0],parsed.jobStories).length,1);
  assert.equal(h.matchedJobs(parsed.personas[1],parsed.jobStories).length,1);
});

test('repairs missing or duplicate identifiers without merging customers',() => {
  const parsed = h.parsePersonas(JSON.stringify({personas:[persona,{...persona,persona_name:'Alex'},{persona_name:'Sam'}]}));
  const ids = parsed.personas.map(p => p.id);
  assert.equal(new Set(ids).size,3);
  assert.equal(ids[0],'p1');
  assert.equal(parsed.personas[1].persona_name,'Alex');
});

test('rejects invalid imports and malformed customer fields',() => {
  for (const data of ['{','{}','{"personas":[]}','{"personas":[null]}','{"personas":[{}]}','{"personas":[{"persona_name":12}]}','{"personas":[{"persona_name":"A"}],"job_stories":{}}']) assert.throws(() => h.parsePersonas(data));
});

test('computes equal-weight totals, excludes unobserved criteria, and allows declines',() => {
  assert.deepEqual(plain(h.computeScore()),{assessed:0,total:null});
  assert.deepEqual(plain(h.computeScore({customer_life:3,past_behavior:null,listening:null})),{assessed:1,total:60});
  assert.deepEqual(plain(h.computeScore({customer_life:4,past_behavior:4,listening:4})),{assessed:3,total:80});
  assert.deepEqual(plain(h.computeScore({customer_life:2,past_behavior:1,listening:3})),{assessed:3,total:40});
});

test('validates coach scores and rejects unexpected output or nonexistent evidence',() => {
  const valid = assessment();
  h.validateStructured(valid,h.ASSESSMENT_SCHEMA);
  assert.throws(() => h.validateStructured({...valid,scores:{...valid.scores,listening:6}},h.ASSESSMENT_SCHEMA));
  assert.throws(() => h.validateStructured({...valid,hidden_profile:'leak'},h.ASSESSMENT_SCHEMA));
  assert.throws(() => h.validateReferences(valid,[{id:'s2',role:'student'}]));
  h.validateReferences(valid,[{id:'s1',role:'student'}]);
  assert.equal(valid.scores.listening,null);
});

test('detects refusals, incomplete results, and empty responses',() => {
  assert.throws(() => h.responseText({status:'incomplete',output:[]}));
  assert.throws(() => h.responseText({output:[{type:'message',role:'assistant',content:[{type:'refusal',refusal:'No'}]}]}));
  assert.throws(() => h.responseText({output:[]}));
  assert.equal(h.responseText({output:[{type:'message',role:'assistant',content:[{type:'output_text',text:'Hello'}]}]}),'Hello');
});

test('customer conversation contains only visible chat, never coach output',() => {
  const session = {transcript:[{id:'c0',role:'customer',text:'Hello'},{id:'s1',role:'student',text:'What happened last time?'}],assessments:[{result:{secret_coaching:'coach only'}}]};
  assert.deepEqual(plain(h.customerInput(session)),[{role:'assistant',content:'Hello'},{role:'user',content:'What happened last time?'}]);
  assert.equal(JSON.stringify(h.customerInput(session)).includes('coach only'),false);
});

test('exports omit settings, portraits and unrevealed scenario details',() => {
  const session = {id:'session1',status:'active',startedAt:'2026-09-30',persona,businessContext:'Clinic',learningGoals:['Understand alternatives'],jobStories:[],profile:{background:'UNREVEALED_SCENARIO'},apiKey:'TEST_CREDENTIAL',transcript:[{id:'s1',role:'student',text:'What happened last time?',createdAt:'2026-09-30'}],assessments:[{message_id:'s1',createdAt:'2026-09-30',result:assessment()}],debrief:null};
  const json = JSON.stringify(h.exportRecord(session));
  const markdown = h.markdownRecord(session);
  for (const secret of ['UNREVEALED_SCENARIO','TEST_CREDENTIAL','Private portrait prompt','data:image']){
    assert.equal(json.includes(secret),false);
    assert.equal(markdown.includes(secret),false);
  }
  assert.match(markdown,/fictional|Fictional/);
  assert.match(markdown,/What happened last time/);
});

test('avatar fallback restores older profiles and constrains generated SVG inputs',() => {
  const visual = h.visualForPersona(persona);
  h.validateStructured(visual,h.VISUAL_SCHEMA);
  assert.deepEqual(plain(h.visualForPersona(persona)),plain(visual));
  assert.equal(visual.background,'clinic');
  assert.deepEqual(plain(h.visualForPersona(persona,{...visual,hair_color:'<script>alert(1)</script>'})),plain(visual));
  assert.equal(h.visualForPersona(persona,{...visual,background:'cafe'}).background,'cafe');
});

test('customer expressions are validated and never sent to the coach or transcript exports',() => {
  h.validateStructured({reply:'That was frustrating.',expression:'concerned'},h.CUSTOMER_SCHEMA);
  assert.throws(() => h.validateStructured({reply:'Hello',expression:'<img>'},h.CUSTOMER_SCHEMA));
  const session = {persona,jobStories:[],learningGoals:[],assessments:[],transcript:[{id:'c0',role:'customer',text:'Hello',expression:'warm'}]};
  assert.deepEqual(plain(h.customerInput(session)),[{role:'assistant',content:'Hello'}]);
  assert.equal(JSON.stringify(h.exportRecord(session)).includes('expression'),false);
});

test('dictation preserves the typed draft, ignores interim results, and avoids duplicate finals',() => {
  const final = [{transcript:'What happened last time?'}];final.isFinal = true;
  const interim = [{transcript:'And then'}];interim.isFinal = false;
  assert.equal(h.dictationDraft('Tell me more.',[final,interim]),'Tell me more. What happened last time?');
  interim.isFinal = true;
  assert.equal(h.dictationDraft('Tell me more.',[final,interim]),'Tell me more. What happened last time? And then');
  assert.equal(h.dictationDraft('x'.repeat(3990),[final]).length,4000);
});

test('speech chunks preserve reply words and bound long native utterances',() => {
  for (const value of ['','Hello. How are you?',('A detailed customer reply. ').repeat(50),'x'.repeat(700)]){
    const chunks = h.speechChunks(value);
    assert.ok(chunks.every(c => c.length > 0 && c.length <= 220));
    assert.equal(chunks.join('').replace(/\s/g,''),value.replace(/\s/g,''));
  }
  assert.equal(h.mouthShape(' ').ry,1);
  assert.equal(h.mouthShape('m').ry,1);
  assert.ok(h.mouthShape('a').ry > h.mouthShape('f').ry);
});

test('portrait uses the exact imported reference and rejects executable image URLs',() => {
  for (const source of [persona.face_image_data_url,'https://example.com/customer.png','http://localhost/customer.jpg']) assert.equal(h.portraitSource({face_image_data_url:source}),source);
  for (const source of ['javascript:alert(1)','data:text/html;base64,AA==','data:image/svg+xml,<svg onload="alert(1)"/>',null]) assert.equal(h.portraitSource({face_image_data_url:source}),'');
});

test('voice matching uses explicit gender and pronouns, with neutral and manual fallbacks',() => {
  assert.equal(h.naturalVoice({gender:'female'}).voice,'marin');
  assert.equal(h.naturalVoice({pronouns:'he/him'}).voice,'cedar');
  assert.equal(h.naturalVoice({demographics_background:'A 54-year-old woman running a clinic'}).voice,'marin');
  assert.equal(h.naturalVoice({face_prompt:'Portrait of an older man'}).voice,'cedar');
  for (const p of [{persona_name:'Jessica',buying_role:'Nurse'},{gender:'nonbinary'},{pronouns:'they/them'},{demographics_background:'Works with men and women'}]) assert.equal(h.naturalVoice(p).voice,'alloy');
  assert.equal(h.naturalVoice({gender:'male'},'feminine').voice,'marin');
  const parsed = h.parsePersonas(JSON.stringify({personas:[{...persona,gender:'male',pronouns:'he/him',voice_style:'masculine'}]}));
  assert.equal(parsed.personas[0].gender,'male');assert.equal(parsed.personas[0].pronouns,'he/him');
  assert.throws(() => h.parsePersonas(JSON.stringify({personas:[{...persona,gender:{}}]})));
});

test('natural speech uses the corresponding route and longer coherent text chunks',() => {
  assert.equal(h.speechEndpoint('https://example.com/v1/responses?debug=1#key'),'https://example.com/v1/audio/speech');
  assert.equal(h.speechEndpoint('https://api.openai.com/v1/responses/'),'https://api.openai.com/v1/audio/speech');
  assert.throws(() => h.speechEndpoint('https://example.com/custom'));
  const value = ('A detailed answer about my work. ').repeat(200);
  const chunks = h.speechChunks(value,3500);
  assert.ok(chunks.every(c => c.length <= 3500));assert.equal(chunks.join('').replace(/\s/g,''),value.replace(/\s/g,''));
  assert.match(h.naturalSpeechInstructions('de-DE','concerned'),/de-DE/);
  assert.match(h.naturalSpeechInstructions('en-US','concerned'),/Mildly concerned/);
});
