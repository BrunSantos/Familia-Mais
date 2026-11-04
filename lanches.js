import {doc,getDoc,setDoc} from 'https://www.gstatic.com/firebasejs/11.10.0/firebase-firestore.js';
const clean=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const defaults=[['Wrap de frango','principal'],['Wrap de atum','principal'],['Pão com fiambre','principal'],['Pão com queijo','principal'],['Iogurte','laticinio'],['Leite de chocolate','bebida'],['Maçã','fruta'],['Banana','fruta'],['Pera','fruta'],['Cenoura','vegetal'],['Tostas','extra']];
const initialState=()=>({foods:defaults.map(([name,category])=>({name,category,children:[]})),plans:[]});
let state=initialState(),uid='',dbRef=null,children=[],notify=()=>{};
export async function startLanches(db,userId,kids,notice){dbRef=db;uid=userId;children=kids;notify=notice;state=initialState();const snap=await getDoc(doc(db,'lunchSettings',uid));state=snap.exists()?{...state,...snap.data()}:state;}
export function setLunchChildren(kids){children=kids;}
const save=()=>setDoc(doc(dbRef,'lunchSettings',uid),state);
const weekdays=['Segunda','Terça','Quarta','Quinta','Sexta','Sábado','Domingo'];
function eligible(kid,category){return state.foods.filter(f=>f.category===category&&(!f.children?.length||f.children.includes(kid.uid))).sort((a,b)=>Number(!!b.children?.includes(kid.uid))-Number(!!a.children?.includes(kid.uid)));}
function afternoonVarietyWarnings(afternoonIds,days){
 return children.filter(k=>afternoonIds.includes(k.uid)).flatMap(k=>{
  const count=new Set(eligible(k,'fruta').map(f=>f.name)).size;
  if(!count)return [k.name+': não tem fruta disponível. O lanche da tarde será gerado apenas com um alimento, sem fruta.'];
  return count<days?[k.name+': tem '+count+' opções de fruta para '+days+' dias por semana. Será necessário repetir fruta.']:[];
 });
}
function build(weeks,weekend,allowRepeat=false,afternoonIds=children.map(k=>k.uid)){
 const output=[], days=weekend?7:5;
 for(const kid of children){
  const count=new Set(eligible(kid,'principal').map(f=>f.name.trim()).filter(Boolean)).size;
  if(!count)throw Error('Não é possível gerar o plano: '+kid.name+' não tem nenhum produto principal disponível. Adiciona um alimento da categoria Principal ou ajusta as preferências.');
  if(!allowRepeat&&count<days)throw Error(kid.name+' tem '+count+' produtos principais diferentes, mas o plano precisa de '+days+' por semana. Adiciona mais opções ou marca «Aceitar repetições se faltarem opções». O plano anterior foi mantido.');
 }
 children.forEach((kid,offset)=>{
  const pool=(...categories)=>[...new Set(categories.flatMap(c=>eligible(kid,c).map(f=>f.name)))];
  const mains=pool('principal'), drinks=pool('bebida','laticinio','extra');
  const produce=pool('fruta'), sides=pool('principal','laticinio','extra','vegetal'), sweets=pool('doce');
  const take=(options,seed)=>options.length?options[seed%options.length]:'';
  let previousSide='';
  for(let i=0;i<weeks*days;i++){
   const seed=i+offset*3;
   const main=take(mains,seed), drink=take(drinks.filter(f=>f!==main),seed);
   const fruit=take(produce,seed);
   const afternoonPool=sides.length?sides:drinks;
   const alternatives=afternoonPool.filter(f=>f!==fruit&&f!==drink&&f!==main);
   const available=alternatives.length?alternatives:afternoonPool.filter(f=>f!==fruit);
   const varied=available.filter(f=>f!==previousSide);
   const side=take(varied.length?varied:available,seed);
   previousSide=side;
   const sweet=i%days===4?take(sweets,Math.floor(i/days)+offset):'';
   output.push({kidId:kid.uid,kidName:kid.name,week:Math.floor(i/days)+1,day:i%days,morning:[main,drink,...(!afternoonIds.includes(kid.uid)?[sweet]:[])].filter(Boolean),afternoon:afternoonIds.includes(kid.uid)?[side,fruit,sweet].filter(Boolean):[]});
  }
 });
 return output;
}
function manualLunchView(){return `<div class="card" id="lunchManual" hidden><h3>Editar lanche</h3>${children.length?`<p>Seleciona vários filhos para guardar o mesmo lanche. Para lanches diferentes, guarda um de cada vez.</p>
<form id="lunchManualForm">
<fieldset><legend>Para quem?</legend><div class="lunch-kids">${children.map(k=>`<label><input type="checkbox" name="kids" value="${clean(k.uid)}" ${children.length===1?'checked':''}> ${clean(k.name)}</label>`).join('')}</div></fieldset>
<div class="lunch-form"><label>Semana do plano<input type="number" name="week" min="1" max="8" value="1" required></label>
<label>Dia<select name="day">${weekdays.map((d,i)=>`<option value="${i}">${d}</option>`).join('')}</select></label>
<label>Turno<select name="period"><option value="morning">Manhã</option><option value="afternoon">Tarde</option></select></label>
<fieldset class="lunch-food-picker"><legend>Alimentos do lanche</legend><div id="lunchFoodChoices"></div></fieldset>
<div class="lunch-edit-actions"><button type="button" class="alt" data-plan-cancel>Cancelar</button><button type="submit">Guardar lanche</button></div></div></form>`:'<p>Ainda não tens filhos ativos associados.</p>'}
</div>`;}
async function saveManualLunch(fd){
 const kids=children.filter(k=>fd.getAll('kids').includes(k.uid));
 const week=Number(fd.get('week')), day=Number(fd.get('day')), period=fd.get('period');
 const foods=[...new Set(fd.getAll('foods').map(String).filter(Boolean))];
 if(!kids.length)throw Error('Seleciona pelo menos um filho.');
 if(!foods.length)throw Error('Indica pelo menos um alimento.');
 if(!Number.isInteger(week)||week<1||week>8||!Number.isInteger(day)||day<0||day>6||!['morning','afternoon'].includes(period))throw Error('Escolhe uma semana, um dia e um turno válidos.');
 const plans=state.plans.slice();
 const index=k=>plans.findIndex(p=>p.kidId===k.uid&&p.week===week&&p.day===day);
 if(kids.some(k=>plans[index(k)]?.[period]?.length)&&!confirm('Já existe um lanche neste turno para pelo menos um dos filhos selecionados. Substituir?'))return false;
 for(const kid of kids){
  const i=index(kid);
  const plan={...(plans[i]||{morning:[],afternoon:[]}),kidId:kid.uid,kidName:kid.name,week,day,[period]:foods};
  if(i<0)plans.push(plan);else plans[i]=plan;
 }
 if(plans.length>600)throw Error('O plano atingiu o limite de 600 registos.');
 plans.sort((a,b)=>a.week-b.week||a.day-b.day||a.kidName.localeCompare(b.kidName,'pt'));
 await setDoc(doc(dbRef,'lunchSettings',uid),{...state,plans});
 state.plans=plans;
 return true;
}
function plansByChild(){
 const groups=new Map();
 for(const row of state.plans){
  const key=row.kidId||row.kidName;
  if(!groups.has(key))groups.set(key,[]);
  groups.get(key).push(row);
 }
 const mealCell=(p,period,colspan=1)=>`<td${colspan>1?' colspan="2"':''}><div class="lunch-plan-cell"><span>${clean(p[period].join(' + '))}</span>${p[period].length>0&&children.some(k=>k.uid===p.kidId)?`<button type="button" class="alt" data-plan-edit="${state.plans.indexOf(p)}" data-period="${period}" aria-label="Editar lanche da ${period==='morning'?'manhã':'tarde'}">Editar</button>`:''}</div></td>`;
 return [...groups.values()].map(rows=>`<div class="lunch-child-plan"><h4>${clean(children.find(k=>k.uid===rows[0].kidId)?.name||rows[0].kidName)}</h4><div class="lunch-table-wrap"><table class="lunch-table"><thead><tr><th>Semana</th><th>Dia</th>${rows.every(p=>!p.afternoon.length)?'<th colspan="2">Manhã</th>':rows.every(p=>!p.morning.length)?'<th colspan="2">Tarde</th>':'<th>Manhã</th><th>Tarde</th>'}</tr></thead><tbody>${rows.map(p=>`<tr><td>${p.week}</td><td>${weekdays[p.day]}</td>${p.morning.length&&p.afternoon.length?mealCell(p,'morning')+mealCell(p,'afternoon'):mealCell(p,p.afternoon.length?'afternoon':'morning',2)}</tr>`).join('')}</tbody></table></div></div>`).join('');
}
function weeklyPrintView(){
 const weeks=[...new Set(state.plans.map(p=>p.week))].sort((a,b)=>a-b);
 return weeks.map(week=>{
  const groups=new Map();
  for(const row of state.plans.filter(p=>p.week===week)){
   const key=row.kidId||row.kidName;
   if(!groups.has(key))groups.set(key,[]);
   groups.get(key).push(row);
  }
  return `<section class="lunch-print-week"><h1>Plano de refeições · Semana ${clean(week)}</h1>${[...groups.values()].map(rows=>`<section class="lunch-print-child"><h2>${clean(children.find(k=>k.uid===rows[0].kidId)?.name||rows[0].kidName)}</h2><table><thead><tr><th>Dia</th><th>Manhã</th><th>Tarde</th></tr></thead><tbody>${rows.slice().sort((a,b)=>a.day-b.day).map(row=>`<tr><td>${clean(weekdays[row.day])}</td><td>${clean(row.morning.join(' + '))||'—'}</td><td>${clean(row.afternoon.join(' + '))||'—'}</td></tr>`).join('')}</tbody></table></section>`).join('')}</section>`;
 }).join('');
}
function printWeeklyPlan(){
 document.getElementById('familyLunchPrint')?.remove();
 const area=document.createElement('div');area.id='familyLunchPrint';area.innerHTML=weeklyPrintView();document.body.appendChild(area);
 const cleanup=()=>area.remove();
 window.addEventListener('afterprint',cleanup,{once:true});
 try{window.print();}catch(error){cleanup();throw error;}
}
function foodLibraryGroups(){
 const entries=state.foods.map((food,index)=>({food,index}));
 const shared=f=>!f.children?.length||(children.length>1&&children.every(k=>f.children.includes(k.uid)));
 const groups=[{title:children.length===2?'Ambos / sem preferência':'Todos / sem preferência',items:entries.filter(({food})=>shared(food))},...children.map(k=>({title:k.name,items:entries.filter(({food})=>!shared(food)&&food.children?.includes(k.uid))}))];
 const unavailable=entries.filter(({food})=>!shared(food)&&!children.some(k=>food.children?.includes(k.uid)));
 if(unavailable.length)groups.push({title:'Outros perfis',items:unavailable});
 const categories=[['principal','Principal'],['fruta','Fruta'],['bebida','Bebida'],['laticinio','Laticínio'],['vegetal','Vegetal'],['extra','Complemento'],['doce','Doce']];
 const chip=({food:f,index:i})=>`<div class="lunch-chip"><span>${clean(f.name)}</span><div class="lunch-food-actions"><button type="button" data-lunch-edit="${i}" aria-label="Editar ${clean(f.name)}">✎</button><button type="button" data-lunch-remove="${i}" aria-label="Remover ${clean(f.name)}">×</button></div></div>`;
 const visibleCategories=categories.filter(([category])=>entries.some(({food})=>food.category===category));
 if(!entries.length)return '<p class="muted">Ainda não há alimentos na biblioteca.</p>';
 return `<div class="lunch-library-scroll"><table class="lunch-library-table" style="min-width:${155+visibleCategories.length*190}px"><thead><tr><th scope="col">Preferência</th>${visibleCategories.map(([,label])=>`<th scope="col">${label}</th>`).join('')}</tr></thead><tbody>${groups.map(({title,items})=>`<tr><th scope="row">${clean(title)}</th>${visibleCategories.map(([category])=>`<td><div class="lunch-library-items">${items.filter(({food})=>food.category===category).sort((a,b)=>a.food.name.localeCompare(b.food.name,'pt')).map(chip).join('')||'<span class="muted">—</span>'}</div></td>`).join('')}</tr>`).join('')}</tbody></table></div>`;

}
export function lanchesView(){return `<section class="lunch-module"><h2>🥪 Lanches+</h2><p class="muted">Organiza os lanches da manhã e da tarde para cada filho. Os dados são privados da tua conta.</p>${manualLunchView()}<details class="card"><summary><strong>Biblioteca de alimentos (${state.foods.length})</strong></summary><form id="lunchFoodForm" class="lunch-form"><label>Alimento<input name="name" maxlength="80" required placeholder="Ex.: Pão com queijo"></label><label>Categoria<select name="category">${[['principal','Principal'],['fruta','Fruta'],['bebida','Bebida'],['laticinio','Laticínio'],['vegetal','Vegetal'],['extra','Complemento'],['doce','Doce']].map(([v,n])=>`<option value="${v}">${n}</option>`).join('')}</select></label><label>Preferido por<select name="kid"><option value="">Sem preferência</option>${children.map(k=>`<option value="${clean(k.uid)}">${clean(k.name)}</option>`).join('')}${children.length>1?`<option value="__all">${children.length===2?'Ambos':'Todos os filhos'}</option>`:''}</select></label><button>Adicionar alimento</button><button type="button" class="alt" data-lunch-cancel hidden>Cancelar</button></form>${foodLibraryGroups()}</details><div class="card"><h3>Gerar plano</h3><form id="lunchGenerateForm" class="lunch-form"><label>Semanas<select name="weeks">${[1,2,4,8].map(n=>`<option value="${n}" ${n===4?'selected':''}>${n}</option>`).join('')}</select></label><label><input type="checkbox" name="weekend"> Incluir fins de semana</label><label class="lunch-repeat"><input type="checkbox" name="repeat"> Aceitar repetições se faltarem opções</label><fieldset class="lunch-afternoon-settings"><legend>Gerar lanche da tarde</legend><div class="lunch-kids">${children.map(k=>`<label><input type="checkbox" name="afternoonKids" value="${clean(k.uid)}" ${!state.plans.some(p=>p.kidId===k.uid)||state.plans.some(p=>p.kidId===k.uid&&p.afternoon.length)?'checked':''}> ${clean(k.name)}</label>`).join('')}</div><small>Desmarca os filhos que só precisam de lanche da manhã.</small></fieldset><p class="lunch-sweet-info">À tarde: um alimento e fruta, quando disponível. Se faltar fruta para variar durante a semana, aparece um aviso antes de gerar.</p><p class="lunch-sweet-info">Doce: no máximo um complemento por filho e por semana, à sexta-feira, quando existir na biblioteca. É incluído à tarde ou, sem lanche da tarde, de manhã.</p><button ${!children.length?'disabled':''}>Gerar lanches</button></form>${!children.length?'<p>Adiciona primeiro um filho à família.</p>':''}</div>${state.plans.length?`<div class="card"><div class="lunch-heading"><h3>Plano de refeições</h3><div class="lunch-plan-actions"><button type="button" class="alt" data-lunch-print>Imprimir</button><button type="button" class="alt" data-lunch-clear>Apagar plano</button></div></div>${plansByChild()}<section class="lunch-shopping"><div class="lunch-heading"><h3>Lista de compras (quantidades por porção)</h3><button type="button" class="alt" data-lunch-whatsapp>Enviar por WhatsApp</button></div><div class="lunch-foods">${Object.entries(state.plans.flatMap(p=>[...p.morning,...p.afternoon]).reduce((a,f)=>(a[f]=(a[f]||0)+1,a),{})).sort((a,b)=>a[0].localeCompare(b[0],'pt')).map(([f,n])=>`<span class="lunch-chip">${clean(f)} × ${n}</span>`).join('')}</div></section></div>`:''}</section>`;}
export async function lunchSubmit(e,render){if(e.target.id==='lunchManualForm'){e.preventDefault();const button=e.submitter;if(button)button.disabled=true;try{if(await saveManualLunch(new FormData(e.target))){render();notify('Lanche guardado.');}}finally{if(button)button.disabled=false;}}else if(e.target.id==='lunchFoodForm'){e.preventDefault();const fd=new FormData(e.target),name=String(fd.get('name')||'').trim();if(!name)return;const form=e.target, editing=form.dataset.edit!==undefined, i=Number(form.dataset.edit);
 const foods=state.foods.slice(), food={name,category:String(fd.get('category')),children:fd.get('kid')==='__all'?children.map(k=>k.uid):fd.get('kid')==='__keep'&&editing?(foods[i]?.children||[]):children.filter(k=>k.uid===fd.get('kid')).map(k=>k.uid)};
 if(editing){if(!foods[i])return;foods[i]={...foods[i],...food};}else foods.push(food);
 await setDoc(doc(dbRef,'lunchSettings',uid),{...state,foods});state.foods=foods;
 render();document.getElementById('lunchFoodForm').closest('details').open=true;
 notify(editing?'Alimento atualizado.':'Alimento adicionado.');}else if(e.target.id==='lunchGenerateForm'){e.preventDefault();if(!children.length)return;const fd=new FormData(e.target);const afternoonIds=fd.getAll('afternoonKids');const plans=build(Math.min(8,Math.max(1,Number(fd.get('weeks'))||4)),fd.has('weekend'),fd.has('repeat'),afternoonIds);const warnings=afternoonVarietyWarnings(afternoonIds,fd.has('weekend')?7:5);const confirmation=[...(state.plans.length?['O plano anterior será substituído.']:[]),...warnings,...(warnings.length?['Podes cancelar para adicionar mais fruta à biblioteca ou gerar o plano nestas condições. Gerar mesmo assim?']:['Substituir o plano anterior?'])];if((warnings.length||state.plans.length)&&!confirm(confirmation.join('\n\n')))return;await setDoc(doc(dbRef,'lunchSettings',uid),{...state,plans});state.plans=plans;render();notify('Plano e lista de compras guardados.');}}
export async function lunchClick(e,render){
 if(e.target.closest('[data-lunch-whatsapp]')){
  const totals=state.plans.flatMap(p=>[...p.morning,...p.afternoon]).reduce((a,f)=>(a[f]=(a[f]||0)+1,a),{});
  const lines=Object.entries(totals).sort((a,b)=>a[0].localeCompare(b[0],'pt')).map(([name,n])=>'- '+name+' × '+n+' porções');
  const message=['Lista de compras — Família+','',...lines].join('\n');
  window.open('https://wa.me/?text='+encodeURIComponent(message),'_blank','noopener,noreferrer');
  return;
 }

 if(e.target.closest('[data-plan-cancel]')){document.getElementById('lunchManual').hidden=true;return;}
 const editPlan=e.target.closest('[data-plan-edit]');
 if(editPlan){
  const row=state.plans[Number(editPlan.dataset.planEdit)], period=editPlan.dataset.period;
  const form=document.getElementById('lunchManualForm');
  if(!row||!form||!['morning','afternoon'].includes(period))return;
  document.getElementById('lunchManual').hidden=false;
  form.querySelectorAll('[name="kids"]').forEach(box=>box.checked=box.value===row.kidId);
  for(const [name,value] of Object.entries({week:row.week,day:row.day,period}))form.elements.namedItem(name).value=value;
  const options=[...new Set([...state.foods.map(f=>f.name),...row[period]])];
  document.getElementById('lunchFoodChoices').innerHTML=options.map(name=>`<label><input type="checkbox" name="foods" value="${clean(name)}" ${row[period].includes(name)?'checked':''}> <span>${clean(name)}</span></label>`).join('');
  document.querySelector('#lunchFoodChoices input')?.focus();return;
 }
 const clear=e.target.closest('[data-lunch-clear]');
 if(clear){
  if(!confirm('Apagar o plano de todos os filhos? A biblioteca de alimentos será mantida.'))return;
  clear.disabled=true;
  try{
   await setDoc(doc(dbRef,'lunchSettings',uid),{...state,plans:[]});
   state.plans=[];render();notify('Plano apagado.');
  }finally{clear.disabled=false;}
  return;
 }

 const edit=e.target.closest('[data-lunch-edit]'),cancel=e.target.closest('[data-lunch-cancel]');
 if(edit||cancel){
  const form=document.getElementById('lunchFoodForm'),submit=form.querySelector('button:not([type])');
  if(cancel){form.reset();delete form.dataset.edit;submit.textContent='Adicionar alimento';cancel.hidden=true;return;}
  const i=Number(edit.dataset.lunchEdit),food=state.foods[i];if(!food)return;
  form.dataset.edit=String(i);
  form.elements.namedItem('name').value=food.name;
  form.elements.category.value=food.category;
  const select=form.elements.namedItem('kid'), ids=food.children||[];
  select.querySelector('option[value="__keep"]')?.remove();
  if(!ids.length)select.value='';
  else if(ids.length===1&&children.some(k=>k.uid===ids[0]))select.value=ids[0];
  else if(children.length>1&&ids.length===children.length&&children.every(k=>ids.includes(k.uid)))select.value='__all';
  else {select.add(new Option('Manter preferência atual','__keep'));select.value='__keep';}
  submit.textContent='Guardar alterações';form.querySelector('[data-lunch-cancel]').hidden=false;
  form.elements.namedItem('name').focus();return;
 }
 const remove=e.target.closest('[data-lunch-remove]');if(remove){const form=document.getElementById('lunchFoodForm');if(form.dataset.edit!==undefined){notify('Guarda ou cancela a edição antes de remover um alimento.');return;}const i=Number(remove.dataset.lunchRemove);if(!confirm('Remover este alimento?'))return;state.foods.splice(i,1);await save();render();notify('Alimento removido.');}if(e.target.closest('[data-lunch-print]'))printWeeklyPlan();}
