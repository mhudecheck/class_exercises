/* Pure project, import, coding and export helpers. No browser dependencies. */
(function (root) {
  'use strict';
  const LEVELS = ['concept', 'theme', 'dimension'];
  const uid = prefix => prefix + '_' + (globalThis.crypto?.randomUUID?.() || Date.now().toString(36) + Math.random().toString(36).slice(2));
  const copy = value => JSON.parse(JSON.stringify(value));
  const str = value => typeof value === 'string' ? value.trim() : '';
  const normal = value => str(value).toLocaleLowerCase().replace(/\s+/g, ' ');
  const object = properties => ({type:'object', properties, required:Object.keys(properties), additionalProperties:false});
  const string = {type:'string'};
  const strings = {type:'array', items:string};
  const categoryFields = {label:string, description:string, inclusion:string, exclusion:string, examples:strings};
  const CODING_SCHEMA = object({
    new_concepts:{type:'array', items:object({key:string, ...categoryFields})},
    assignments:{type:'array', items:object({segment_id:string, category_id:string, quote:string, rationale:string})},
    uncoded_segment_ids:strings
  });
  const GROUP_SCHEMA = object({
    groups:{type:'array', items:object({existing_id:string, ...categoryFields, child_ids:strings})},
    ungrouped_ids:strings
  });
  const MERGE_SCHEMA = object({merges:{type:'array', items:object({source_id:string, target_id:string, rationale:string})}});
  function project() {
    return {format:'gioia_coding_project', version:1, id:uid('project'), title:'Interview coding project',
      researchQuestion:'', allowNew:true, interviews:[], categories:[], assignments:[], revision:0,
      analysisRevision:-1, pending:null, proposal:null, history:[]};
  }
  function roleFor(speaker) {
    return /^(interviewer|student|researcher|moderator|question|q|i)$/i.test(str(speaker)) ? 'interviewer' : 'participant';
  }
  function splitText(text, max = 2200) {
    const result = [];
    let rest = text.trim();
    while (rest.length > max) {
      let cut = rest.lastIndexOf(' ', max);
      if (cut < max / 2) cut = max;
      result.push(rest.slice(0,cut)); rest = rest.slice(cut).trimStart();
    }
    if (rest) result.push(rest);
    return result;
  }
  function parseTranscript(raw, name = 'Interview', type = 'text') {
    if (typeof raw !== 'string' || !raw.trim()) throw new Error('The transcript is empty.');
    if (raw.length > 500000) throw new Error('Split transcripts longer than 500,000 characters into smaller interviews.');
    raw = raw.replace(/\r\n?/g,'\n').replace(/^\uFEFF/, '');
    let turns = [], provenance = 'unspecified';
    if (type === 'json' || /^\s*\{/.test(raw)) {
      let data;
      try {data = JSON.parse(raw);} catch {throw new Error('Invalid JSON. Upload an interview export or paste plain transcript text.');}
      if (!Array.isArray(data.transcript) || !data.transcript.length) throw new Error('Interview JSON must contain a non-empty transcript array.');
      provenance = data.format === 'customer_interview_practice' ? 'simulated' : 'unspecified';
      turns = data.transcript.map(m => {
        if (!m || typeof m.text !== 'string' || !m.text.trim()) throw new Error('Every transcript message must have text.');
        const role = ['student','interviewer','user'].includes(m.role) ? 'interviewer' : 'participant';
        return {speaker:str(m.speaker) || (role === 'interviewer' ? 'Interviewer' : str(data.persona?.persona_name) || 'Participant'), role, text:m.text.trim()};
      });
    } else {
      const transcriptStart = /^## Transcript\s*$/m.exec(raw);
      if (transcriptStart) {
        provenance = /fictional|simulated/i.test(raw.slice(0,transcriptStart.index)) ? 'simulated' : 'unspecified';
        raw = raw.slice(transcriptStart.index + transcriptStart[0].length).split(/^## (?!#)/m)[0].trim();
      }
      let current = null;
      const flush = () => {if (current?.text.trim()) turns.push({...current, text:current.text.trim()}); current = null;};
      for (const line of raw.split('\n')) {
        const heading = /^### (.+?)(?:\s+\([^)]*\))?\s*$/.exec(line);
        const speaker = /^(?:\[\d[\d:.\s-]*\]\s*)?([A-Za-z][A-Za-z0-9 _.'’-]{0,45}):\s*(.*)$/.exec(line);
        if (heading || speaker) {
          flush(); const who = str((heading || speaker)[1]);
          current = {speaker:who, role:roleFor(who), text:speaker ? speaker[2] : ''};
        } else if (!line.trim() && current?.speaker === 'Participant') flush();
        else {
          if (!current) current = {speaker:'Participant', role:'participant', text:''};
          current.text += (current.text ? '\n' : '') + line;
        }
      }
      flush();
    }
    const segments = turns.flatMap(t => splitText(t.text).map(text => ({id:uid('segment'), speaker:t.speaker, role:t.role, text})));
    if (!segments.length) throw new Error('No transcript text was found.');
    return {id:uid('interview'), name:str(name) || 'Interview', provenance, sourceType:type, segments};
  }
  function makeChunks(interviews, max = 8000) {
    const chunks = [];
    for (const interview of interviews) {
      let segments = [], size = 0, context = '';
      const flush = () => {if (segments.length) chunks.push({interviewId:interview.id, interviewName:interview.name, segments}); segments = []; size = 0;};
      for (const segment of interview.segments) {
        if (segment.role === 'interviewer') {context = segment.text; continue;}
        if (segment.role !== 'participant') continue;
        if (size + segment.text.length + context.length > max && segments.length) flush();
        segments.push({...segment, question_context:context}); size += segment.text.length + context.length;
      }
      flush();
    }
    return chunks;
  }
  function validate(value, schema, path = 'Response') {
    const type = value === null ? 'null' : Array.isArray(value) ? 'array' : typeof value;
    if (type !== schema.type) throw new Error(path + ' has an invalid type.');
    if (schema.enum && !schema.enum.includes(value)) throw new Error(path + ' has an invalid value.');
    if (type === 'object') {
      if (Object.keys(value).some(k => !Object.hasOwn(schema.properties,k))) throw new Error(path + ' contains unexpected fields.');
      for (const k of schema.required) {
        if (!Object.hasOwn(value,k)) throw new Error(path + ' is missing ' + k + '.');
        validate(value[k],schema.properties[k],path + '.' + k);
      }
    } else if (type === 'array') value.forEach((v,i) => validate(v,schema.items,path + '[' + i + ']'));
    return value;
  }
  function responseText(data) {
    if (data.status === 'incomplete' || data.status === 'failed' || data.error) throw new Error('The model response did not complete. Retry this step.');
    let result = '';
    for (const item of data.output || []) for (const content of item.content || []) {
      if (content.type === 'refusal') throw new Error('The model declined this analysis. Your project is preserved.');
      if (item.type === 'message' && item.role === 'assistant' && content.type === 'output_text') result += content.text || '';
    }
    if (!result.trim()) throw new Error('The model returned no analysis.');
    return result;
  }
  function newCategory(fields, level = 'concept', origin = 'student') {
    if (!LEVELS.includes(level) || !str(fields.label)) throw new Error('A category needs a label and a valid level.');
    return {id:uid(level), level, label:str(fields.label), description:str(fields.description),
      inclusion:str(fields.inclusion), exclusion:str(fields.exclusion), examples:(fields.examples || []).map(str).filter(Boolean),
      parentId:null, origin, reviewed:origin === 'student'};
  }
  function assignment(p, segmentId, categoryId, quote, rationale = '', reviewed = false) {
    const interview = p.interviews.find(i => i.segments.some(s => s.id === segmentId));
    const segment = interview?.segments.find(s => s.id === segmentId);
    const category = p.categories.find(c => c.id === categoryId && c.level === 'concept');
    if (!segment || segment.role !== 'participant' || !category) throw new Error('Coding referenced an invalid passage or first-order concept.');
    if (typeof quote !== 'string' || !quote.trim() || !segment.text.includes(quote)) throw new Error('A quotation does not exactly match its source passage. Retry this step.');
    const start = segment.text.indexOf(quote);
    return {id:uid('coding'), interviewId:interview.id, segmentId, categoryId, quote, start, end:start+quote.length,
      rationale:str(rationale), reviewed, origin:reviewed ? 'student' : 'ai'};
  }
  function assignmentKey(a) {return [a.segmentId,a.categoryId,a.start,a.end].join('|');}
  function mergeCategory(p, sourceId, targetId) {
    const source = p.categories.find(c => c.id === sourceId), target = p.categories.find(c => c.id === targetId);
    if (!source || !target || source.level !== target.level || sourceId === targetId) throw new Error('Merge requires two different categories at the same level.');
    p.assignments.forEach(a => {if (a.categoryId === sourceId) a.categoryId = targetId;});
    p.categories.forEach(c => {if (c.parentId === sourceId) c.parentId = targetId;});
    p.categories = p.categories.filter(c => c.id !== sourceId);
    const seen = new Map();
    p.assignments = p.assignments.filter(a => {
      const key = assignmentKey(a);
      if (!seen.has(key)) {seen.set(key,a); return true;}
      if (a.reviewed) {seen.get(key).reviewed = true; seen.get(key).origin = 'student';}
      return false;
    });
  }
  function deleteCategory(p, id) {
    p.categories = p.categories.filter(c => c.id !== id);
    p.categories.forEach(c => {if (c.parentId === id) c.parentId = null;});
    p.assignments = p.assignments.filter(a => a.categoryId !== id);
  }
  function setParent(p, id, parentId) {
    const c = p.categories.find(c => c.id === id), parent = p.categories.find(c => c.id === parentId);
    if (!c || (parentId && (!parent || LEVELS.indexOf(parent.level) !== LEVELS.indexOf(c.level)+1))) throw new Error('A concept belongs to a theme; a theme belongs to a dimension.');
    c.parentId = parentId || null;
  }
  function applyCoding(p, chunk, result, allowNew = true) {
    validate(result,CODING_SCHEMA);
    const work = copy(p), refs = new Map(work.categories.filter(c => c.level === 'concept').map(c => [c.id,c.id]));
    const keys = new Set();
    if (!allowNew && result.new_concepts.length) throw new Error('Fixed-codebook analysis proposed new concepts. Retry the step.');
    for (const fields of result.new_concepts) {
      if (!str(fields.key) || keys.has(fields.key) || refs.has(fields.key)) throw new Error('The model returned duplicate concept keys.');
      keys.add(fields.key);
      let c = work.categories.find(c => c.level === 'concept' && normal(c.label) === normal(fields.label));
      if (!c) {c = newCategory(fields,'concept','ai'); work.categories.push(c);}
      refs.set(fields.key,c.id);
    }
    const segmentIds = new Set(chunk.segments.map(s => s.id)), seen = new Set(work.assignments.map(assignmentKey));
    for (const a of result.assignments) {
      if (!segmentIds.has(a.segment_id) || !refs.has(a.category_id)) throw new Error('Coding referenced a passage or category outside this request.');
      const row = assignment(work,a.segment_id,refs.get(a.category_id),a.quote,a.rationale);
      if (!seen.has(assignmentKey(row))) {work.assignments.push(row); seen.add(assignmentKey(row));}
    }
    for (const id of result.uncoded_segment_ids) if (!segmentIds.has(id)) throw new Error('Uncoded passage reference is invalid.');
    const covered = new Set([...result.assignments.map(a => a.segment_id), ...result.uncoded_segment_ids]);
    if ([...segmentIds].some(id => !covered.has(id))) throw new Error('The model omitted a passage. Retry this step.');
    Object.assign(p,work); return p;
  }
  function applyGroups(p, childLevel, result) {
    validate(result,GROUP_SCHEMA);
    const work = copy(p), parentLevel = LEVELS[LEVELS.indexOf(childLevel)+1], touched = new Set();
    if (!parentLevel) throw new Error('Dimensions cannot have parent categories.');
    for (const group of result.groups) {
      if (!group.child_ids.length) throw new Error('A proposed group has no supporting categories.');
      let parent = group.existing_id ? work.categories.find(c => c.id === group.existing_id && c.level === parentLevel) : null;
      if (group.existing_id && !parent) throw new Error('The proposed parent category is invalid.');
      if (!parent) parent = work.categories.find(c => c.level === parentLevel && normal(c.label) === normal(group.label));
      if (!parent) {parent = newCategory(group,parentLevel,'ai'); work.categories.push(parent);}
      for (const id of group.child_ids) {
        const child = work.categories.find(c => c.id === id && c.level === childLevel);
        if (!child || touched.has(id)) throw new Error('A hierarchy contains an invalid or duplicate child category.');
        touched.add(id);
        if (!child.reviewed || !child.parentId) setParent(work,id,parent.id);
      }
    }
    for (const id of result.ungrouped_ids) {
      const child = work.categories.find(c => c.id === id && c.level === childLevel);
      if (!child || touched.has(id)) throw new Error('Ungrouped category reference is invalid.');
      touched.add(id); if (!child.reviewed) child.parentId = null;
    }
    Object.assign(p,work); return p;
  }
  function applyMerges(p, result) {
    validate(result,MERGE_SCHEMA); const work = copy(p);
    for (const m of result.merges) {
      const source = work.categories.find(c => c.id === m.source_id);
      if (!source || source.reviewed || source.origin === 'student' || work.assignments.some(a => a.categoryId === source.id && a.reviewed)) throw new Error('Reconciliation tried to change a protected category.');
      mergeCategory(work,m.source_id,m.target_id);
    }
    Object.assign(p,work); return p;
  }
  function proposals(original, candidate) {
    const changes = [];
    const groupChanges = [];
    for (const c of candidate.categories) {
      const old = original.categories.find(o => o.id === c.id);
      if (!old) {
        changes.push({id:uid('change'),type:'category',category:copy(c)});
        if (c.parentId) groupChanges.push({id:uid('change'),type:'group',categoryId:c.id,parentId:c.parentId,oldParentId:null,protected:false});
      } else if (old.parentId !== c.parentId) groupChanges.push({id:uid('change'),type:'group',categoryId:c.id,parentId:c.parentId,oldParentId:old.parentId,protected:old.reviewed});
    }
    changes.push(...groupChanges);
    const oldKeys = new Set(original.assignments.map(assignmentKey)), nextKeys = new Set(candidate.assignments.map(assignmentKey));
    for (const a of original.assignments) if (!nextKeys.has(assignmentKey(a))) changes.push({id:uid('change'),type:'remove',assignment:copy(a),protected:a.reviewed});
    for (const a of candidate.assignments) if (!oldKeys.has(assignmentKey(a))) {
      const conflict = original.assignments.some(old => old.reviewed && old.segmentId === a.segmentId && old.start < a.end && a.start < old.end);
      changes.push({id:uid('change'),type:'add',assignment:copy(a),protected:conflict});
    }
    return {id:uid('proposal'),baseRevision:original.revision,changes,completed:true};
  }
  function acceptChange(p, change, includeProtected = false) {
    if (change.protected && !includeProtected) return false;
    if (change.type === 'category') {
      if (!p.categories.some(c => c.id === change.category.id)) p.categories.push({...copy(change.category),parentId:null});
    } else if (change.type === 'group') {
      setParent(p,change.categoryId,change.parentId);
    } else if (change.type === 'add') {
      const a = change.assignment;
      if (!p.categories.some(c => c.id === a.categoryId)) throw new Error('Accept the proposed category first.');
      const row = assignment(p,a.segmentId,a.categoryId,a.quote,a.rationale);
      if (!p.assignments.some(old => assignmentKey(old) === assignmentKey(row))) p.assignments.push(row);
    } else if (change.type === 'remove') p.assignments = p.assignments.filter(a => a.id !== change.assignment.id);
    return true;
  }
  function validateProject(data) {
    if (!data || data.format !== 'gioia_coding_project' || data.version !== 1 || !Array.isArray(data.interviews) || !Array.isArray(data.categories) || !Array.isArray(data.assignments)) throw new Error('Choose a version 1 Gioia project JSON export.');
    const p = copy(data), ids = new Set();
    const unique = id => {if (!str(id) || ids.has(id)) throw new Error('The project contains missing or duplicate IDs.'); ids.add(id);};
    unique(p.id);
    if (typeof p.title !== 'string' || typeof p.researchQuestion !== 'string') throw new Error('Invalid project details.');
    for (const i of p.interviews) {
      unique(i.id); if (typeof i.name !== 'string' || !Array.isArray(i.segments)) throw new Error('Invalid interview.');
      for (const s of i.segments) {
        unique(s.id); if (typeof s.text !== 'string' || !s.text.trim() || !['participant','interviewer','exclude'].includes(s.role) || typeof s.speaker !== 'string') throw new Error('Invalid transcript passage.');
      }
    }
    for (const c of p.categories) {
      unique(c.id);
      if (!['label','description','inclusion','exclusion'].every(k => typeof c[k] === 'string') || !Array.isArray(c.examples) || c.examples.some(e => typeof e !== 'string')) throw new Error('Invalid category criteria.');
      newCategory(c,c.level,c.origin);
      if (typeof c.reviewed !== 'boolean' || !['student','ai'].includes(c.origin)) throw new Error('Invalid category review status.');
    }
    for (const c of p.categories) setParent(p,c.id,c.parentId);
    for (const a of p.assignments) {
      if (typeof a.reviewed !== 'boolean' || !['student','ai'].includes(a.origin)) throw new Error('Invalid coding review status.');
      unique(a.id); const validated = assignment(p,a.segmentId,a.categoryId,a.quote,a.rationale,a.reviewed);
      if (a.interviewId !== validated.interviewId || a.start !== validated.start || a.end !== validated.end) throw new Error('The project contains an invalid quotation reference.');
    }
    p.pending = null; p.proposal = null;
    p.revision = Number.isInteger(p.revision) ? p.revision : 0;
    p.analysisRevision = Number.isInteger(p.analysisRevision) ? p.analysisRevision : -1;
    p.history = Array.isArray(p.history) ? p.history : [];
    p.allowNew = p.allowNew !== false; return p;
  }
  function exportProject(p) {
    const data = copy(p); data.pending = null; data.proposal = null; return data;
  }
  function exportCodebook(p) {
    return {format:'gioia_codebook',version:1,categories:copy(p.categories)};
  }
  function importCodebook(p, data) {
    if (data?.format !== 'gioia_codebook' || data.version !== 1 || !Array.isArray(data.categories)) throw new Error('Choose a version 1 Gioia codebook JSON export.');
    const work = copy(p), map = new Map();
    for (const c of data.categories) {
      if (!str(c.id) || map.has(c.id)) throw new Error('Codebook contains duplicate or missing IDs.');
      const category = newCategory(c,c.level,'student'); work.categories.push(category); map.set(c.id,category.id);
    }
    for (const c of data.categories) {
      if (c.parentId && !map.has(c.parentId)) throw new Error('Codebook has an invalid parent reference.');
      setParent(work,map.get(c.id),c.parentId ? map.get(c.parentId) : null);
    }
    Object.assign(p,work);
  }
  function rowDetails(p,a) {
    const interview = p.interviews.find(i => i.id === a.interviewId), segment = interview.segments.find(s => s.id === a.segmentId);
    const concept = p.categories.find(c => c.id === a.categoryId), theme = p.categories.find(c => c.id === concept.parentId), dimension = p.categories.find(c => c.id === theme?.parentId);
    return {interview:interview.name,speaker:segment.speaker,quote:a.quote,concept:concept.label,theme:theme?.label || '',dimension:dimension?.label || '',rationale:a.rationale,status:a.reviewed ? 'Reviewed' : 'AI draft',source:interview.provenance};
  }
  function csv(p) {
    const columns = ['interview','speaker','quote','concept','theme','dimension','rationale','status','source'];
    const cell = v => '"' + String(v ?? '').replace(/^[=+\-@\t\r]/, "'$&").replace(/"/g,'""') + '"';
    return [columns.join(','),...p.assignments.map(a => {const row = rowDetails(p,a);return columns.map(k=>cell(row[k])).join(',');})].join('\r\n');
  }
  function markdown(p) {
    const lines = ['# ' + p.title,'','AI-assisted Gioia coding; student review is required.','',p.researchQuestion ? 'Research question: ' + p.researchQuestion : '','## Codebook',''];
    for (const c of p.categories) lines.push('### ' + c.label + ' (' + c.level + ')',c.description,'','Include: ' + c.inclusion,'Exclude: ' + c.exclusion,'Examples: ' + c.examples.join('; '),'');
    lines.push('## Coded quotations','');
    for (const a of p.assignments) {const r = rowDetails(p,a);lines.push('### ' + r.interview + ' · ' + r.speaker,'> ' + r.quote.replace(/\n/g,'\n> '),'',r.concept + ' → ' + (r.theme || 'Ungrouped') + ' → ' + (r.dimension || 'Ungrouped'),r.rationale,r.status + ' · Source: ' + r.source,'');}
    lines.push('## Transcripts','');
    for (const i of p.interviews) {lines.push('### ' + i.name,'Source: ' + i.provenance,'');for(const s of i.segments) lines.push('**' + s.speaker + ' (' + s.role + ')**',s.text,'');}
    return lines.join('\n');
  }
  const escapeXML = value => String(value).replace(/[<>&"']/g,c=>({'<':'&lt;','>':'&gt;','&':'&amp;','"':'&quot;',"'":'&apos;'}[c]));
  function svg(p) {
    const groups = LEVELS.map(level=>p.categories.filter(c=>c.level===level));
    const height = Math.max(220,120+Math.max(...groups.map(g=>g.length))*85), positions = new Map();
    let content = '<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="' + height + '" viewBox="0 0 1200 ' + height + '" role="img"><title>' + escapeXML(p.title) + ' — Gioia data structure</title><rect width="100%" height="100%" fill="#f5f7fb"/>';
    ['First-order concepts','Second-order themes','Aggregate dimensions'].forEach((label,col)=>{content+='<text x="'+(25+col*400)+'" y="38" font-family="Arial" font-size="20" fill="#0f172a">'+label+'</text>';});
    groups.forEach((list,col)=>list.forEach((c,row)=>positions.set(c.id,{x:25+col*400,y:70+row*85})));
    for (const c of p.categories) if (c.parentId && positions.has(c.parentId)) {
      const a=positions.get(c.id),b=positions.get(c.parentId);content+='<path d="M'+(a.x+345)+' '+(a.y+30)+' C'+(a.x+375)+' '+(a.y+30)+','+(b.x-30)+' '+(b.y+30)+','+b.x+' '+(b.y+30)+'" fill="none" stroke="#93b4f7" stroke-width="2"/>';
    }
    for (const c of p.categories) {
      const pos=positions.get(c.id), words=c.label.split(/\s+/), lines=[''];
      for(const word of words){if((lines.at(-1)+' '+word).length>40&&lines.at(-1))lines.push('');lines[lines.length-1]+=(lines.at(-1)?' ':'')+word;}
      content+='<g><title>'+escapeXML(c.label)+'</title><rect x="'+pos.x+'" y="'+pos.y+'" width="345" height="65" rx="12" fill="white" stroke="#cbd5e1"/>';
      lines.slice(0,3).forEach((line,k)=>{content+='<text x="'+(pos.x+12)+'" y="'+(pos.y+20+k*17)+'" font-family="Arial" font-size="13" fill="#0f172a">'+escapeXML(line+(k===2&&lines.length>3?'…':''))+'</text>';});content+='</g>';
    }
    return content+'</svg>';
  }
  root.Gioia = {LEVELS,uid,copy,str,normal,project,roleFor,parseTranscript,makeChunks,validate,responseText,newCategory,
    assignment,assignmentKey,mergeCategory,deleteCategory,setParent,applyCoding,applyGroups,applyMerges,proposals,acceptChange,
    validateProject,exportProject,exportCodebook,importCodebook,rowDetails,csv,markdown,svg,CODING_SCHEMA,GROUP_SCHEMA,MERGE_SCHEMA};
  if (typeof module !== 'undefined') module.exports = root.Gioia;
})(globalThis);
