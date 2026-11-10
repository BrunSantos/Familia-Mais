import {weekDateKey,weekRangeLabel} from './semana-v90.js';

const KEY='familiamais_planner_v2';
const clean=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
let items=[];
try{items=JSON.parse(localStorage.getItem(KEY)||'[]');if(!Array.isArray(items))items=[]}catch{items=[]}
const save=()=>localStorage.setItem(KEY,JSON.stringify(items));
const labels={agenda:'📅 Agenda+',compras:'🛒 Compras+',refeicoes:'🍽️ Refeições+'};
export function extrasView(tab,kids){
 const mine=items.filter(x=>x.type===tab).sort((a,b)=>(a.date||'').localeCompare(b.date||''));
 const isAgenda=tab==='agenda',isShop=tab==='compras';
 return `<section class="family-extra"><h2>${labels[tab]}</h2><p class="family-note">Esta primeira versão guarda os dados deste módulo neste navegador. Ainda não sincroniza com o Firebase nem com outros dispositivos.</p>
 <form id="familyExtraForm" data-type="${tab}">
 <label>${isAgenda?'Compromisso':isShop?'Produto':'Refeição'}<input name="title" required maxlength="120" placeholder="${isAgenda?'Ex.: Futebol':isShop?'Ex.: Maçãs':'Ex.: Massa com frango'}"></label>
 <label>${isAgenda?'Data e hora':isShop?'Comprar até':'Dia'}<input name="date" type="${isAgenda?'datetime-local':'date'}" required></label>
 <label>${isShop?'Quantidade':'Notas'}<input name="detail" maxlength="160" placeholder="${isShop?'Ex.: 6 unidades':'Opcional'}"></label>
 <label>Para quem?<select name="kid"><option value="">Toda a família</option>${kids.map(k=>`<option value="${clean(k.uid)}">${clean(k.name)}</option>`).join('')}</select></label>
 <button type="submit">Adicionar</button></form>
 <div class="family-items">${mine.length?mine.map((x,index)=>`${isAgenda&&(index===0||weekDateKey(mine[index-1].date)!==weekDateKey(x.date))?`<h3 class="agenda-week-title">${clean(weekRangeLabel(x.date))}</h3>`:''}<article class="family-item"><div><strong>${clean(x.title)}</strong><div>${clean(x.date.replace('T',' '))} ${clean(x.detail||'')}</div><small>${clean(x.kidId?(kids.find(k=>k.uid===x.kidId)?.name||'Perfil indisponível'):'Toda a família')}</small></div><button type="button" class="alt" data-family-delete="${clean(x.id)}">Eliminar</button></article>`).join(''):'<p>Sem registos. Adiciona o primeiro acima.</p>'}</div></section>`;
}
export function extrasSubmit(form,kids){
 const fd=new FormData(form),type=form.dataset.type,title=String(fd.get('title')||'').trim(),date=String(fd.get('date')||''),detail=String(fd.get('detail')||'').trim();
 if(!title||!date||!labels[type])return false;
 items.push({id:crypto.randomUUID(),type,title,date,detail,kidId:kids.find(k=>k.uid===fd.get('kid'))?.uid||''});save();return true;
}
export function extrasDelete(id){const old=items.length;items=items.filter(x=>x.id!==id);save();return old!==items.length;}

export function previousShoppingItems(){return items.filter(item=>item.type==='compras');}
