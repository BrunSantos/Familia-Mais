import {doc,getDoc,setDoc} from 'https://www.gstatic.com/firebasejs/11.10.0/firebase-firestore.js';
const clean=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const defaults=[['Wrap de frango','principal'],['Wrap de atum','principal'],['Pão com fiambre','principal'],['Pão com queijo','principal'],['Iogurte','laticinio'],['Leite de chocolate','bebida'],['Maçã','fruta'],['Banana','fruta'],['Pera','fruta'],['Cenoura','vegetal'],['Tostas','extra']];
const initialState=()=>({foods:defaults.map(([name,category])=>({name,category,children:[]})),plans:[]});
let state=initialState(),uid='',dbRef=null,children=[],notify=()=>{};
export async function startLanches(db,userId,kids,notice){dbRef=db;uid=userId;children=kids;notify=notice;state=initialState();const snap=await getDoc(doc(db,'lunchSettings',uid));state=snap.exists()?{...state,...snap.data()}:state;}
export function setLunchChildren(kids){children=kids;}
const save=()=>setDoc(doc(dbRef,'lunchSettings',uid),state);
const weekdays=['Segunda','Terça','Quarta','Quinta','Sexta','Sábado','Domingo'];
function eligible(kid,category){return state.foods.filter(f=>f.category===category&&(!f.children?.length||f.children.includes(kid.uid)));}
function pick(kid,cat,seed){const options=eligible(kid,cat);return options.length?options[seed%options.length].name:'';}
function build(weeks,weekend){const output=[];const total=weeks*(weekend?7:5);for(const kid of children){for(let i=0;i<total;i++){const week=Math.floor(i/(weekend?7:5)),day=i%(weekend?7:5),seed=i+children.indexOf(kid)*3;const main=pick(kid,'principal',seed),fruit=pick(kid,'fruta',seed+week),drink=pick(kid,'bebida',seed+1)||pick(kid,'laticinio',seed+1),extra=pick(kid,'laticinio',seed+2)||pick(kid,'extra',seed+2);output.push({kidId:kid.uid,kidName:kid.name,week:week+1,day, morning:[main,drink].filter(Boolean),afternoon:[fruit,extra].filter(Boolean)});}}return output;}
function manualLunchView(){return `<div class="card"><h3>Adicionar lanche</h3>${children.length?`<p>Seleciona vários filhos para guardar o mesmo lanche. Para lanches diferentes, guarda um de cada vez.</p>
<form id="lunchManualForm">
<fieldset><legend>Para quem?</legend><div class="lunch-kids">${children.map(k=>`<label><input type="checkbox" name="kids" value="${clean(k.uid)}" ${children.length===1?'checked':''}> ${clean(k.name)}</label>`).join('')}</div></fieldset>
<div class="lunch-form"><label>Semana do plano<input type="number" name="week" min="1" max="8" value="1" required></label>
<label>Dia<select name="day">${weekdays.map((d,i)=>`<option value="${i}">${d}</option>`).join('')}</select></label>
<label>Turno<select name="period"><option value="morning">Manhã</option><option value="afternoon">Tarde</option></select></label>
<label>Alimentos (separados por vírgulas)<input name="foods" maxlength="500" required placeholder="Ex.: Pão com queijo, pera"></label>
<button>Guardar lanche</button></div></form>`:'<p>Ainda não tens filhos ativos associados.</p>'}
<button type="button" class="alt" data-go="pessoas">Gerir filhos em Pessoas</button></div>`;}
async function saveManualLunch(fd){
 const kids=children.filter(k=>fd.getAll('kids').includes(k.uid));
 const week=Number(fd.get('week')), day=Number(fd.get('day')), period=fd.get('period');
 const foods=String(fd.get('foods')||'').split(',').map(f=>f.trim()).filter(Boolean);
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
export function lanchesView(){return `<section class="lunch-module"><h2>🥪 Lanches+</h2><p class="muted">Organiza os lanches da manhã e da tarde para cada filho. Os dados são privados da tua conta.</p>${manualLunchView()}<details class="card"><summary><strong>Biblioteca de alimentos (${state.foods.length})</strong></summary><form id="lunchFoodForm" class="lunch-form"><label>Alimento<input name="name" maxlength="80" required placeholder="Ex.: Pão com queijo"></label><label>Categoria<select name="category">${[['principal','Principal'],['fruta','Fruta'],['bebida','Bebida'],['laticinio','Laticínio'],['vegetal','Vegetal'],['extra','Complemento']].map(([v,n])=>`<option value="${v}">${n}</option>`).join('')}</select></label><label>Preferência<select name="kid"><option value="">Todos os filhos</option>${children.map(k=>`<option value="${clean(k.uid)}">${clean(k.name)}</option>`).join('')}</select></label><button>Adicionar alimento</button></form><div class="lunch-foods">${state.foods.map((f,i)=>`<span class="lunch-chip">${clean(f.name)} <small>· ${clean(f.category)}${f.children?.length?' · '+clean(children.find(k=>k.uid===f.children[0])?.name||'Filho'):''}</small> <button type="button" data-lunch-remove="${i}" aria-label="Remover ${clean(f.name)}">×</button></span>`).join('')}</div></details><div class="card"><h3>Gerar plano</h3><form id="lunchGenerateForm" class="lunch-form"><label>Semanas<select name="weeks">${[1,2,4,8].map(n=>`<option value="${n}" ${n===4?'selected':''}>${n}</option>`).join('')}</select></label><label><input type="checkbox" name="weekend"> Incluir fins de semana</label><button ${!children.length?'disabled':''}>Gerar lanches</button></form>${!children.length?'<p>Adiciona primeiro um filho à família.</p>':''}</div>${state.plans.length?`<div class="card"><div class="lunch-heading"><h3>Plano guardado</h3><button type="button" class="alt" data-lunch-print>Imprimir</button></div><div class="lunch-table-wrap"><table class="lunch-table"><thead><tr><th>Semana</th><th>Dia</th><th>Filho</th><th>Manhã</th><th>Tarde</th></tr></thead><tbody>${state.plans.map(p=>`<tr><td>${p.week}</td><td>${weekdays[p.day]}</td><td>${clean(p.kidName)}</td><td>${clean(p.morning.join(' + '))}</td><td>${clean(p.afternoon.join(' + '))}</td></tr>`).join('')}</tbody></table></div><h3>Lista de compras (quantidades por porção)</h3><div class="lunch-foods">${Object.entries(state.plans.flatMap(p=>[...p.morning,...p.afternoon]).reduce((a,f)=>(a[f]=(a[f]||0)+1,a),{})).sort((a,b)=>a[0].localeCompare(b[0],'pt')).map(([f,n])=>`<span class="lunch-chip">${clean(f)} × ${n}</span>`).join('')}</div></div>`:''}</section>`;}
export async function lunchSubmit(e,render){if(e.target.id==='lunchManualForm'){e.preventDefault();const button=e.submitter;if(button)button.disabled=true;try{if(await saveManualLunch(new FormData(e.target))){render();notify('Lanche guardado.');}}finally{if(button)button.disabled=false;}}else if(e.target.id==='lunchFoodForm'){e.preventDefault();const fd=new FormData(e.target),name=String(fd.get('name')||'').trim();if(!name)return;state.foods.push({name,category:String(fd.get('category')),children:fd.get('kid')?[String(fd.get('kid'))]:[]});await save();render();notify('Alimento adicionado.');}else if(e.target.id==='lunchGenerateForm'){e.preventDefault();if(!children.length)return;const fd=new FormData(e.target);if(state.plans.length&&!confirm('Substituir o plano anterior?'))return;state.plans=build(Math.min(8,Math.max(1,Number(fd.get('weeks'))||4)),fd.has('weekend'));await save();render();notify('Plano e lista de compras guardados.');}}
export async function lunchClick(e,render){const remove=e.target.closest('[data-lunch-remove]');if(remove){const i=Number(remove.dataset.lunchRemove);if(!confirm('Remover este alimento?'))return;state.foods.splice(i,1);await save();render();notify('Alimento removido.');}if(e.target.closest('[data-lunch-print]'))window.print();}
