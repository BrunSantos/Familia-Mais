import {doc,getDoc,setDoc} from 'https://www.gstatic.com/firebasejs/11.10.0/firebase-firestore.js';
const clean=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const defaults=[['Wrap de frango','principal'],['Wrap de atum','principal'],['Pão com fiambre','principal'],['Pão com queijo','principal'],['Iogurte','laticinio'],['Leite de chocolate','bebida'],['Maçã','fruta'],['Banana','fruta'],['Pera','fruta'],['Cenoura','vegetal'],['Tostas','extra'],['Queque pequeno','doce'],['Bolacha doce','doce']];
let state={foods:defaults.map(([name,category])=>({name,category,children:[],portions:{}})),plans:[],sweet:{enabled:true,day:4,meal:'afternoon',frequency:'weekly',children:[]}},uid='',dbRef=null,children=[],notify=()=>{};
export async function startLanches(db,userId,kids,notice){dbRef=db;uid=userId;children=kids;notify=notice;const snap=await getDoc(doc(db,'lunchSettings',uid));state=snap.exists()?{...state,...snap.data()}:state;state.sweet={enabled:true,day:4,meal:'afternoon',frequency:'weekly',children:[],...(state.sweet||{})};}
const save=()=>setDoc(doc(dbRef,'lunchSettings',uid),state);
const weekdays=['Segunda','Terça','Quarta','Quinta','Sexta','Sábado','Domingo'];
function eligible(kid,category){return state.foods.filter(f=>f.category===category&&(!f.children?.length||f.children.includes(kid.uid)));}
function pick(kid,cat,seed){const options=eligible(kid,cat);return options.length?options[seed%options.length]:null;}
function portion(food,kid){return Math.max(0.25,Math.min(10,Number(food?.portions?.[kid.uid]??1)||1));}
function entry(food,kid){return food?{name:food.name,qty:portion(food,kid)}:null;}
function build(weeks,weekend){const output=[];const n=weekend?7:5;
 for(const kid of children)for(let i=0;i<weeks*n;i++){
 const week=Math.floor(i/n),day=i%n,seed=i+children.indexOf(kid)*3;
 const main=pick(kid,'principal',seed),fruit=pick(kid,'fruta',seed+week),drink=pick(kid,'bebida',seed+1)||pick(kid,'laticinio',seed+1),extra=pick(kid,'laticinio',seed+2)||pick(kid,'extra',seed+2);
 const morning=[entry(main,kid),entry(drink,kid)].filter(Boolean),afternoon=[entry(fruit,kid),entry(extra,kid)].filter(Boolean);
 const sw=state.sweet;
 if(sw.enabled&&day===Number(sw.day)&&(!sw.children.length||sw.children.includes(kid.uid))&&(sw.frequency==='weekly'||week%2===0)){
 const sweet=pick(kid,'doce',week+children.indexOf(kid));if(sweet)(sw.meal==='morning'?morning:afternoon).push(entry(sweet,kid));
 }
 output.push({kidId:kid.uid,kidName:kid.name,week:week+1,day,morning,afternoon});
 }return output;
}
const categories=[['principal','Principal'],['extra','Secundário / complemento'],['fruta','Fruta'],['bebida','Bebida'],['laticinio','Laticínio'],['vegetal','Vegetal'],['doce','Doce']];
const opts=(list,current)=>list.map(([v,n])=>`<option value="${v}" ${String(current)===String(v)?'selected':''}>${n}</option>`).join('');
const foodLabel=e=>typeof e==='string'?e:`${e.qty===1?'':e.qty+' × '}${e.name}`;
const foodsOf=p=>[...(p.morning||[]),...(p.afternoon||[])];
export function lanchesView(){
 const sw=state.sweet;
 return `<section class="lunch-module"><h2>🥪 Lanches+</h2><p class="muted">Planeamento individual com porções, doces e lista de compras. As alterações são guardadas no Firebase.</p>
 <details class="card" open><summary><strong>Biblioteca de alimentos (${state.foods.length})</strong></summary>
 <form id="lunchFoodForm" class="lunch-form"><label>Alimento<input name="name" maxlength="80" required placeholder="Ex.: Pão com queijo"></label><label>Categoria<select name="category">${opts(categories,'principal')}</select></label><label>Preferência<select name="kid"><option value="">Todos os filhos</option>${children.map(k=>`<option value="${clean(k.uid)}">${clean(k.name)}</option>`).join('')}</select></label><button>Adicionar alimento</button></form>
 <div class="lunch-foods">${state.foods.map((f,i)=>`<span class="lunch-chip">${clean(f.name)} <small>· ${clean(categories.find(c=>c[0]===f.category)?.[1]||f.category)}</small> <button type="button" data-lunch-edit="${i}" aria-label="Editar ${clean(f.name)}">✎</button> <button type="button" data-lunch-remove="${i}" aria-label="Remover ${clean(f.name)}">×</button></span>`).join('')}</div>
 <div id="lunchEditSlot"></div></details>
 <div class="card"><h3>🍬 Dia do Doce</h3><p>Por defeito: sexta-feira à tarde, todas as semanas, para todos os filhos. Só utiliza doces da biblioteca.</p>
 <form id="lunchSweetForm" class="lunch-form"><label><input type="checkbox" name="enabled" ${sw.enabled?'checked':''}> Ativar dia do doce</label>
 <label>Dia<select name="day">${opts([['0','Segunda-feira'],['1','Terça-feira'],['2','Quarta-feira'],['3','Quinta-feira'],['4','Sexta-feira'],['5','Sábado'],['6','Domingo']],sw.day)}</select></label>
 <label>Lanche<select name="meal">${opts([['morning','Manhã'],['afternoon','Tarde']],sw.meal)}</select></label>
 <label>Frequência<select name="frequency">${opts([['weekly','Semanal'],['fortnightly','Quinzenal']],sw.frequency)}</select></label>
 <fieldset><legend>Filhos (sem seleção = todos)</legend>${children.map(k=>`<label><input type="checkbox" name="sweetKid" value="${clean(k.uid)}" ${sw.children.includes(k.uid)?'checked':''}> ${clean(k.name)}</label>`).join('')}</fieldset>
 <button>Guardar Dia do Doce</button></form></div>
 <div class="card"><h3>Gerar plano</h3><form id="lunchGenerateForm" class="lunch-form"><label>Semanas<select name="weeks">${[1,2,4,8].map(n=>`<option value="${n}" ${n===4?'selected':''}>${n}</option>`).join('')}</select></label><label><input type="checkbox" name="weekend"> Incluir fins de semana</label><button ${!children.length?'disabled':''}>Gerar lanches</button></form>${!children.length?'<p>Adiciona primeiro um filho à família.</p>':''}</div>
 ${state.plans.length?`<div class="card"><div class="lunch-heading"><h3>Plano guardado</h3><button type="button" class="alt" data-lunch-print>Imprimir</button></div><div class="lunch-table-wrap"><table class="lunch-table"><thead><tr><th>Semana</th><th>Dia</th><th>Filho</th><th>Manhã</th><th>Tarde</th></tr></thead><tbody>${state.plans.map(p=>`<tr><td>${p.week}</td><td>${weekdays[p.day]}</td><td>${clean(p.kidName)}</td><td>${clean((p.morning||[]).map(foodLabel).join(' + '))}</td><td>${clean((p.afternoon||[]).map(foodLabel).join(' + '))}</td></tr>`).join('')}</tbody></table></div><h3>Lista de compras (porções totais)</h3><div class="lunch-foods">${Object.entries(state.plans.flatMap(foodsOf).reduce((a,f)=>{const name=typeof f==='string'?f:f.name,qty=typeof f==='string'?1:Number(f.qty)||1;a[name]=(a[name]||0)+qty;return a;},{})).sort((a,b)=>a[0].localeCompare(b[0],'pt')).map(([f,n])=>`<span class="lunch-chip">${clean(f)} × ${n}</span>`).join('')}</div></div>`:''}</section>`;
}
function editMarkup(i){
 const f=state.foods[i];if(!f)return '';
 return `<form id="lunchEditForm" class="lunch-edit" data-index="${i}"><h3>Editar alimento</h3><label>Nome<input name="name" maxlength="80" required value="${clean(f.name)}"></label>
 <label>Categoria<select name="category">${opts(categories,f.category)}</select></label>
 <fieldset><legend>Filhos que podem receber este alimento (nenhum selecionado = todos)</legend>${children.map(k=>`<label><input type="checkbox" name="kid" value="${clean(k.uid)}" ${f.children?.includes(k.uid)?'checked':''}> ${clean(k.name)}</label>`).join('')}</fieldset>
 <fieldset><legend>Porções habituais por filho</legend>${children.map(k=>`<label>${clean(k.name)} <input type="number" name="portion_${clean(k.uid)}" min="0.25" max="10" step="0.25" value="${portion(f,k)}"></label>`).join('')}</fieldset>
 <button type="submit">Guardar alterações</button><button type="button" class="alt" data-lunch-cancel>Cancelar</button></form>`;
}
export async function lunchSubmit(e,render){
 if(e.target.id==='lunchFoodForm'){e.preventDefault();const fd=new FormData(e.target),name=String(fd.get('name')||'').trim();if(!name)return;state.foods.push({name,category:String(fd.get('category')),children:fd.get('kid')?[String(fd.get('kid'))]:[],portions:{}});await save();render();notify('Alimento adicionado.');}
 else if(e.target.id==='lunchEditForm'){e.preventDefault();const i=Number(e.target.dataset.index),f=state.foods[i];if(!f)return;const fd=new FormData(e.target);f.name=String(fd.get('name')||'').trim();if(!f.name)return;f.category=String(fd.get('category'));f.children=fd.getAll('kid').map(String);f.portions=Object.fromEntries(children.map(k=>[k.uid,Math.max(.25,Math.min(10,Number(fd.get('portion_'+k.uid))||1))]));await save();render();notify('Alimento atualizado.');}
 else if(e.target.id==='lunchSweetForm'){e.preventDefault();const fd=new FormData(e.target);state.sweet={enabled:fd.has('enabled'),day:Number(fd.get('day')),meal:String(fd.get('meal')),frequency:String(fd.get('frequency')),children:fd.getAll('sweetKid').map(String)};await save();render();notify('Dia do Doce guardado.');}
 else if(e.target.id==='lunchGenerateForm'){e.preventDefault();if(!children.length)return;const fd=new FormData(e.target);if(state.plans.length&&!confirm('Substituir o plano anterior?'))return;state.plans=build(Math.min(8,Math.max(1,Number(fd.get('weeks'))||4)),fd.has('weekend'));await save();render();notify('Plano e lista de compras guardados.');}
}
export async function lunchClick(e,render){
 const edit=e.target.closest('[data-lunch-edit]');if(edit){const slot=document.getElementById('lunchEditSlot');if(slot){slot.innerHTML=editMarkup(Number(edit.dataset.lunchEdit));slot.scrollIntoView({block:'nearest',behavior:'smooth'});}return;}
 if(e.target.closest('[data-lunch-cancel]')){const slot=document.getElementById('lunchEditSlot');if(slot)slot.innerHTML='';return;}
 const remove=e.target.closest('[data-lunch-remove]');if(remove){const i=Number(remove.dataset.lunchRemove);if(!confirm('Remover este alimento?'))return;state.foods.splice(i,1);await save();render();notify('Alimento removido.');}
 if(e.target.closest('[data-lunch-print]'))window.print();
}
