import { fillEquipmentForm } from './wasm/forms.mjs';
import { uiText, uiFormat } from './ui-language.mjs';
import { EQUIPMENT_TYPES, EQUIPMENT_LABELS, normalizeEquipmentDefinition, equipmentReferences, equipmentMotionGroups, equipmentCommandOptions } from './equipment-core.mjs?v=20261107-object-home-1';

const groups = { movingRef: '이동 대상', secondRef: '반대쪽 손가락 부품', carriedRef: '테이블 위 탑재물', filmGripRef: '같은 필름의 손잡이 부품' };
const numeric = {
 travel:['이동 거리 (mm)',100], speed:['이동 속도 (mm/s)',100], reverseSpeed:['복귀 속도',100],
 openWidth:['열렸을 때 간격 (mm)',80], closedWidth:['최소 닫힘 간격 (mm)',0], gripDepth:['파지 영역 폭 (mm)',80], gripHeight:['파지 영역 높이 (mm)',80],
 filmLength:['필름 길이 (mm)',300], filmWidth:['필름 폭 (mm)',100], filmGripOffset:['손잡이 위치 (0~100%)',50], filmGripWidth:['손잡이 파지 폭 (mm)',20], filmStiffness:['굽힘 강성',0.05], filmDamping:['감쇠',0.96], externalAxis:['로봇 E축 (0=독립)',0],
 feedbackHome:['복귀 완료 Input 번호',''], feedbackEnd:['동작 완료 Input 번호',''], feedbackGrip:['파지 감지 Input 번호','']
};
function equipmentMessage(message) {
 const range = message.match(/^(.+): (-?[\d.]+)~(-?[\d.]+) 범위의 숫자를 입력하세요\.$/);
 if (range) return uiFormat('{name}: {min}~{max} 범위의 숫자를 입력하세요.', { name: uiText(range[1]), min: range[2], max: range[3] });
 const conflict = '센서 입력 주소가 다른 설비와 중복됩니다.';
 if (message.startsWith(conflict + ' Input[')) return uiText(conflict) + message.slice(conflict.length);
 return uiText(message);
}
export function createEquipmentUi(adapter) {
 const dialog=document.createElement('dialog'); dialog.id='equipment-dialog'; dialog.className='equipment-dialog'; dialog.setAttribute('aria-label','동작 설정');
 fillEquipmentForm(dialog);
 // Keep the reset action visible without expanding the registration list.
 const globalToolbar=dialog.querySelector('[data-equipment-global="reset"]').closest('.equipment-toolbar');
 dialog.querySelector('#equipment-registered').after(globalToolbar);
 dialog.querySelector('[data-equipment-global="reset"]').title='설비를 초기화하고 모든 등록 오브젝트를 기준 위치·회전으로 되돌립니다. 무작위 원위치를 켠 오브젝트는 지정 범위 안에서 틀어서 놓습니다.';
 document.body.append(dialog);
 const form=dialog.querySelector('form'), basic=dialog.querySelector('#equipment-basic'), extra=dialog.querySelector('#equipment-extra');
 let lastMessage='';
 const error=message=>{lastMessage=message;dialog.querySelector('#equipment-error').textContent=equipmentMessage(message);};
 const objectReset=document.createElement('button');objectReset.id='equipment-object-reset';objectReset.type='button';objectReset.textContent='오브젝트 원위치';objectReset.hidden=true;objectReset.disabled=true;
 dialog.querySelector('#equipment-new').before(objectReset);
 objectReset.addEventListener('click',()=>{try{adapter.command(form.elements.id.value,'RESET');updateStatus();}catch(exception){error(exception.message);}});
 const homeSaved='현재 위치·회전을 원위치로 등록했습니다. 오브젝트 원위치를 누르면 이 위치로 돌아옵니다.';
 const objectHome=document.createElement('button');objectHome.id='equipment-object-set-home';objectHome.type='button';objectHome.textContent='원위치로 등록';objectHome.title='오브젝트의 현재 위치·회전을 원위치로 다시 등록합니다.';objectHome.hidden=true;objectHome.disabled=true;
 objectReset.after(objectHome);
 objectHome.addEventListener('click',()=>{try{adapter.command(form.elements.id.value,'SET_HOME');error(homeSaved);}catch(exception){error(exception.message);}});
 const selected=Object.fromEntries(Object.keys(groups).map(key=>[key,new Set()]));
 let targetRef='', signature='', currentConveyor=null, vacuumFace=null, nameEdited=false;
 [...EQUIPMENT_TYPES,'CONVEYOR'].forEach(type=>form.elements.type.add(new Option(EQUIPMENT_LABELS[type]||'컨베이어 이송',type)));
 for(const [key,[label,value]] of Object.entries(numeric)) {
  const field=document.createElement('label'); const caption=document.createElement('span'); caption.textContent=label; field.append(caption);
  const input=document.createElement('input'); input.type='number'; input.step='any'; input.name=key; input.value=value; field.append(input);
  (key.startsWith('feedback')?dialog.querySelector('#equipment-io'):['travel','speed'].includes(key)?basic:extra).append(field);
 }
 for(const [key,label] of Object.entries({bodyRef:'고정부 / 기준 모델 (생략 가능)',robotRef:'연결 로봇',pullerRef:'필름을 잡는 그리퍼 / 파지 모델'})) {
  const field=document.createElement('label'); field.textContent=label; const select=document.createElement('select'); select.name=key; field.append(select); extra.append(field);
 }
 const sideField=document.createElement('label');sideField.textContent='손잡이가 있는 변';const sideSelect=document.createElement('select');sideSelect.name='filmGripSide';for(const [value,label]of [['X-','X 시작 변'],['X+','X 끝 변'],['Y-','Y 아래 변'],['Y+','Y 위 변']])sideSelect.add(new Option(label,value));sideField.append(sideSelect);extra.append(sideField);
 for(const prefix of ['pivot','gripCenter']) for(const [i,axis] of ['X','Y','Z'].entries()) {
  const field=document.createElement('label'); field.textContent=(prefix==='pivot'?'회전 중심 ':'파지 중심 ')+axis+' (mm)';
  const input=document.createElement('input'); input.name=prefix+axis; input.type='number'; input.step='any'; input.value=prefix==='gripCenter'&&i===2?40:0; field.append(input); extra.append(field);
 }
 for(const [role,label] of Object.entries(groups)) {
  if(['movingRef','secondRef'].includes(role))continue;
  const panel=document.createElement('div'); panel.dataset.equipmentRole=role; panel.className='equipment-part-group';
  const heading=document.createElement('strong'); heading.textContent=label; const filter=document.createElement('input'); filter.type='search'; filter.placeholder='모델 / 부품 이름 검색';
  const pick=document.createElement('button'); pick.type='button'; pick.textContent='모델 트리에서 추가'; pick.addEventListener('click',()=>{pendingRole=pendingRole===role?null:role; for(const button of dialog.querySelectorAll('[data-equipment-role] button'))button.textContent=button.closest('[data-equipment-role]').dataset.equipmentRole===pendingRole?'선택 완료':'모델 트리에서 추가'; error(pendingRole?'추가할 부품을 모델 트리에서 클릭하세요. 우클릭의 “이동 대상으로 체크”도 사용할 수 있습니다.':'부품 선택을 마쳤습니다. 동작 저장을 눌러 적용하세요.');});
  const list=document.createElement('div'); list.className='equipment-part-options';
  panel.append(heading,pick,filter,list);if(role==='filmGripRef'){const help=document.createElement('p');help.className='equipment-help';help.textContent='같은 필름에 달린 손잡이를 모두 추가하세요. 그리퍼가 가까운 손잡이 하나를 잡으면 나머지 손잡이도 필름과 함께 움직입니다. 그리퍼를 연결하면 당긴 위치에 따라 박리됩니다.';panel.insertBefore(help,filter);} filter.addEventListener('input',()=>{for(const row of list.querySelectorAll('label')) row.hidden=!row.dataset.search.toLowerCase().includes(filter.value.toLowerCase());});
  extra.append(panel);
 }

 const faceSection=document.createElement('fieldset');faceSection.id='equipment-vacuum-surface';
 faceSection.innerHTML='<legend>흡착 범위</legend><label>흡착 방식<select name="vacuumMode"><option value="FACE">선택한 면</option><option value="WHOLE">선택한 모델 / 부품 전체</option></select></label><button type="button" id="equipment-pick-face">흡착 면 선택</button><p class="equipment-help" id="equipment-face-status"></p>';
 basic.closest('fieldset').after(faceSection);
 const facePick=faceSection.querySelector('button'),faceStatus=faceSection.querySelector('p');
 const io=dialog.querySelector('#equipment-io'),condition=document.createElement('div'),commands=document.createElement('div'),feedback=document.createElement('div');
 condition.className='equipment-io-condition';commands.className='equipment-io-commands';feedback.className='equipment-io-feedback';
 condition.append(form.elements.ioTrigger.parentElement);commands.append(form.elements.forwardAddress.parentElement,form.elements.reverseAddress.parentElement);
 for(const key of ['feedbackHome','feedbackEnd','feedbackGrip'])feedback.append(form.elements[key].parentElement);
 const resetAllField=document.createElement('label');resetAllField.className='equipment-check';resetAllField.innerHTML='<input type="checkbox" name="resetAll"><span>모든 등록 오브젝트 원위치</span>';resetAllField.title='체크하면 이 Output 하나로 등록된 오브젝트 전체를 원위치합니다.';
 commands.append(resetAllField);
 io.append(condition,commands,feedback);
 const ioSection=io.closest('fieldset'),randomSection=document.createElement('fieldset');randomSection.id='equipment-random-home';
 randomSection.innerHTML='<legend>3. 무작위 원위치 (선택)</legend><label class="equipment-check"><input type="checkbox" name="randomHome"><span>원위치할 때 무작위로 틀어서 놓기</span></label><div class="equipment-fields equipment-random-range"><label><span>X 범위 ± (mm)</span><input type="number" name="randomRangeX" min="0" max="10000" step="any"></label><label><span>Y 범위 ± (mm)</span><input type="number" name="randomRangeY" min="0" max="10000" step="any"></label><label><span>회전 범위 ± (°)</span><input type="number" name="randomRangeRz" min="0" max="180" step="any"></label></div><p class="equipment-help">원위치할 때마다 등록 위치에서 World X·Y 이동과 수직(Z)축 회전을 범위 안에서 무작위로 적용합니다. 비전 위치 보정 시험에 사용하세요.</p>';
 ioSection.after(randomSection);
 const randomKeys=['randomRangeX','randomRangeY','randomRangeRz'],randomDefaults={randomRangeX:10,randomRangeY:10,randomRangeRz:5};
 const syncRandom=()=>{for(const key of randomKeys)form.elements[key].disabled=!form.elements.randomHome.checked;};
 form.elements.randomHome.addEventListener('change',syncRandom);
 form.elements.name.addEventListener('input',()=>{nameEdited=true;});
 form.elements.vacuumMode.addEventListener('change',fields);
 facePick.addEventListener('click',()=>{try{
  const ref=[...selected.movingRef][0]||targetRef;
  adapter.pickFace(ref,result=>{if(result){selected.movingRef=new Set([result.ref]);targetRef=result.ref;vacuumFace=result.face;}fields();references(true);updateName();show();});
  dialog.close();
 }catch(exception){error(exception.message);}});
 let pendingRole=null;
 const detachedFields=[];
 // These fields leave the form when their motion type is inactive. Reattach
 // their original captions so the locale observer can translate them again.
 const fieldCaptions=new Map();
 for (const field of [form.elements.axis.parentElement, form.elements.travel.parentElement,
  form.elements.speed.parentElement, dialog.querySelector('#equipment-advanced'), randomSection, faceSection]) {
  const captions=[];
  const walker=document.createTreeWalker(field, NodeFilter.SHOW_TEXT);
  for (let node=walker.nextNode(); node; node=walker.nextNode()) {
   if (node.data.trim()) captions.push([node, node.data]);
  }
  for (const input of field.querySelectorAll('[placeholder]')) {
   const attribute=input.getAttributeNode('placeholder');
   captions.push([attribute, attribute.value]);
  }
  fieldCaptions.set(field, captions);
 }
 function restoreFields() {
  const restored=detachedFields.length>0;
  for(const {field,marker} of detachedFields) {
   for (const [node,source] of fieldCaptions.get(field)) node.nodeValue=source;
   marker.replaceWith(field);
  }
  detachedFields.length=0;return restored;
 }
 function detachField(field) {
  const marker=dialog.ownerDocument.createComment('type-specific equipment field');
  field.replaceWith(marker);detachedFields.push({field,marker});
 }
 function references(force=false) {
  const all=adapter.references(), next=JSON.stringify([all,Object.values(selected).map(refs=>[...refs])]); if(!force&&next===signature)return; signature=next;
  for(const key of ['bodyRef','robotRef','pullerRef']) {
   const select=form.elements[key];if(!select)continue;const old=select.value; select.replaceChildren(new Option('선택 안 함',''));
   (key==='robotRef'?adapter.references(true):all).forEach(ref=>select.add(new Option(ref.label,ref.value))); select.value=old;
  }
  for(const role of Object.keys(groups)) {
   const list=dialog.querySelector('[data-equipment-role="'+role+'"] .equipment-part-options'); if(!list)continue;list.replaceChildren();
   const included=new Set(selected[role]);
   for(const value of selected[role]) {
    let ref=all.find(item=>item.value===value);
    const ancestors=new Set([value]);
    while(ref?.parentValue&&!ancestors.has(ref.parentValue)){ancestors.add(ref.parentValue);included.add(ref.parentValue);ref=all.find(item=>item.value===ref.parentValue);}
   }
   const displayed=all.filter(ref=>included.has(ref.value));
   const visited=new Set();
   function appendReference(ref, container) {
    if(visited.has(ref.value))return; visited.add(ref.value);
    if(!selected[role].has(ref.value)) {
     const context=document.createElement('span');context.className='equipment-part-context';context.textContent=ref.partLabel||ref.label;
     appendChildren(ref,context,container);return;
    }
    const row=document.createElement('label'), box=document.createElement('input'); box.type='checkbox'; box.value=ref.value; box.checked=true;
    row.dataset.search=ref.label; row.dataset.equipmentRef=ref.value;
    box.addEventListener('change',event=>{if(box.checked)selected[role].add(ref.value);else selected[role].delete(ref.value);adapter.select?.(ref.value,event.shiftKey);references(true);updateName();});
    const name=document.createElement('span');name.textContent=ref.partLabel||ref.label;name.setAttribute('role','button');name.setAttribute('aria-label',name.textContent);name.tabIndex=0;name.title=ref.label+' · '+uiText('외곽선 선택');
    name.addEventListener('click',event=>{event.preventDefault();adapter.select?.(ref.value,event.shiftKey);});
    name.addEventListener('keydown',event=>{if(['Enter',' '].includes(event.key)){event.preventDefault();adapter.select?.(ref.value,event.shiftKey);}});
    row.append(box,name);
    appendChildren(ref,row,container);
   }
   function appendChildren(ref,row,container) {
    const children=displayed.filter(item=>item.parentValue===ref.value);
    if(children.length){const branch=document.createElement('details');branch.open=true;const summary=document.createElement('summary');summary.append(row);branch.append(summary);const nested=document.createElement('div');nested.className='equipment-part-children';branch.append(nested);container.append(branch);const folders=new Map();for(const child of children){let parent=nested;if(child.group){if(!folders.has(child.groupKey??child.group)){const folder=document.createElement('details'),title=document.createElement('summary');folder.open=true;title.textContent=child.group;const contents=document.createElement('div');contents.className='equipment-part-children equipment-folder-children';folder.append(title,contents);nested.append(folder);folders.set(child.groupKey??child.group,contents);}parent=folders.get(child.groupKey??child.group);}appendReference(child,parent);}}
    else container.append(row);
   }
   displayed.filter(ref=>!ref.parentValue||!displayed.some(item=>item.value===ref.parentValue)).forEach(ref=>appendReference(ref,list));
   displayed.forEach(ref=>appendReference(ref,list));
   if(!selected[role].size){const empty=document.createElement('p');empty.className='equipment-help';empty.textContent='모델 트리에서 항목을 선택해 추가하세요.';list.append(empty);}
  }
  return true;
 }
 function defaultName(localized) {
  const type = EQUIPMENT_LABELS[form.elements.type.value] || '컨베이어 이송';
  const ref = adapter.references().find(item => item.value === ([...selected.movingRef][0] || targetRef));
  return (localized ? uiText(type) : type) + ' / ' + (ref?.label || (localized ? uiText('모델') : '모델'));
 }
 function updateName() { if (!nameEdited) form.elements.name.value = defaultName(true); }
 function updateTargetLabel() {
  const def = currentConveyor || adapter.definitions().find(item => item.id === form.elements.id.value);
  const name = adapter.references().find(item => item.value === targetRef)?.label || uiText('선택 부품');
  dialog.querySelector('#equipment-target-label').textContent = def
   ? uiFormat('편집 중 · {name} · 변경 저장을 눌러 적용하세요.', {name: adapter.label?.(def) || def.name})
   : targetRef ? uiFormat('새 동작 · 대상: {name}', {name}) : uiText('모델 트리의 항목을 우클릭해서 동작을 설정하세요.');
 }

 function fields() {
  if(restoreFields())references(true);
  const type=form.elements.type.value, rotary=type==='ROTARY_AXIS', conveyor=type==='CONVEYOR', object=type==='OBJECT', vacuum=type==='VACUUM', simple=object||vacuum;
  const visible=(key,value)=>{form.elements[key].parentElement.hidden=!value;};
  for(const key of ['openWidth','closedWidth','gripDepth','gripHeight','feedbackHome','feedbackEnd'])visible(key,!simple&&!conveyor&&!['openWidth','closedWidth','gripDepth','gripHeight'].includes(key));
  visible('feedbackGrip',vacuum);form.elements.feedbackGrip.parentElement.firstChild.textContent='흡착 감지 Input 번호';visible('externalAxis',['LINEAR_AXIS','ROTARY_AXIS'].includes(type));
  visible('robotRef',['LINEAR_AXIS','ROTARY_AXIS','FILM_PEEL'].includes(type));visible('bodyRef',!simple&&!conveyor);
  for(const key of ['pullerRef','filmGripSide','filmGripOffset','filmGripWidth','filmLength','filmWidth','filmStiffness','filmDamping'])visible(key,type==='FILM_PEEL');
  dialog.querySelector('[data-equipment-role="filmGripRef"]').hidden=type!=='FILM_PEEL';
  dialog.querySelector('[data-equipment-role="carriedRef"]').hidden=!['LINEAR_AXIS','ROTARY_AXIS'].includes(type);
  visible('axis',!simple&&type!=='FILM_PEEL');visible('speed',!simple&&!(type==='FILM_PEEL'&&(form.elements.pullerRef.value||form.elements.robotRef.value)));
  visible('travel',!simple&&!conveyor&&type!=='FILM_PEEL');visible('reverseSpeed',!simple&&!conveyor&&!['CYLINDER'].includes(type));
  form.elements.travel.parentElement.firstChild.textContent=rotary?'회전 각도 (°)':'이동 거리 (mm)';
  form.elements.speed.parentElement.firstChild.textContent=rotary?'회전 속도 (°/s)':'이동 속도 (mm/s)';
  for(const axis of ['X','Y','Z']){visible('pivot'+axis,rotary);visible('gripCenter'+axis,false);}
  const words=object?['원위치','']:vacuum?['진공','파기']:type==='FILM_PEEL'?['박리','']:conveyor?['이송','']:['전진','후진'];
  resetAllField.hidden=!object;syncRandom();
  dialog.querySelector('#equipment-forward-label').textContent=words[0]+' Output 번호';dialog.querySelector('#equipment-reverse-label').textContent=words[1]+' Output 번호';dialog.querySelector('#equipment-reverse-field').hidden=!words[1];
  const editing=!!form.elements.id.value;objectReset.hidden=objectHome.hidden=!object;objectReset.disabled=objectHome.disabled=!editing;
  dialog.querySelector('.equipment-header h2').textContent=object?(editing?'오브젝트 편집':'오브젝트 등록'):(editing?'동작 편집':'동작 설정');
  form.querySelector('button[type="submit"]').textContent=object?(editing?'등록 변경 저장':'오브젝트 등록'):(editing?'변경 저장':'동작 저장');
  ioSection.querySelector('legend').textContent=object?'2. 원위치 IO (선택)':'2. IO 연결 (선택)';
  ioSection.querySelector('.equipment-help').textContent=object?'Output이 동작 조건으로 바뀔 때 이 오브젝트를 원위치합니다. 모든 등록 오브젝트 원위치를 체크하면 등록된 오브젝트 전체를 원위치합니다.':vacuum?'진공 신호가 한 번 들어오면 파기 신호까지 유지됩니다. 진공을 켤 때만 2mm 이내의 등록 오브젝트를 검색합니다.':'프로그램 실행 없이 IO 테스트 버튼으로도 동작합니다.';
  faceSection.hidden=!vacuum;facePick.hidden=form.elements.vacuumMode.value!=='FACE';
  faceStatus.textContent=form.elements.vacuumMode.value==='WHOLE'?'선택한 모델 또는 부품 전체에서 2mm 이내의 오브젝트를 찾습니다.':vacuumFace?'흡착 면이 선택되었습니다.':'흡착 면 선택을 누른 뒤 3D 화면의 면을 클릭하세요.';
  if(simple){for(const key of ['axis','travel','speed'])detachField(form.elements[key].parentElement);detachField(dialog.querySelector('#equipment-advanced'));}
  if(object)detachField(faceSection);else{detachField(randomSection);if(!vacuum)detachField(faceSection);}
 }
 function edit(def=null, ref=targetRef) {
  restoreFields();
  targetRef=ref||''; currentConveyor=def?.type==='CONVEYOR'?def:null; form.reset(); pendingRole=null; for(const button of dialog.querySelectorAll('[data-equipment-role] button'))button.textContent='모델 트리에서 추가';
  dialog.dataset.mode=def?'edit':'new';dialog.querySelector('.equipment-header h2').textContent=def?'동작 편집':'동작 설정';form.querySelector('button[type="submit"]').textContent=def?'변경 저장':'동작 저장';
  const sceneSelection=adapter.selectedReferences?.()||[];
  for(const key of Object.keys(groups))selected[key]=new Set(def?equipmentReferences(def,key):key==='movingRef'&&targetRef?(sceneSelection.includes(targetRef)?sceneSelection:[targetRef]):[]);
  form.elements.id.value=def?.id||'';form.elements.type.value=def?.type||'CYLINDER';form.elements.axis.value=def?.axis||'X';form.elements.name.value=def?.name||adapter.references().find(item=>item.value===targetRef)?.label||'';
  vacuumFace=def?.vacuumFace?JSON.parse(JSON.stringify(def.vacuumFace)):null;nameEdited=def?.customName===true;form.elements.vacuumMode.value=def?.vacuumMode||'FACE';
  references(true);
  for(const key of ['bodyRef','robotRef','pullerRef'])form.elements[key].value=def?.[key]||'';
  form.elements.filmGripSide.value=def?.filmGripSide||'X-';
  for(const [key,[,value]]of Object.entries(numeric))form.elements[key].value=def?.[key]??value;
  ['X','Y','Z'].forEach((axis,i)=>{form.elements['pivot'+axis].value=def?.pivot?.[i]||0;form.elements['gripCenter'+axis].value=def?.gripCenter?.[i]??(i===2?40:0);});
  const bindings=adapter.bindings(def,targetRef)||{};form.elements.ioTrigger.value=bindings.triggerValue??1;form.elements.forwardAddress.value=bindings.forward??'';form.elements.reverseAddress.value=bindings.reverse??'';form.elements.resetAll.checked=bindings.resetAll===true;
  form.elements.randomHome.checked=def?.randomHome===true;for(const key of randomKeys)form.elements[key].value=def?.[key]??randomDefaults[key];
  updateTargetLabel();
  fields();updateName();render();error('');dialog.scrollTop=0;
 }
 form.elements.type.addEventListener('change',()=>{
  // A different kind is another action on the same tool, not a replacement.
  if(form.elements.id.value){
   form.elements.id.value='';currentConveyor=null;dialog.dataset.mode='new';
   updateTargetLabel();
  }
  restoreFields();
  for(const key of ['feedbackHome','feedbackEnd','feedbackGrip'])form.elements[key].value='';
  if(!['VACUUM','OBJECT'].includes(form.elements.type.value))for(const key of ['travel','speed','reverseSpeed'])if(Number(form.elements[key].value)<=0)form.elements[key].value=numeric[key][1];
  fields();updateName();render();error('');
 });
 for(const key of ['pullerRef','robotRef'])form.elements[key].addEventListener('change',fields);
 form.addEventListener('submit',event=>{event.preventDefault();try{
  const raw=Object.fromEntries(new FormData(form));raw.id ||= 'equipment-'+Date.now().toString(36)+'-'+Math.random().toString(36).slice(2,7);
  if(raw.type!=='VACUUM')raw.feedbackGrip=null;raw.vacuumFace=vacuumFace;raw.customName=nameEdited&&!!raw.name.trim();if(!raw.customName)nameEdited=false;
  for(const key of Object.keys(groups)){raw[key+'s']=[...selected[key]];raw[key]=raw[key+'s'][0]||'';}
  if(!['OBJECT','VACUUM'].includes(raw.type)){raw.pivot=['X','Y','Z'].map(axis=>form.elements['pivot'+axis].value);raw.gripCenter=['X','Y','Z'].map(axis=>form.elements['gripCenter'+axis].value);}
  if(raw.type==='FILM_PEEL')raw.travel=raw.filmLength;
  if(raw.type==='OBJECT'){raw.randomHome=form.elements.randomHome.checked;for(const key of randomKeys)raw[key]=form.elements[key].value;}
  raw.name = raw.customName ? form.elements.name.value : defaultName(false); if(['CYLINDER','GRIPPER'].includes(raw.type))raw.reverseSpeed=raw.speed; const bindings={direction:'OUT',triggerValue:Number(raw.ioTrigger),forward:raw.forwardAddress,reverse:raw.type==='OBJECT'?null:raw.reverseAddress,resetAll:raw.type==='OBJECT'&&form.elements.resetAll.checked};
  const saved=raw.type==='CONVEYOR'?adapter.saveConveyor(raw,bindings):adapter.save(normalizeEquipmentDefinition(raw),bindings);
  edit(saved,targetRef);error(raw.type==='OBJECT'?'오브젝트를 등록했습니다. Tool의 진공 동작으로 흡착할 수 있습니다.':'동작을 저장했습니다. 시험 버튼 또는 연결한 IO로 운전할 수 있습니다.');
 }catch(exception){error(exception.message);}});
 function controls(def,container) {
  const row=document.createElement('div');row.className='equipment-list-row';row.dataset.equipmentId=def.id;
  const title=document.createElement('strong');title.textContent=adapter.label?.(def)||def.name;const status=document.createElement('span');status.dataset.equipmentStatus=def.id;row.append(title,status);
  const actions=document.createElement('div');actions.className='equipment-test-actions';const management=document.createElement('div');management.className='equipment-management-actions';row.append(actions,management);
  for(const [command,label]of [...equipmentCommandOptions(def.type),...(def.type==='OBJECT'?[['SET_HOME','원위치로 등록']]:[]),['EDIT','편집'],['DELETE',def.type==='OBJECT'?'등록 해제':'동작 삭제']]) {
   const button=document.createElement('button');button.type='button';button.textContent=label;button.dataset.equipmentCommand=command;if(command==='SET_HOME')button.title=objectHome.title;
   button.addEventListener('click',()=>{try{if(command==='EDIT')edit(def,def.movingRef);else if(command==='DELETE'){adapter.remove(def.id);edit(null,targetRef);}else{adapter.command(def.id,command);if(command==='SET_HOME')error(homeSaved);}updateStatus();}catch(exception){error(exception.message);}});(['EDIT','DELETE','SET_HOME'].includes(command)||def.type==='OBJECT'&&command==='RESET'?management:actions).append(button);
  }container.append(row);
 }
 function conveyorControls(def,container){
  const row=document.createElement('div');row.className='equipment-list-row';row.dataset.equipmentId=def.id;const title=document.createElement('strong');title.textContent=adapter.label?.(def)||def.name;row.append(title);
  const actions=document.createElement('div');actions.className='equipment-test-actions';const management=document.createElement('div');management.className='equipment-management-actions';row.append(actions,management);
  for(const [command,label]of [['FORWARD','이송'],['STOP','정지'],['EDIT','편집'],['DELETE','동작 삭제']]){const button=document.createElement('button');button.type='button';button.textContent=label;button.dataset.conveyorCommand=command;button.addEventListener('click',()=>{if(command==='EDIT')edit(def,def.movingRef);else adapter.conveyorCommand(def.movingRef,command);if(command==='DELETE')edit(null,def.movingRef);});(['EDIT','DELETE'].includes(command)?management:actions).append(button);}container.append(row);
 }
 function render(){const list=dialog.querySelector('#equipment-list'),current=dialog.querySelector('#equipment-current-controls');list.replaceChildren();current.replaceChildren();if(currentConveyor)conveyorControls(currentConveyor,current);adapter.definitions().filter(def=>EQUIPMENT_TYPES.includes(def.type)).forEach(def=>controls(def,def.id===form.elements.id.value?current:list));if(findDefinitions(targetRef).length>1)dialog.querySelector('#equipment-registered').open=true;updateStatus();}
 function updateStatus(){
  if(!dialog.open)return;
  if(references()){
   updateName();
   for(const def of [...adapter.definitions(),...(currentConveyor?[currentConveyor]:[])]){
    const label=adapter.label?.(def)||def.name;
    for(const title of dialog.querySelectorAll('[data-equipment-id="'+def.id+'"] > strong'))title.textContent=label;
   }
   updateTargetLabel();
  }
  for(const def of adapter.definitions())for(const node of dialog.querySelectorAll('[data-equipment-status="'+def.id+'"]')){const status=adapter.status(def.id);node.textContent=uiText(status?.phase||(def.type==='OBJECT'?'등록됨':def.type==='VACUUM'?'해제':'정지'))+(['OBJECT','VACUUM'].includes(def.type)?'':' · '+Number(def.runtime.position).toFixed(1)+(def.type==='ROTARY_AXIS'?'°':'mm'))+(status?.held&&def.type!=='VACUUM'?' · '+uiText('파지'):'')+(status?.error?' · '+equipmentMessage(status.error):'');}
 }
 dialog.querySelector('#equipment-popout').addEventListener('click',()=>adapter.popout?.());
 const hide=()=>{adapter.hide?.();dialog.close();};
 dialog.querySelector('#equipment-new').addEventListener('click',()=>edit());dialog.querySelector('#equipment-close').addEventListener('click',hide);dialog.addEventListener('close',()=>{pendingRole=null;adapter.changed();});dialog.addEventListener('keydown',event=>{if(event.key==='Escape'){event.stopPropagation();hide();}});
 dialog.querySelectorAll('[data-equipment-global]').forEach(button=>button.addEventListener('click',()=>{try{adapter.global(button.dataset.equipmentGlobal);}catch(exception){error(exception.message);}}));
 function constrain(left,top) {
  if(!dialog.open||dialog.classList.contains('panel-popout'))return;
  const view=dialog.ownerDocument.defaultView,doc=dialog.ownerDocument;
  const upper=doc.getElementById('topbar')?.getBoundingClientRect().bottom||0;
  const lower=doc.getElementById('stats-bar')?.getBoundingClientRect().top??view.innerHeight;
  dialog.style.maxHeight=Math.max(0,lower-upper)+'px';
  const rect=dialog.getBoundingClientRect();
  dialog.style.left=Math.max(0,Math.min(view.innerWidth-rect.width,left??rect.left))+'px';
  dialog.style.top=Math.max(upper,Math.min(lower-rect.height,top??rect.top))+'px';dialog.style.right='auto';dialog.style.bottom='auto';
 }
 const header=dialog.querySelector('.equipment-header');let drag=null;
 header.addEventListener('pointerdown',event=>{if(event.button!==0||event.target.closest('button')||dialog.classList.contains('panel-popout'))return;const r=dialog.getBoundingClientRect();drag={x:event.clientX,y:event.clientY,left:r.left,top:r.top};header.setPointerCapture(event.pointerId);event.preventDefault();});
 header.addEventListener('pointermove',event=>{if(drag)constrain(drag.left+event.clientX-drag.x,drag.top+event.clientY-drag.y);});
 new ResizeObserver(()=>constrain()).observe(dialog);
 window.addEventListener('resize',()=>constrain());
 for(const name of ['pointerup','pointercancel','lostpointercapture'])header.addEventListener(name,()=>{drag=null;});
 edit();
 function findDefinitions(ref) {
  if(!ref)return [];
  const matches=itemRef=>itemRef===ref||(ref.endsWith('/-1')&&itemRef?.startsWith(ref.slice(0,-2)));
  const defs=adapter.definitions().filter(item=>EQUIPMENT_TYPES.includes(item.type)&&([...equipmentReferences(item),...equipmentMotionGroups(item).map(([value])=>value)].some(matches)||matches(item.bodyRef)));
  const refs=ref.endsWith('/-1')?adapter.references().filter(item=>matches(item.value)).map(item=>item.value):[ref];
  for(const itemRef of refs){const conveyor=adapter.conveyorDefinition?.(itemRef);if(conveyor&&!defs.some(item=>item.id===conveyor.id))defs.push(conveyor);}
  return defs;
 }
 function show() {dialog.classList.remove('panel-user-hidden');if(!dialog.open)dialog.show();constrain();adapter.front?.();if(dialog.ownerDocument!==document)dialog.ownerDocument.defaultView.focus();}
 function openGroup(refs) {
  if(!refs.length)return;
  edit(null,refs[0]);
  selected.movingRef=new Set(refs);references(true);updateName();
  refs.forEach((ref,index)=>adapter.select?.(ref,index>0));
  show();
 }
 return {findDefinitions,openGroup,refreshLanguage() { updateName(); updateTargetLabel(); error(lastMessage); if (dialog.open) render(); },open(ref='',definition=null){edit(definition,ref);show();},edit,render,updateStatus,dialog,get pendingRole(){return pendingRole;},addPart(ref){const role=pendingRole||'movingRef';if(role==='movingRef'&&['FILM_PEEL','CONVEYOR'].includes(form.elements.type.value))selected[role].clear();selected[role].add(ref);if(role==='movingRef'&&['FILM_PEEL','CONVEYOR'].includes(form.elements.type.value)){pendingRole=null;for(const button of dialog.querySelectorAll('[data-equipment-role] button'))button.textContent='모델 트리에서 추가';}references(true);updateName();error('부품을 추가했습니다. 동작 저장을 눌러 적용하세요.');}};
}
