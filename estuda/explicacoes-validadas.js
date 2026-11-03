(function(){
'use strict';
function init(){
const source=document.getElementById('estuda-explanations');if(!source)return;
let data;try{data=JSON.parse(source.textContent)}catch(e){return}
const sections=[...document.querySelectorAll('section.card[id^="q"]')];
sections.forEach((section,i)=>{const d=data[i];if(!d)return;
if(d.hint){const details=document.createElement('details');details.className='estuda-dica';const summary=document.createElement('summary');summary.textContent='💡 Ver uma dica e um exemplo resolvido';details.append(summary);const p=document.createElement('p');p.textContent=d.hint;details.append(p);const ex=document.createElement('p');ex.textContent=d.example;details.append(ex);section.append(details)}
if(d.after){const explanation=document.createElement('div');explanation.className='estuda-explicacao';explanation.hidden=true;const title=document.createElement('strong');title.textContent='📖 Explicação';const p=document.createElement('p');p.textContent=d.after;explanation.append(title,p);if(d.image){const figure=document.createElement('figure');const img=document.createElement('img');img.src='../assets/esquema-'+d.image+'.svg';img.alt='Esquema de apoio à explicação';img.loading='lazy';figure.append(img);explanation.append(figure)}section.append(explanation)}
});
const btn=[...document.querySelectorAll('button')].find(b=>/^Corrigir (respostas|ficha)$/i.test(b.textContent.trim()));if(!btn)return;
// Correção e feedback são produzidos pela função original. Só mostramos explicações quando há feedback real.
btn.addEventListener('click',()=>{queueMicrotask(()=>{const complete=sections.every(s=>s.querySelector('input[type=radio]:checked'));const corrected=sections.some(s=>{const el=s.querySelector('.feedback');return el&&/\b(good|bad)\b/.test(el.className)});if(!complete||!corrected)return;sections.forEach(s=>{const el=s.querySelector('.estuda-explicacao');if(el)el.hidden=false})})});
}
const style=document.createElement('style');style.textContent='.estuda-dica,.estuda-explicacao{margin-top:12px;padding:13px;border-radius:10px;background:#eef5fd;color:#193e70;border:1px solid #cbdff3}.estuda-dica summary{cursor:pointer;font-weight:700}.estuda-dica p,.estuda-explicacao p{line-height:1.55}.estuda-explicacao[hidden]{display:none!important}.estuda-explicacao figure{margin:12px 0 0}.estuda-explicacao img{max-width:100%;height:auto;max-height:280px;object-fit:contain}';document.head.append(style);
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init);else init();
})();