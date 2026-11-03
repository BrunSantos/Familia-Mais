/* Estuda+ — badge NOVO durante os primeiros 14 dias desde data-added (AAAA-MM-DD). */
(function(){
  const MS_DIA=86400000;
  const hoje=new Date();
  const hojeUTC=Date.UTC(hoje.getFullYear(),hoje.getMonth(),hoje.getDate());
  const css=document.createElement('style');
  css.textContent='.ep-novo{display:inline-flex;align-items:center;gap:4px;margin:0 0 0 7px;padding:4px 8px;border-radius:999px;background:#fff0c2;color:#6d4600;border:1px solid #e7bf55;font-size:.72rem;font-weight:800;vertical-align:middle;white-space:nowrap}.ep-novo:before{content:"✦"}';
  document.head.appendChild(css);
  // Fichas adicionadas mais recentemente aparecem sempre primeiro,
  // mesmo depois de desaparecer o indicador NOVO.
  document.querySelectorAll('.grid').forEach(function(grid){
    const cards=Array.from(grid.children);
    if(!cards.some(function(card){return card.matches('.tile[data-added]');}))return;
    cards.map(function(card,index){return {card:card,index:index,date:card.getAttribute('data-added')||''};})
      .sort(function(a,b){return b.date.localeCompare(a.date)||a.index-b.index;})
      .forEach(function(item){grid.appendChild(item.card);});
  });
  document.querySelectorAll('.tile[data-added]').forEach(function(card){
    const raw=card.getAttribute('data-added');
    if(!/^\d{4}-\d{2}-\d{2}$/.test(raw))return;
    const parts=raw.split('-').map(Number);
    const inicio=Date.UTC(parts[0],parts[1]-1,parts[2]);
    const dt=new Date(inicio);
    if(dt.getUTCFullYear()!==parts[0]||dt.getUTCMonth()!==parts[1]-1||dt.getUTCDate()!==parts[2])return;
    const dias=(hojeUTC-inicio)/MS_DIA;
    if(dias<0||dias>=14)return;
    const title=card.querySelector('h3');
    if(!title||title.querySelector('.ep-novo'))return;
    const badge=document.createElement('span');
    badge.className='ep-novo';
    badge.textContent='NOVO';
    badge.setAttribute('aria-label','Ficha nova');
    title.appendChild(badge);
  });
})();
