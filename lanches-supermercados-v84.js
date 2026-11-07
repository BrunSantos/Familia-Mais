import {storesReady,storeFor,storePicker,storesNotice,storesNav,storesViewSelected,storesView,groupByStore,prepareStoreChoice,applyStoreChoice,updateStorePicker} from './supermercados-v84.js';
import {doc,getDoc,setDoc,collection,getDocs,writeBatch,deleteDoc,serverTimestamp} from 'https://www.gstatic.com/firebasejs/11.10.0/firebase-firestore.js';
const clean=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const defaults=[['Wrap de frango','principal'],['Wrap de atum','principal'],['Pão com fiambre','principal'],['Pão com queijo','principal'],['Iogurte','laticinio'],['Leite de chocolate','bebida'],['Maçã','fruta'],['Banana','fruta'],['Pera','fruta'],['Cenoura','vegetal'],['Tostas','extra']];
const initialState=()=>({foods:defaults.map(([name,category])=>({name,category,children:[]})),plans:[]});
let state=initialState(),uid='',dbRef=null,children=[],notify=()=>{},shoppingExcluded=new Set(),pantry=[],pantryReady=false,pantryError='',manualShopping=[],purchaseChecks=new Map(),legacyShopping=[];
let mealShoppingProvider=()=>({ingredients:[],pending:[]});
export function setMealShoppingProvider(provider){mealShoppingProvider=provider;}
export async function startLanches(db,userId,kids,notice){dbRef=db;uid=userId;children=kids;notify=notice;shoppingExcluded=new Set();state=initialState();pantry=[];pantryReady=false;pantryError='';manualShopping=[];purchaseChecks=new Map();const snap=await getDoc(doc(db,'lunchSettings',uid));state=snap.exists()?{...state,...snap.data()}:state;try{const [stock,manual,checks]=await Promise.all(['lunchPantry','shoppingManual','shoppingChecks'].map(path=>getDocs(collection(db,path,uid,'items'))));pantry=stock.docs.map(d=>({...d.data(),id:d.id}));manualShopping=manual.docs.map(d=>({...d.data(),id:d.id}));purchaseChecks=new Map(checks.docs.map(d=>[decodeURIComponent(d.id),d.data()]));pantryReady=true;}catch(error){pantryError='Não foi possível carregar os dados do Compras+. Confirma a ligação e publica as regras atualizadas no Firebase.';}}

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
  const required=days-(eligible(kid,'doce').length?1:0);
  if(!allowRepeat&&count<required)throw Error(kid.name+' tem '+count+' produtos principais diferentes, mas o plano precisa de '+required+' por semana. Adiciona mais opções ou marca «Aceitar repetições se faltarem opções». O plano anterior foi mantido.');
 }
 children.forEach((kid,offset)=>{
  const pool=(...categories)=>[...new Set(categories.flatMap(c=>eligible(kid,c).map(f=>f.name)))];
  const mains=pool('principal'), drinks=pool('bebida','laticinio','extra');
  const produce=pool('fruta'), sides=pool('principal','laticinio','extra','vegetal'), sweets=pool('doce');
  const take=(options,seed)=>options.length?options[seed%options.length]:'';
  let previousSide='';
  for(let i=0;i<weeks*days;i++){
   const seed=i+offset*3;
   const week=Math.floor(i/days), day=i%days;
   const sweetDay=(week+offset)%days;
   const sweet=sweets.length&&day===sweetDay?take(sweets,week+offset):'';
   const mainIndex=sweets.length?week*(days-1)+day-(day>sweetDay?1:0):i;
   const main=sweet||take(mains,mainIndex+offset*3);
   const drink=take(drinks.filter(f=>f!==main),seed);
   const fruit=take(produce,seed);
   const afternoonPool=sides.length?sides:drinks;
   const alternatives=afternoonPool.filter(f=>f!==fruit&&f!==drink&&f!==main);
   const available=alternatives.length?alternatives:afternoonPool.filter(f=>f!==fruit);
   const varied=available.filter(f=>f!==previousSide);
   const side=take(varied.length?varied:available,seed);
   previousSide=side;
   output.push({kidId:kid.uid,kidName:kid.name,week:Math.floor(i/days)+1,day:i%days,morning:[main,drink].filter(Boolean),afternoon:afternoonIds.includes(kid.uid)?[side,fruit].filter(Boolean):[]});
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
 if(!entries.length)return '<p class="muted">Ainda não há alimentos na biblioteca.</p>';
 return `<div class="lunch-library-groups">${groups.map(({title,items})=>`<section class="lunch-library-person"><h4>${clean(title)}</h4><div class="lunch-library-types">${categories.map(([category,label])=>{const foods=items.filter(({food})=>food.category===category);return foods.length?`<details class="lunch-library-category" ${['principal','fruta'].includes(category)?'open':''}><summary>${label} · ${foods.length}</summary><div class="lunch-library-items">${foods.sort((a,b)=>a.food.name.localeCompare(b.food.name,'pt')).map(chip).join('')}</div></details>`:'';}).join('')||'<p class="muted">Sem alimentos associados.</p>'}</div></section>`).join('')}</div>`;

}
const ingredientUnits=[['unidade','unidade(s)'],['fatia','fatia(s)'],['g','g'],['kg','kg'],['ml','ml'],['l','l'],['lata','lata(s)'],['embalagem','embalagem(ns)']];
const articleKey=name=>String(name).trim().normalize('NFC').toLocaleLowerCase('pt').replace(/\s+/g,' ');
const directFood=f=>f.purchaseMode==='direct'||(!f.purchaseMode&&!['principal','doce','extra'].includes(f.category));
function ingredientRow(item={}){return `<div class="lunch-ingredient-row"><label>Ingrediente<input name="ingredientName" maxlength="80" value="${clean(item.name||'')}" placeholder="Ex.: Ovos"></label><label>Quantidade por porção<input name="ingredientQuantity" type="number" min="0.001" max="100000" step="any" value="${clean(item.quantity??'')}" placeholder="Ex.: 1"></label><label>Unidade<select name="ingredientUnit">${ingredientUnits.map(([value,label])=>`<option value="${value}" ${value===(item.unit||'unidade')?'selected':''}>${label}</option>`).join('')}</select></label><button type="button" class="alt" data-ingredient-remove aria-label="Remover ingrediente">×</button></div>`;}
function ingredientsEditor(){return `<fieldset class="lunch-recipe"><legend>Lista de compras</legend><label>Como comprar<select name="purchaseMode" data-purchase-mode><option value="ingredients">Comprar os ingredientes</option><option value="direct">Comprar este artigo diretamente</option></select></label><div id="lunchIngredientEditor"><p class="muted">Indica os ingredientes e a quantidade necessária para uma porção deste lanche. Ex.: Pão — 1 unidade; Ovo — 1 unidade. Ingredientes com o mesmo nome e unidade serão somados.</p><div id="lunchIngredientRows">${ingredientRow()}</div><button type="button" class="alt" data-ingredient-add>Adicionar ingrediente</button></div><p class="muted">Para produtos como um iogurte ou uma peça de fruta, podes escolher comprar diretamente: conta uma unidade por porção.</p></fieldset>`;}
function readIngredients(fd){
 if(fd.get('purchaseMode')==='direct')return [];
 const names=fd.getAll('ingredientName'),quantities=fd.getAll('ingredientQuantity'),units=fd.getAll('ingredientUnit');
 const result=[];
 for(let i=0;i<names.length;i++){
  const name=String(names[i]).trim(),raw=String(quantities[i]||'').trim();
  if(!name&&!raw)continue;
  const quantity=Number(raw.replace(',','.')),unit=String(units[i]);
  if(!name||name.length>80||!Number.isFinite(quantity)||quantity<=0||quantity>100000||!ingredientUnits.some(([value])=>value===unit))throw Error('Preenche o nome, uma quantidade positiva e a unidade de cada ingrediente.');
  result.push({name,quantity,unit});
 }
 if(!result.length)throw Error('Adiciona pelo menos um ingrediente ou escolhe «Comprar este artigo diretamente».');
 if(result.length>30)throw Error('Cada alimento pode ter até 30 ingredientes.');
 return result;
}
function normalizedArticle(item){
 const unit=item.unit==='kg'?'g':item.unit==='l'?'ml':item.unit;
 const quantity=Number(item.quantity)*(['kg','l'].includes(item.unit)?1000:1);
 return {key:JSON.stringify([articleKey(item.name),unit]),name:item.name.trim(),quantity,unit};
}
function pantryTotals(){const totals=new Map();for(const item of pantry){const row=normalizedArticle(item);totals.set(row.key,(totals.get(row.key)||0)+row.quantity);}return totals;}
function pantryView(){
 const names=[...new Set([...state.foods.flatMap(f=>directFood(f)?[f.name]:(f.ingredients||[]).map(i=>i.name)),...pantry.map(i=>i.name),...mealShoppingProvider().ingredients.map(i=>i.name)])].sort((a,b)=>a.localeCompare(b,'pt'));
 return `<section class="card lunch-pantry" aria-labelledby="lunchPantryTitle"><div class="lunch-heading"><h3 id="lunchPantryTitle">Tenho em casa</h3><button type="button" class="alt" data-pantry-add ${pantryReady&&storesReady()?'':'disabled'}>+ Adicionar artigo</button></div><p class="muted">O que tens disponível é descontado das compras. As quantidades ficam guardadas na tua conta e só mudam quando as atualizas.</p>${!pantryReady?`<p role="status">${clean(pantryError||'A carregar a lista de casa…')}</p>`:''}<form id="lunchPantryForm" hidden><label>Artigo<input name="pantryName" list="lunchPantryNames" maxlength="80" required placeholder="Ex.: Ovos"><datalist id="lunchPantryNames">${names.map(name=>`<option value="${clean(name)}"></option>`).join('')}</datalist></label><label>Quantidade que tenho<input name="pantryQuantity" type="number" min="0" max="1000000" step="any" required></label><label>Unidade<select name="pantryUnit">${ingredientUnits.map(([value,label])=>`<option value="${value}">${label}</option>`).join('')}</select></label><div class="lunch-pantry-actions"><button type="button" class="alt" data-pantry-cancel>Cancelar</button><button>Guardar</button></div><p class="muted">Guardar substitui a quantidade atual deste artigo; não soma. Usa o mesmo nome do ingrediente da receita.</p></form><div class="lunch-pantry-list">${pantry.slice().sort((a,b)=>a.name.localeCompare(b.name,'pt')).map(item=>`<div class="lunch-pantry-row"><strong>${clean(item.name)}</strong><div class="lunch-pantry-side"><span>${shoppingQuantity(item)}</span><div class="lunch-pantry-actions"><button type="button" class="alt" data-pantry-edit="${clean(item.id)}">Editar</button><button type="button" class="alt" data-pantry-remove="${clean(item.id)}" aria-label="Apagar ${clean(item.name)} da lista de casa">Apagar</button></div></div></div>`).join('')||(pantryReady?'<p>Ainda não tens artigos registados.</p>':'')}</div></section>`;
}
async function storePantryItem(item,oldId=''){
 if(!pantryReady)throw Error('A lista de casa não está disponível. Confirma a ligação e as regras do Firebase antes de guardar.');
 const name=String(item.name||'').trim(),quantity=Number(item.quantity),unit=String(item.unit);
 if(!name||name.length>80||!Number.isFinite(quantity)||quantity<0||quantity>1000000||!ingredientUnits.some(([value])=>value===unit))throw Error('Indica um artigo, uma quantidade válida e a unidade.');
 const id=encodeURIComponent(normalizedArticle({name,quantity,unit}).key);
 if(oldId&&oldId!==id&&pantry.some(p=>p.id===id))throw Error('Esse artigo já existe com a mesma unidade. Edita a quantidade nessa linha.');
 if(!pantry.some(p=>p.id===id)&&pantry.length>=300)throw Error('A lista de casa atingiu o limite de 300 artigos.');
 const batch=writeBatch(dbRef);batch.set(doc(dbRef,'lunchPantry',uid,'items',id),{name,quantity,unit,updatedAt:serverTimestamp()});
 if(oldId&&oldId!==id)batch.delete(doc(dbRef,'lunchPantry',uid,'items',oldId));
 await batch.commit();pantry=pantry.filter(p=>p.id!==oldId&&p.id!==id);pantry.push({id,name,quantity,unit});
}
function shoppingData(){
 const totals=new Map(),pending=new Map();
 for(const plan of state.plans)for(const name of [...plan.morning,...plan.afternoon]){
  const matches=state.foods.map((food,index)=>({food,index})).filter(({food})=>articleKey(food.name)===articleKey(name));
  const signature=food=>JSON.stringify(directFood(food)?'direct':food.ingredients||[]);
  const match=matches[0],ambiguous=matches.some(({food})=>signature(food)!==signature(match.food));
  const recipe=match&&!ambiguous?(directFood(match.food)?[{name:match.food.name,quantity:1,unit:'unidade'}]:match.food.ingredients):null;
  if(!recipe?.length||recipe.some(item=>!item.name||!(Number(item.quantity)>0)||!ingredientUnits.some(([unit])=>unit===item.unit))){pending.set(name,{name,index:match?.index,ambiguous});continue;}
  for(const ingredient of recipe){
   const unit=ingredient.unit==='kg'?'g':ingredient.unit==='l'?'ml':ingredient.unit;
   const quantity=Number(ingredient.quantity)*(['kg','l'].includes(ingredient.unit)?1000:1);
   const key=JSON.stringify([articleKey(ingredient.name),unit]);
   const row=totals.get(key)||{key,name:ingredient.name.trim(),quantity:0,unit};row.quantity+=quantity;totals.set(key,row);
  }
 }
 for(const manual of manualShopping){const item=normalizedArticle(manual);const row=totals.get(item.key)||{key:item.key,name:item.name,quantity:0,unit:item.unit};row.quantity+=item.quantity;totals.set(item.key,row);}
 const mealData=mealShoppingProvider();
 for(const ingredient of mealData.ingredients){const item=normalizedArticle(ingredient);const row=totals.get(item.key)||{key:item.key,name:item.name,quantity:0,unit:item.unit};row.quantity+=item.quantity;totals.set(item.key,row);}
 for(const item of mealData.pending)pending.set('meal:'+item.name,item);
 const stock=pantryTotals(),all=[...totals.values()].map(item=>({...item,needed:item.quantity,have:stock.get(item.key)||0,quantity:Math.max(0,Math.round((item.quantity-(stock.get(item.key)||0))*1e6)/1e6)})).sort((a,b)=>a.name.localeCompare(b.name,'pt')||a.unit.localeCompare(b.unit));
 return {items:all.filter(item=>item.quantity>0),covered:all.filter(item=>item.quantity===0),pending:[...pending.values()]};
}
function shoppingQuantity(item){let quantity=item.quantity,unit=item.unit;if(quantity>=1000&&['g','ml'].includes(unit)){quantity/=1000;unit=unit==='g'?'kg':'l';}const labels={unidade:quantity===1?'unidade':'unidades',fatia:quantity===1?'fatia':'fatias',lata:quantity===1?'lata':'latas',embalagem:quantity===1?'embalagem':'embalagens'};return quantity.toLocaleString('pt-PT',{maximumFractionDigits:3})+' '+(labels[unit]||unit);}
function isPurchased(item){const saved=purchaseChecks.get(item.key);return !!saved?.checked&&Math.abs(saved.quantity-item.quantity)<0.000001;}
function manualShoppingForm(){return `<form id="shoppingManualForm" hidden><label>Artigo<input name="manualName" maxlength="80" required placeholder="Ex.: Detergente"></label><label>Quantidade<input name="manualQuantity" type="number" min="0.001" max="1000000" step="any" required></label><label>Unidade<select name="manualUnit">${ingredientUnits.map(([value,label])=>`<option value="${value}">${label}</option>`).join('')}</select></label>${storePicker('manualStore')}<div class="lunch-pantry-actions"><button type="button" class="alt" data-shopping-manual-cancel>Cancelar</button><button>Guardar artigo</button></div></form>`;}
export function comprasView(previousItems=[]){
 legacyShopping=previousItems;
 const previous=previousItems.filter(item=>!manualShopping.some(saved=>saved.originId===item.id));
 return `<section class="lunch-module"><h2>🛒 Compras+</h2><p class="muted">Uma lista para os ingredientes dos lanches e das refeições, e para tudo o que quiseres acrescentar.</p>${storesNav()}${storesViewSelected()?storesView(shoppingArticleNames()):`<section class="card"><div class="lunch-heading shopping-heading"><h3>Artigos manuais</h3><button type="button" class="alt" data-shopping-manual-add ${pantryReady?'':'disabled'}>+ Adicionar artigo</button></div>${manualShoppingForm()}${manualShopping.length?`<details class="shopping-manual-list"><summary>Gerir artigos adicionados (${manualShopping.length})</summary>${manualShopping.map(item=>`<div class="lunch-pantry-row"><strong>${clean(item.name)}</strong><div class="lunch-pantry-side"><span>${shoppingQuantity(item)}</span><div class="lunch-pantry-actions"><button type="button" class="alt" data-shopping-manual-edit="${clean(item.id)}">Editar</button><button type="button" class="alt" data-shopping-manual-remove="${clean(item.id)}">Apagar</button></div></div></div>`).join('')}</details>`:'<p class="muted">Podes acrescentar alimentos, produtos de limpeza ou outros artigos, mesmo sem um plano de lanches ou refeições.</p>'}${previous.length?`<details class="shopping-legacy"><summary>Artigos anteriores deste navegador (${previous.length})</summary><p class="muted">Confirma as quantidades ao importar para a tua conta. Os registos originais são mantidos neste navegador.</p>${previous.map(item=>`<div class="lunch-pantry-row"><span>${clean(item.title)}<small class="lunch-shopping-stock">${clean(item.detail||'Quantidade por confirmar')}</small></span><button type="button" class="alt" data-shopping-import="${clean(item.id)}" ${pantryReady?'':'disabled'}>Importar</button></div>`).join('')}</details>`:''}</section>${pantryView()}${shoppingView()}`}</section>`;
}
async function storeManualShopping(form){
 if(!pantryReady)throw Error('Confirma a ligação e as regras do Firebase antes de guardar.');
 const fd=new FormData(form),name=String(fd.get('manualName')||'').trim(),quantity=Number(fd.get('manualQuantity')),unit=String(fd.get('manualUnit'));
 if(!name||name.length>80||!Number.isFinite(quantity)||quantity<=0||quantity>1000000||!ingredientUnits.some(([value])=>value===unit))throw Error('Indica um artigo, uma quantidade positiva e a unidade.');
 if(!form.dataset.edit&&manualShopping.length>=300)throw Error('Podes manter até 300 artigos manuais.');
 const id=form.dataset.edit||crypto.randomUUID(),originId=form.dataset.origin||manualShopping.find(item=>item.id===id)?.originId||'';
 const item={name,quantity,unit,...(originId?{originId}:{})};
 const choice=prepareStoreChoice(name,(form.dataset.storeTouched||fd.get('manualStore'))?fd.get('manualStore'):storeFor(name),fd.get('manualStoreOther'));const batch=writeBatch(dbRef);batch.set(doc(dbRef,'shoppingManual',uid,'items',id),{...item,updatedAt:serverTimestamp()});batch.set(choice.ref,choice.data);await batch.commit();applyStoreChoice(choice);manualShopping=manualShopping.filter(row=>row.id!==id);manualShopping.push({...item,id});
}
function shoppingArticleNames(){return [...state.foods.flatMap(f=>directFood(f)?[f.name]:(f.ingredients||[]).map(i=>i.name)),...manualShopping.map(i=>i.name),...pantry.map(i=>i.name),...(mealShoppingProvider().articles||mealShoppingProvider().ingredients.map(i=>i.name))];}
function groupedShoppingTables(items){return groupByStore(items).map(([store,rows])=>`<div class="shopping-store-group"><div class="shopping-store-heading"><h4>${clean(store)}</h4><small>${rows.filter(item=>!isPurchased(item)).length} por comprar</small></div><table class="lunch-shopping-table"><thead><tr><th scope="col">Artigo</th><th scope="col">Quantidade</th></tr></thead><tbody>${rows.map(item=>`<tr class="${isPurchased(item)?'shopping-purchased':''}"><td><label class="lunch-buy-check"><input type="checkbox" data-shopping-done="${clean(item.key)}" aria-label="Marcar ${clean(item.name)} como comprado" ${isPurchased(item)?'checked':''} ${pantryReady?'':'disabled'}><span>${clean(item.name)}<small class="lunch-shopping-stock">Necessário: ${shoppingQuantity({...item,quantity:item.needed})} · Em casa: ${shoppingQuantity({...item,quantity:item.have})}</small></span></label></td><td><div class="lunch-shopping-side"><span>${shoppingQuantity(item)}</span><button type="button" class="alt" data-pantry-have="${clean(item.key)}" ${pantryReady?'':'disabled'}>Já tenho</button></div></td></tr>`).join('')}</tbody></table></div>`).join('');}
function shoppingView(){const {items,pending,covered}=shoppingData();return `<section class="card lunch-shopping" aria-labelledby="lunchShoppingTitle"><div class="lunch-heading"><h3 id="lunchShoppingTitle">Lista de compras por supermercado</h3><div class="lunch-pantry-actions"><button type="button" class="alt" data-shopping-reset ${purchaseChecks.size?'':'disabled'}>Reiniciar checks</button><button type="button" class="alt" data-lunch-whatsapp>Enviar por WhatsApp</button></div></div>${storesNotice()}<p class="muted">Escolhe as lojas em «Onde compro os ingredientes». Marca os artigos à medida que os compras. O WhatsApp inclui apenas os que ainda faltam. As quantidades já descontam o que tens em casa; marcar como comprado não altera essa lista.</p>${pending.length?`<div class="lunch-shopping-pending"><strong>Compras incompletas</strong><p>Há ingredientes ou dados por carregar. Resolve os itens abaixo antes de enviar a lista.</p><ul>${pending.map(item=>`<li><span>${clean(item.name)}${item.ambiguous?' — há alimentos com o mesmo nome e ingredientes diferentes. Usa nomes distintos.':''}</span>${item.module==='meals'?`<button type="button" class="alt" ${item.recipeId?'data-meal-recipe="'+clean(item.recipeId)+'"':'data-go="refeicoes"'}>Abrir Refeições+</button>`:item.index!==undefined?`<button type="button" class="alt" data-lunch-edit="${item.index}">Definir ingredientes</button>`:'<span>Adiciona este alimento à biblioteca.</span>'}</li>`).join('')}</ul></div>`:''}${items.length?groupedShoppingTables(items):(pending.length?'<p>A lista aparecerá depois de definires os ingredientes das receitas.</p>':'<p>Não há artigos em falta. Adiciona artigos manualmente ou gera um plano de lanches ou refeições.</p>')}${covered.length?`<p class="muted">Já tens quantidade suficiente: ${covered.map(item=>clean(item.name)).join(', ')}.</p>`:''}</section>`;}
export function lanchesView(){return `<section class="lunch-module"><h2>🥪 Lanches+</h2><p class="muted">Organiza os lanches da manhã e da tarde para cada filho. Os dados são privados da tua conta.</p>${manualLunchView()}<details class="card"><summary><strong>Biblioteca de alimentos (${state.foods.length})</strong></summary><form id="lunchFoodForm" class="lunch-form"><label>Alimento<input name="name" maxlength="80" required placeholder="Ex.: Pão com queijo"></label><label>Categoria<select name="category">${[['principal','Principal'],['fruta','Fruta'],['bebida','Bebida'],['laticinio','Laticínio'],['vegetal','Vegetal'],['extra','Complemento'],['doce','Doce']].map(([v,n])=>`<option value="${v}">${n}</option>`).join('')}</select></label><label>Preferido por<select name="kid"><option value="">Sem preferência</option>${children.map(k=>`<option value="${clean(k.uid)}">${clean(k.name)}</option>`).join('')}${children.length>1?`<option value="__all">${children.length===2?'Ambos':'Todos os filhos'}</option>`:''}</select></label>${ingredientsEditor()}<div class="lunch-food-save-actions"><button type="button" class="alt" data-lunch-cancel hidden>Cancelar</button><button>Adicionar alimento</button></div></form>${foodLibraryGroups()}</details><div class="card"><h3>Gerar plano</h3><form id="lunchGenerateForm" class="lunch-form"><label>Semanas<select name="weeks">${[1,2,4,8].map(n=>`<option value="${n}" ${n===4?'selected':''}>${n}</option>`).join('')}</select></label><label><input type="checkbox" name="weekend"> Incluir fins de semana</label><label class="lunch-repeat"><input type="checkbox" name="repeat"> Aceitar repetições se faltarem opções</label><fieldset class="lunch-afternoon-settings"><legend>Gerar lanche da tarde</legend><div class="lunch-kids">${children.map(k=>`<label><input type="checkbox" name="afternoonKids" value="${clean(k.uid)}" ${!state.plans.some(p=>p.kidId===k.uid)||state.plans.some(p=>p.kidId===k.uid&&p.afternoon.length)?'checked':''}> ${clean(k.name)}</label>`).join('')}</div><small>Desmarca os filhos que só precisam de lanche da manhã.</small></fieldset><p class="lunch-sweet-info">À tarde: um alimento e fruta, quando disponível. Se faltar fruta para variar durante a semana, aparece um aviso antes de gerar.</p><p class="lunch-sweet-info">Doce: uma vez por filho e por semana, quando existir na biblioteca. Substitui o principal da manhã, mantendo a bebida ou o iogurte. O dia roda de semana para semana.</p><button ${!children.length?'disabled':''}>Gerar lanches</button></form>${!children.length?'<p>Adiciona primeiro um filho à família.</p>':''}</div>${state.plans.length?`<div class="card"><div class="lunch-heading"><h3>Plano de refeições</h3><div class="lunch-plan-actions"><button type="button" class="alt" data-lunch-print>Imprimir</button><button type="button" class="alt" data-lunch-clear>Apagar plano</button></div></div>${plansByChild()}<div class="lunch-pantry-actions"><button type="button" class="alt" data-go="compras">Ver lista de compras</button></div></div>`:''}</section>`;}
export async function lunchSubmit(e,render){if(e.target.id==='shoppingManualForm'){e.preventDefault();const button=e.submitter;if(button)button.disabled=true;try{await storeManualShopping(e.target);render();notify('Artigo guardado nas compras.');}finally{if(button)button.disabled=false;}return;}if(e.target.id==='lunchPantryForm'){e.preventDefault();const button=e.submitter;if(button)button.disabled=true;try{const fd=new FormData(e.target);await storePantryItem({name:fd.get('pantryName'),quantity:fd.get('pantryQuantity'),unit:fd.get('pantryUnit')},e.target.dataset.edit||'');render();notify('Lista de casa atualizada.');}finally{if(button)button.disabled=false;}return;}if(e.target.id==='lunchManualForm'){e.preventDefault();const button=e.submitter;if(button)button.disabled=true;try{if(await saveManualLunch(new FormData(e.target))){render();notify('Lanche guardado.');}}finally{if(button)button.disabled=false;}}else if(e.target.id==='lunchFoodForm'){e.preventDefault();const fd=new FormData(e.target),name=String(fd.get('name')||'').trim();if(!name)return;const form=e.target, editing=form.dataset.edit!==undefined, i=Number(form.dataset.edit);
 const foods=state.foods.slice(), food={name,category:String(fd.get('category')),purchaseMode:fd.get('purchaseMode')==='direct'?'direct':'ingredients',ingredients:readIngredients(fd),children:fd.get('kid')==='__all'?children.map(k=>k.uid):fd.get('kid')==='__keep'&&editing?(foods[i]?.children||[]):children.filter(k=>k.uid===fd.get('kid')).map(k=>k.uid)};
 if(editing){if(!foods[i])return;foods[i]={...foods[i],...food};}else foods.push(food);
 const oldName=editing?state.foods[i].name:null;
 const plans=oldName&&oldName!==name?state.plans.map(p=>({...p,morning:p.morning.map(f=>f===oldName?name:f),afternoon:p.afternoon.map(f=>f===oldName?name:f)})):state.plans;
 await setDoc(doc(dbRef,'lunchSettings',uid),{...state,foods,plans});state.foods=foods;state.plans=plans;
 render();document.getElementById('lunchFoodForm').closest('details').open=true;
 notify(editing?'Alimento atualizado.':'Alimento adicionado.');}else if(e.target.id==='lunchGenerateForm'){e.preventDefault();if(!children.length)return;const fd=new FormData(e.target);const afternoonIds=fd.getAll('afternoonKids');const plans=build(Math.min(8,Math.max(1,Number(fd.get('weeks'))||4)),fd.has('weekend'),fd.has('repeat'),afternoonIds);const warnings=afternoonVarietyWarnings(afternoonIds,fd.has('weekend')?7:5);const confirmation=[...(state.plans.length?['O plano anterior será substituído.']:[]),...warnings,...(warnings.length?['Podes cancelar para adicionar mais fruta à biblioteca ou gerar o plano nestas condições. Gerar mesmo assim?']:['Substituir o plano anterior?'])];if((warnings.length||state.plans.length)&&!confirm(confirmation.join('\n\n')))return;await setDoc(doc(dbRef,'lunchSettings',uid),{...state,plans});state.plans=plans;render();notify('Plano e lista de compras guardados.');}}
export async function lunchClick(e,render){
 const doneBox=e.target.closest('[data-shopping-done]');
 if(doneBox){const key=doneBox.dataset.shoppingDone,item=shoppingData().items.find(row=>row.key===key);if(!item||!pantryReady)return;const previous=isPurchased(item);doneBox.disabled=true;try{const checked=doneBox.checked;await setDoc(doc(dbRef,'shoppingChecks',uid,'items',encodeURIComponent(key)),{checked,quantity:item.quantity,updatedAt:serverTimestamp()});purchaseChecks.set(key,{checked,quantity:item.quantity});const row=doneBox.closest('tr');row?.classList.toggle('shopping-purchased',checked);const group=row?.closest('.shopping-store-group');if(group){const counter=group.querySelector('.shopping-store-heading small');if(counter)counter.textContent=[...group.querySelectorAll('[data-shopping-done]')].filter(box=>!box.checked).length+' por comprar';}const reset=document.querySelector('[data-shopping-reset]');if(reset)reset.disabled=false;}catch(error){doneBox.checked=previous;throw error;}finally{doneBox.disabled=false;}return;}
 if(e.target.closest('[data-shopping-reset]')){if(!confirm('Reiniciar os checks de comprado? As quantidades em casa e os artigos mantêm-se.'))return;const keys=[...purchaseChecks.keys()];for(let i=0;i<keys.length;i+=400){const chunk=keys.slice(i,i+400),batch=writeBatch(dbRef);for(const key of chunk)batch.delete(doc(dbRef,'shoppingChecks',uid,'items',encodeURIComponent(key)));await batch.commit();for(const key of chunk)purchaseChecks.delete(key);}render();notify('Checks reiniciados.');return;}
 if(e.target.closest('[data-shopping-manual-cancel]')){document.getElementById('shoppingManualForm').hidden=true;return;}
 const manualAdd=e.target.closest('[data-shopping-manual-add]'),manualEdit=e.target.closest('[data-shopping-manual-edit]'),manualImport=e.target.closest('[data-shopping-import]');
 if(manualAdd||manualEdit||manualImport){const form=document.getElementById('shoppingManualForm');form.reset();delete form.dataset.edit;delete form.dataset.origin;delete form.dataset.storeTouched;if(manualEdit){const item=manualShopping.find(row=>row.id===manualEdit.dataset.shoppingManualEdit);if(!item)return;form.dataset.edit=item.id;form.elements.manualName.value=item.name;form.elements.manualQuantity.value=item.quantity;form.elements.manualUnit.value=item.unit;}if(manualImport){const item=legacyShopping.find(row=>row.id===manualImport.dataset.shoppingImport);if(!item)return;form.dataset.origin=item.id;form.elements.manualName.value=item.title;notify('Confirma a quantidade e a unidade antes de guardar.');}updateStorePicker(form.elements.manualStore,storeFor(form.elements.manualName.value));form.hidden=false;form.elements.manualName.focus();return;}
 const manualRemove=e.target.closest('[data-shopping-manual-remove]');if(manualRemove){const id=manualRemove.dataset.shoppingManualRemove;if(!confirm('Apagar este artigo manual das compras?'))return;manualRemove.disabled=true;try{await deleteDoc(doc(dbRef,'shoppingManual',uid,'items',id));manualShopping=manualShopping.filter(item=>item.id!==id);render();notify('Artigo manual apagado.');}finally{manualRemove.disabled=false;}return;}

 if(e.target.closest('[data-pantry-cancel]')){document.getElementById('lunchPantryForm').hidden=true;return;}
 const pantryEdit=e.target.closest('[data-pantry-edit]'),pantryAdd=e.target.closest('[data-pantry-add]');
 if(pantryEdit||pantryAdd){const form=document.getElementById('lunchPantryForm');const item=pantryEdit?pantry.find(p=>p.id===pantryEdit.dataset.pantryEdit):null;form.reset();delete form.dataset.edit;if(item){form.dataset.edit=item.id;form.elements.pantryName.value=item.name;form.elements.pantryQuantity.value=item.quantity;form.elements.pantryUnit.value=item.unit;}form.hidden=false;form.elements.pantryName.focus();return;}
 const pantryRemove=e.target.closest('[data-pantry-remove]');
 if(pantryRemove){const id=pantryRemove.dataset.pantryRemove,item=pantry.find(p=>p.id===id);if(!item||!confirm('Apagar '+item.name+' da lista de casa? A quantidade necessária volta a aparecer nas compras.'))return;pantryRemove.disabled=true;try{await deleteDoc(doc(dbRef,'lunchPantry',uid,'items',id));pantry=pantry.filter(p=>p.id!==id);render();notify('Artigo retirado da lista de casa.');}finally{pantryRemove.disabled=false;}return;}
 const pantryHave=e.target.closest('[data-pantry-have]');
 if(pantryHave){const item=shoppingData().items.find(p=>p.key===pantryHave.dataset.pantryHave);if(!item)return;pantryHave.disabled=true;try{await storePantryItem({name:item.name,quantity:item.needed,unit:item.unit});render();notify(item.name+': quantidade necessária registada em casa.');}finally{pantryHave.disabled=false;}return;}

 const shoppingBox=e.target.closest('[data-shopping-key]');
 if(shoppingBox){if(shoppingBox.checked)shoppingExcluded.delete(shoppingBox.dataset.shoppingKey);else shoppingExcluded.add(shoppingBox.dataset.shoppingKey);return;}
 if(e.target.closest('[data-ingredient-add]')){const rows=document.getElementById('lunchIngredientRows');if(rows.children.length>=30){notify('Podes adicionar até 30 ingredientes.');return;}rows.insertAdjacentHTML('beforeend',ingredientRow());rows.lastElementChild.querySelector('input').focus();return;}
 const removeIngredient=e.target.closest('[data-ingredient-remove]');if(removeIngredient){removeIngredient.closest('.lunch-ingredient-row').remove();return;}

 if(e.target.closest('[data-lunch-whatsapp]')){
  if(!storesReady()){notify('Carrega primeiro os supermercados para enviar a lista por loja.');return;}
  if(!pantryReady){notify('A lista de casa não foi carregada. Confirma a ligação e as regras do Firebase antes de enviar.');return;}
  const {items,pending}=shoppingData();
  if(pending.length){notify('Resolve primeiro os itens assinalados para não enviares uma lista incompleta.');return;}
  const selected=items.filter(item=>!isPurchased(item));
  if(!selected.length){notify('Não há artigos por comprar para enviar.');return;}
  const lines=groupByStore(selected).flatMap(([store,rows])=>['*'+store+'*',...rows.map(item=>'☐ '+item.name+' × '+shoppingQuantity(item)),'']);
  const link=new URL(window.location.href);link.search='';link.hash='';link.searchParams.set('app','compras');
  const message=['Lista de compras — Família+','',...lines,'','Abrir no Compras+ para marcar como comprado (requer a tua conta):',link.href].join('\n');
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
  if(cancel){form.reset();document.getElementById('lunchIngredientRows').innerHTML=ingredientRow();document.getElementById('lunchIngredientEditor').hidden=false;delete form.dataset.edit;submit.textContent='Adicionar alimento';cancel.hidden=true;return;}
  const i=Number(edit.dataset.lunchEdit),food=state.foods[i];if(!food)return;
  form.dataset.edit=String(i);
  form.elements.namedItem('name').value=food.name;
  form.elements.category.value=food.category;
  form.elements.purchaseMode.value=directFood(food)?'direct':'ingredients';
  document.getElementById('lunchIngredientRows').innerHTML=food.ingredients?.length?food.ingredients.map(ingredientRow).join(''):ingredientRow();
  document.getElementById('lunchIngredientEditor').hidden=directFood(food);
  document.querySelectorAll('#lunchIngredientRows input,#lunchIngredientRows select').forEach(el=>el.disabled=directFood(food));
  form.closest('details').open=true;form.scrollIntoView({block:'start',behavior:'smooth'});
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
