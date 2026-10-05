import { EQUIPMENT_TYPES, EQUIPMENT_LABELS, normalizeEquipmentDefinition, equipmentReferences, equipmentMotionGroups } from './equipment-core.mjs';

const groups = { movingRef: '이동 대상', secondRef: '반대쪽 손가락 부품', carriedRef: '테이블 위 탑재물', filmGripRef: '같은 필름의 손잡이 부품' };
const numeric = {
 travel:['이동 거리 (mm)',100], speed:['이동 속도 (mm/s)',100], reverseSpeed:['복귀 속도',100],
 openWidth:['열렸을 때 간격 (mm)',80], closedWidth:['최소 닫힘 간격 (mm)',0], gripDepth:['파지 영역 폭 (mm)',80], gripHeight:['파지 영역 높이 (mm)',80],
 filmLength:['필름 길이 (mm)',300], filmWidth:['필름 폭 (mm)',100], filmGripOffset:['손잡이 위치 (0~100%)',50], filmGripWidth:['손잡이 파지 폭 (mm)',20], filmStiffness:['굽힘 강성',0.05], filmDamping:['감쇠',0.96], externalAxis:['로봇 E축 (0=독립)',0],
 feedbackHome:['복귀 완료 Input 번호',''], feedbackEnd:['동작 완료 Input 번호',''], feedbackGrip:['파지 감지 Input 번호','']
};
export function createEquipmentUi(adapter) {
 const dialog=document.createElement('dialog'); dialog.id='equipment-dialog'; dialog.className='equipment-dialog'; dialog.setAttribute('aria-label','동작 설정');
 dialog.innerHTML='<div class="equipment-header"><h2>동작 설정</h2><div class="panel-header-actions"><button type="button" id="equipment-popout" title="별도 창으로 분리" aria-label="동작 설정을 별도 창으로 분리"><i class="fa-solid fa-up-right-from-square"></i></button><button type="button" id="equipment-close" title="숨기기" aria-label="동작 설정 숨기기"><i class="fa-solid fa-eye-slash"></i></button></div></div><p id="equipment-target-label"></p><form id="equipment-form"><input name="id" type="hidden"><fieldset><legend>1. 동작 선택</legend><div class="equipment-fields" id="equipment-basic"><label>동작 종류<select name="type"></select></label><label>동작 이름<input name="name" maxlength="160" readonly></label><label>방향<select name="axis"><option>X</option><option>-X</option><option>Y</option><option>-Y</option><option>Z</option><option>-Z</option></select></label></div></fieldset><fieldset id="equipment-parts"><legend>2. 이동 대상</legend><p class="equipment-help">부품을 클릭하면 외곽선으로 표시됩니다. 모델 트리에서 항목을 추가하고 체크를 해제하면 이동 대상에서 제외됩니다.</p></fieldset><fieldset><legend>3. IO 연결 (선택)</legend><p class="equipment-help">프로그램 실행 없이 IO 테스트 버튼으로도 동작합니다.</p><div class="equipment-fields" id="equipment-io"><label>동작 조건<select name="ioTrigger"><option value="1">ON일 때 동작</option><option value="0">OFF일 때 동작</option></select></label><label><span id="equipment-forward-label">전진 IO 번호</span><input type="number" name="forwardAddress" placeholder="연결 안 함"></label><label id="equipment-reverse-field"><span id="equipment-reverse-label">후진 IO 번호</span><input type="number" name="reverseAddress" placeholder="연결 안 함"></label></div></fieldset><details id="equipment-advanced"><summary>추가 옵션 · 기준 모델, 로봇 연결</summary><div class="equipment-fields" id="equipment-extra"></div></details><div class="equipment-toolbar"><button type="submit">동작 저장</button><button type="button" id="equipment-new">새 동작</button></div></form><p id="equipment-error" role="status"></p><div id="equipment-current-controls"></div><details id="equipment-registered"><summary>등록된 동작 관리</summary><div id="equipment-list"></div><div class="equipment-toolbar"><button type="button" data-equipment-global="start">IO 제어 재개</button><button type="button" data-equipment-global="stop">전체 정지</button><button type="button" data-equipment-global="reset">모두 원위치</button></div></details>';
 document.body.append(dialog);
 const form=dialog.querySelector('form'), basic=dialog.querySelector('#equipment-basic'), extra=dialog.querySelector('#equipment-extra');
 const error=message=>{dialog.querySelector('#equipment-error').textContent=message;};
 const selected=Object.fromEntries(Object.keys(groups).map(key=>[key,new Set()]));
 let targetRef='', signature='', currentConveyor=null;
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
  const panel=document.createElement('div'); panel.dataset.equipmentRole=role; panel.className='equipment-part-group';
  const heading=document.createElement('strong'); heading.textContent=label; const filter=document.createElement('input'); filter.type='search'; filter.placeholder='모델 / 부품 이름 검색';
  const pick=document.createElement('button'); pick.type='button'; pick.textContent='모델 트리에서 추가'; pick.addEventListener('click',()=>{pendingRole=pendingRole===role?null:role; for(const button of dialog.querySelectorAll('[data-equipment-role] button'))button.textContent=button.closest('[data-equipment-role]').dataset.equipmentRole===pendingRole?'선택 완료':'모델 트리에서 추가'; error(pendingRole?'추가할 부품을 모델 트리에서 클릭하세요. 우클릭의 “이동 대상으로 체크”도 사용할 수 있습니다.':'부품 선택을 마쳤습니다. 동작 저장을 눌러 적용하세요.');});
  const list=document.createElement('div'); list.className='equipment-part-options';
  panel.append(heading,pick,filter,list);if(role==='filmGripRef'){const help=document.createElement('p');help.className='equipment-help';help.textContent='같은 필름에 달린 손잡이를 모두 추가하세요. 그리퍼가 가까운 손잡이 하나를 잡으면 나머지 손잡이도 필름과 함께 움직입니다. 그리퍼를 연결하면 당긴 위치에 따라 박리됩니다.';panel.insertBefore(help,filter);} filter.addEventListener('input',()=>{for(const row of list.querySelectorAll('label')) row.hidden=!row.dataset.search.toLowerCase().includes(filter.value.toLowerCase());});
  dialog.querySelector('#equipment-parts').append(panel);
 }
 let pendingRole=null;
 const detachedFields=[];
 function restoreFields() {
  const restored=detachedFields.length>0;
  for(const {field,marker} of detachedFields)marker.replaceWith(field);
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
    const name=document.createElement('span');name.textContent=ref.partLabel||ref.label;name.setAttribute('role','button');name.setAttribute('aria-label',name.textContent);name.tabIndex=0;name.title=ref.label+' · 외곽선 선택';
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
 }
 function updateName() { const ref=adapter.references().find(item=>item.value===([...selected.movingRef][0]||targetRef)); form.elements.name.value=(EQUIPMENT_LABELS[form.elements.type.value]||'컨베이어 이송')+' / '+(ref?.modelLabel||ref?.label||'모델'); }
 function fields() {
  if(restoreFields())references(true);
  const type=form.elements.type.value, rotary=type==='ROTARY_AXIS', conveyor=type==='CONVEYOR', simple=['VACUUM','OBJECT'].includes(type);
  dialog.querySelector('#equipment-advanced').hidden=simple;dialog.querySelector('#equipment-io').closest('fieldset').hidden=type==='OBJECT';
  for(const option of form.elements.axis.options)option.hidden=conveyor&&option.value.endsWith('Z');
  if(conveyor&&form.elements.axis.value.endsWith('Z'))form.elements.axis.value='X';
  const targetLabel=type==='VACUUM'?'흡착 패드 선택':type==='OBJECT'?'오브젝트 선택':conveyor?'벨트 모델링 선택':'이동 대상';dialog.querySelector('#equipment-parts legend').textContent='2. '+targetLabel; dialog.querySelector('[data-equipment-role="movingRef"] strong').textContent=targetLabel; dialog.querySelector('#equipment-parts .equipment-help').textContent=type==='OBJECT'?'등록할 모델 또는 부품을 선택하세요. 그리퍼·진공·컨베이어는 등록된 오브젝트만 대상으로 동작합니다.':type==='VACUUM'?'흡착 패드를 선택하고 Output을 연결하세요. 흡착 Output으로 패드와 접촉한 등록 오브젝트를 흡착하고, 파기 Output으로 놓습니다.':conveyor?'물체를 올려놓는 벨트 모델 또는 벨트 부품 하나를 선택하세요. 벨트는 고정되고 상면의 물체가 이송됩니다.':'부품을 클릭하면 외곽선으로 표시됩니다. 모델 트리에서 항목을 추가하고 체크를 해제하면 이동 대상에서 제외됩니다.';
  const visible=(key,value)=>{form.elements[key].parentElement.hidden=!value;};
  for(const key of ['openWidth','closedWidth','gripDepth','gripHeight','feedbackGrip'])visible(key,type==='GRIPPER');
  visible('feedbackGrip',['GRIPPER','VACUUM'].includes(type));
  form.elements.feedbackGrip.parentElement.firstChild.textContent=type==='VACUUM'?'흡착 감지 Input 번호':'파지 감지 Input 번호';
  for(const key of ['pullerRef','filmGripSide','filmGripOffset','filmGripWidth','filmLength','filmWidth','filmStiffness','filmDamping'])visible(key,type==='FILM_PEEL');
  dialog.querySelector('[data-equipment-role="filmGripRef"]').hidden=type!=='FILM_PEEL';
  visible('externalAxis',['LINEAR_AXIS','ROTARY_AXIS'].includes(type)); visible('robotRef',['GRIPPER','LINEAR_AXIS','ROTARY_AXIS','FILM_PEEL'].includes(type));
  for(const key of ['feedbackHome','feedbackEnd','bodyRef'])visible(key,!conveyor&&!simple); visible('reverseSpeed',!simple&&!conveyor&&!['CYLINDER','GRIPPER'].includes(type));
  visible('axis',!simple&&type!=='FILM_PEEL');visible('speed',!simple&&!(type==='FILM_PEEL'&&(form.elements.pullerRef.value||form.elements.robotRef.value)));visible('travel',!simple&&!conveyor&&type!=='FILM_PEEL');
  form.elements.travel.parentElement.firstChild.textContent=rotary?'회전 각도 (°)':'이동 거리 (mm)';
  form.elements.speed.parentElement.firstChild.textContent=rotary?'회전 속도 (°/s)':'이동 속도 (mm/s)';
  for(const axis of ['X','Y','Z']){visible('pivot'+axis,rotary);visible('gripCenter'+axis,type==='GRIPPER');}
  dialog.querySelector('[data-equipment-role="secondRef"]').hidden=type!=='GRIPPER';
  dialog.querySelector('[data-equipment-role="carriedRef"]').hidden=!['LINEAR_AXIS','ROTARY_AXIS'].includes(type);
  const words=type==='VACUUM'?['흡착','파기']:type==='GRIPPER'?['닫기','열기']:type==='FILM_PEEL'?['박리','']:conveyor?['이송','']:['전진','후진'];
  dialog.querySelector('#equipment-forward-label').textContent=words[0]+' Output 번호';dialog.querySelector('#equipment-reverse-label').textContent=words[1]+' Output 번호';dialog.querySelector('#equipment-reverse-field').hidden=!words[1];
  const object=type==='OBJECT',vacuum=type==='VACUUM',editing=!!form.elements.id.value;
  dialog.querySelector('.equipment-header h2').textContent=object?(editing?'오브젝트 편집':'오브젝트 등록'):vacuum?(editing?'진공 편집':'진공 설정'):(editing?'동작 편집':'동작 설정');
  form.querySelector('button[type="submit"]').textContent=object?(editing?'등록 변경 저장':'오브젝트 등록'):vacuum?(editing?'변경 저장':'진공 저장'):(editing?'변경 저장':'동작 저장');
  const ioSection=dialog.querySelector('#equipment-io').closest('fieldset');
  ioSection.querySelector('legend').textContent=vacuum?'3. 흡착 IO 연결 (선택)':'3. IO 연결 (선택)';
  ioSection.querySelector('.equipment-help').textContent=vacuum?'흡착과 파기 Output을 각각 연결하세요. 두 신호가 동시에 입력되면 파기가 우선하며, 흡착 조건이 해제되어도 놓습니다. IO 없이도 흡착·파기 버튼으로 확인할 수 있습니다.':'프로그램 실행 없이 IO 테스트 버튼으로도 동작합니다.';
  if(simple) {
   for(const key of ['axis','travel','speed'])detachField(form.elements[key].parentElement);
   if(object)detachField(ioSection);
   else for(const key of ['feedbackHome','feedbackEnd'])detachField(form.elements[key].parentElement);
   detachField(dialog.querySelector('#equipment-advanced'));
   for(const role of ['secondRef','carriedRef','filmGripRef'])detachField(dialog.querySelector('[data-equipment-role="'+role+'"]'));
  }
 }
 function edit(def=null, ref=targetRef) {
  restoreFields();
  targetRef=ref||''; currentConveyor=def?.type==='CONVEYOR'?def:null; form.reset(); pendingRole=null; for(const button of dialog.querySelectorAll('[data-equipment-role] button'))button.textContent='모델 트리에서 추가';
  dialog.dataset.mode=def?'edit':'new';dialog.querySelector('.equipment-header h2').textContent=def?'동작 편집':'동작 설정';form.querySelector('button[type="submit"]').textContent=def?'변경 저장':'동작 저장';
  const sceneSelection=adapter.selectedReferences?.()||[];
  for(const key of Object.keys(groups))selected[key]=new Set(def?equipmentReferences(def,key):key==='movingRef'&&targetRef?(sceneSelection.includes(targetRef)?sceneSelection:[targetRef]):[]);
  form.elements.id.value=def?.id||'';form.elements.type.value=def?.type||'CYLINDER';form.elements.axis.value=def?.axis||'X';form.elements.name.value=def?.name||adapter.references().find(item=>item.value===targetRef)?.label||'';
  references(true);
  for(const key of ['bodyRef','robotRef','pullerRef'])form.elements[key].value=def?.[key]||'';
  form.elements.filmGripSide.value=def?.filmGripSide||'X-';
  for(const [key,[,value]]of Object.entries(numeric))form.elements[key].value=def?.[key]??value;
  ['X','Y','Z'].forEach((axis,i)=>{form.elements['pivot'+axis].value=def?.pivot?.[i]||0;form.elements['gripCenter'+axis].value=def?.gripCenter?.[i]??(i===2?40:0);});
  const bindings=adapter.bindings(def,targetRef)||{};form.elements.ioTrigger.value=bindings.triggerValue??1;form.elements.forwardAddress.value=bindings.forward??'';form.elements.reverseAddress.value=bindings.reverse??'';
  dialog.querySelector('#equipment-target-label').textContent=def?'편집 중 · '+def.name+' · 변경 저장을 눌러 적용하세요.':targetRef?'새 동작 · 대상: '+(adapter.references().find(item=>item.value===targetRef)?.label||'선택 부품'):'모델 트리의 항목을 우클릭해서 동작을 설정하세요.';
  fields();updateName();render();error('');dialog.scrollTop=0;
 }
 form.elements.type.addEventListener('change',()=>{fields();updateName();});
 for(const key of ['pullerRef','robotRef'])form.elements[key].addEventListener('change',fields);
 form.addEventListener('submit',event=>{event.preventDefault();try{
  const raw=Object.fromEntries(new FormData(form));raw.id ||= 'equipment-'+Date.now().toString(36)+'-'+Math.random().toString(36).slice(2,7);
  for(const key of Object.keys(groups)){raw[key+'s']=[...selected[key]];raw[key]=raw[key+'s'][0]||'';}
  if(!['OBJECT','VACUUM'].includes(raw.type)){raw.pivot=['X','Y','Z'].map(axis=>form.elements['pivot'+axis].value);raw.gripCenter=['X','Y','Z'].map(axis=>form.elements['gripCenter'+axis].value);}
  if(raw.type==='FILM_PEEL')raw.travel=raw.filmLength;
  updateName(); raw.name=form.elements.name.value; if(['CYLINDER','GRIPPER'].includes(raw.type))raw.reverseSpeed=raw.speed; const bindings={direction:'OUT',triggerValue:Number(raw.ioTrigger),forward:raw.forwardAddress,reverse:raw.reverseAddress};
  const saved=raw.type==='CONVEYOR'?adapter.saveConveyor(raw,bindings):adapter.save(normalizeEquipmentDefinition(raw),raw.type==='OBJECT'?null:bindings);
  edit(saved,targetRef);error(raw.type==='OBJECT'?'오브젝트를 등록했습니다. 그리퍼·진공·컨베이어의 대상으로 사용할 수 있습니다.':'동작을 저장했습니다. 시험 버튼 또는 연결한 IO로 운전할 수 있습니다.');
 }catch(exception){error(exception.message);}});
 function controls(def,container) {
  const row=document.createElement('div');row.className='equipment-list-row';row.dataset.equipmentId=def.id;
  const title=document.createElement('strong');title.textContent=def.name;const status=document.createElement('span');status.dataset.equipmentStatus=def.id;row.append(title,status);
  const actions=document.createElement('div');actions.className='equipment-test-actions';const management=document.createElement('div');management.className='equipment-management-actions';row.append(actions,management);
  const labels=def.type==='VACUUM'?['흡착','파기']:def.type==='GRIPPER'?['닫기','열기']:def.type==='FILM_PEEL'?['박리','']:['전진','후진'];
  for(const [command,label]of [['FORWARD',labels[0]],['REVERSE',labels[1]],['STOP','정지'],['RESET','원위치'],...(def.type==='FILM_PEEL'?[['RELEASE','필름 놓기']]:[]),['EDIT','편집'],['DELETE',def.type==='OBJECT'?'등록 해제':'동작 삭제']]) {
   if(!label||def.type==='OBJECT'&&!['EDIT','DELETE'].includes(command)||def.type==='VACUUM'&&['STOP','RESET'].includes(command))continue;const button=document.createElement('button');button.type='button';button.textContent=label;button.dataset.equipmentCommand=command;
   button.addEventListener('click',()=>{try{if(command==='EDIT')edit(def,def.movingRef);else if(command==='DELETE'){adapter.remove(def.id);edit(null,targetRef);}else adapter.command(def.id,command);updateStatus();}catch(exception){error(exception.message);}});(['EDIT','DELETE'].includes(command)?management:actions).append(button);
  }container.append(row);
 }
 function conveyorControls(def,container){
  const row=document.createElement('div');row.className='equipment-list-row';const title=document.createElement('strong');title.textContent=def.name;row.append(title);
  const actions=document.createElement('div');actions.className='equipment-test-actions';const management=document.createElement('div');management.className='equipment-management-actions';row.append(actions,management);
  for(const [command,label]of [['FORWARD','이송'],['STOP','정지'],['EDIT','편집'],['DELETE','동작 삭제']]){const button=document.createElement('button');button.type='button';button.textContent=label;button.dataset.conveyorCommand=command;button.addEventListener('click',()=>{if(command==='EDIT')edit(def,def.movingRef);else adapter.conveyorCommand(def.movingRef,command);if(command==='DELETE')edit(null,def.movingRef);});(['EDIT','DELETE'].includes(command)?management:actions).append(button);}container.append(row);
 }
 function render(){const list=dialog.querySelector('#equipment-list'),current=dialog.querySelector('#equipment-current-controls');list.replaceChildren();current.replaceChildren();if(currentConveyor)conveyorControls(currentConveyor,current);adapter.definitions().forEach(def=>controls(def,def.id===form.elements.id.value?current:list));updateStatus();}
 function updateStatus(){if(!dialog.open)return;references();for(const def of adapter.definitions())for(const node of dialog.querySelectorAll('[data-equipment-status="'+def.id+'"]')){const status=adapter.status(def.id);node.textContent=(status?.phase||(def.type==='OBJECT'?'등록됨':def.type==='VACUUM'?'해제':'정지'))+(['OBJECT','VACUUM'].includes(def.type)?'':' · '+Number(def.runtime.position).toFixed(1)+(def.type==='ROTARY_AXIS'?'°':'mm'))+(status?.held&&def.type!=='VACUUM'?' · 파지':'')+(status?.error?' · '+status.error:'');}}
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
  const defs=adapter.definitions().filter(item=>[...equipmentReferences(item),...equipmentMotionGroups(item).map(([value])=>value)].some(matches)||matches(item.bodyRef));
  const refs=ref.endsWith('/-1')?adapter.references().filter(item=>matches(item.value)).map(item=>item.value):[ref];
  for(const itemRef of refs){const conveyor=adapter.conveyorDefinition?.(itemRef);if(conveyor&&!defs.some(item=>item.id===conveyor.id))defs.push(conveyor);}
  return defs;
 }
 function show() {dialog.classList.remove('panel-user-hidden');if(!dialog.open)dialog.show();constrain();adapter.front?.();if(dialog.ownerDocument!==document)dialog.ownerDocument.defaultView.focus();}
 function openGroup(refs) {
  if(!refs.length)return;
  const def=findDefinitions(refs[0]).find(item=>{const moving=equipmentReferences(item,'movingRef');return moving.length===refs.length&&moving.every(ref=>refs.includes(ref));});
  edit(def,refs[0]);
  if(!def){selected.movingRef=new Set(refs);references(true);updateName();}
  refs.forEach((ref,index)=>adapter.select?.(ref,index>0));
  show();
 }
 return {findDefinitions,openGroup,open(ref='',definition=null){edit(definition||findDefinitions(ref)[0],ref);show();},edit,render,updateStatus,dialog,get pendingRole(){return pendingRole;},addPart(ref){const role=pendingRole||'movingRef';if(role==='movingRef'&&['FILM_PEEL','CONVEYOR'].includes(form.elements.type.value))selected[role].clear();selected[role].add(ref);if(role==='movingRef'&&['FILM_PEEL','CONVEYOR'].includes(form.elements.type.value)){pendingRole=null;for(const button of dialog.querySelectorAll('[data-equipment-role] button'))button.textContent='모델 트리에서 추가';}references(true);updateName();error('부품을 추가했습니다. 동작 저장을 눌러 적용하세요.');}};
}
