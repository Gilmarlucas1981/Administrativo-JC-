const KEY="jc_pavimentacao_administrativo_v1";
const SECTORS={
  "Escritório":["RH","Compras","Administrativo","Engenharia","Portaria","Limpeza","Contabilidade","TI","Telefonia e Internet","Material de escritório","Honorários","Seguros"],
  "Obras":["Manutenção","Equipamentos","Aluguel","Refeição","Combustível","Peças","Pedágio","Locação de veículos","EPIs","Frete","Hospedagem","Sinalização","Laboratório","Terceiros","Ferramentas","Mobilização","Desmobilização"],
  "Financeiro":["Empréstimos","Financiamentos","Juros","Tarifas bancárias","Antecipações","Seguros financeiros"],
  "Impostos":["FGTS","INSS","DARF","ISS","IRPJ","CSLL","PIS","COFINS","Simples Nacional","Taxas municipais","Taxas estaduais","Outros impostos"],
  "Utilidades":["Água","Luz","Internet","Telefone","Gás"],
  "Frota":["Combustível","Manutenção","Pneus","Seguro","IPVA","Licenciamento","Locação de veículos","Rastreamento"],
  "Outros":["Despesas diversas","Acordos","Multas","Custas","Outros"]
};
let state=load(),editR=null,editP=null,dailyTab='all';
function initial(){return{receivables:[],payables:[],loans:[]}}
function load(){try{return {...initial(),...JSON.parse(localStorage.getItem(KEY))}}catch(e){return initial()}}
function save(){localStorage.setItem(KEY,JSON.stringify(state))}
const brl=v=>Number(v||0).toLocaleString("pt-BR",{style:"currency",currency:"BRL"});
const today=()=>new Date().toISOString().slice(0,10);
const monthStart=()=>today().slice(0,7)+"-01";
const uid=()=>crypto.randomUUID?crypto.randomUUID():String(Date.now())+Math.random();
function go(v){document.querySelectorAll(".view").forEach(x=>x.classList.remove("active"));document.getElementById(v).classList.add("active");scrollTo(0,0);renderAll();if(v==="dailyPayments")renderDailyPayments()}
function setup(){
  dashStart.value=monthStart();dashEnd.value=today();dreStart.value=monthStart();dreEnd.value=today();
  rPeriodStart.value=monthStart();rPeriodEnd.value=today();rDue.value=today();
  pCompetence.value=today().slice(0,7);pDue.value=today();pDue2.value="";pPaidDate.value="";dailyPaymentDate.value=today();lDue.value=today();
  pSector.innerHTML=Object.keys(SECTORS).map(x=>`<option>${x}</option>`).join("");
  pSectorFilter.innerHTML='<option value="">Todos os setores</option>'+Object.keys(SECTORS).map(x=>`<option>${x}</option>`).join("");
  fillPayableCategories();renderAll();
}
function fillPayableCategories(){pCategory.innerHTML=(SECTORS[pSector.value]||[]).map(x=>`<option>${x}</option>`).join("")}
function inRange(d,s,e){return(!s||d>=s)&&(!e||d<=e)}
function effectiveDue(p){return p.due2||p.due}
function overdue(p){return p.status!=="pago"&&effectiveDue(p)<today()}
function dueSoon(p,days=3){
  if(p.status==="pago")return false;
  const due=new Date(effectiveDue(p)+"T12:00:00"),now=new Date(today()+"T12:00:00");
  const diff=Math.ceil((due-now)/86400000);
  return diff>=0&&diff<=days;
}
function renderAll(){renderDashboard();renderReceivables();renderPayables();renderDailyPayments();renderDRE();renderLoans();renderOverdue()}
function renderDashboard(){
  const s=dashStart.value,e=dashEnd.value;
  const r=state.receivables.filter(x=>inRange(x.due,s,e)),p=state.payables.filter(x=>inRange(x.due,s,e));
  const toReceive=r.reduce((a,x)=>a+(x.amount-x.received),0),received=r.reduce((a,x)=>a+x.received,0);
  const toPay=p.filter(x=>x.status!=="pago").reduce((a,x)=>a+x.amount,0),paid=p.filter(x=>x.status==="pago").reduce((a,x)=>a+x.amount,0);
  const overdueV=state.payables.filter(overdue).reduce((a,x)=>a+x.amount,0);
  const result=received-paid;
  kpis.innerHTML=`<div class="kpi"><span>A receber</span><b>${brl(toReceive)}</b></div><div class="kpi"><span>A pagar</span><b class="warn">${brl(toPay)}</b></div><div class="kpi"><span>Vencidas</span><b class="bad">${brl(overdueV)}</b></div><div class="kpi"><span>Resultado caixa</span><b class="${result>=0?"good":"bad"}">${brl(result)}</b></div>`;
  const sectors={};p.forEach(x=>sectors[x.sector]=(sectors[x.sector]||0)+x.amount);
  sectorSummary.innerHTML=Object.entries(sectors).sort((a,b)=>b[1]-a[1]).map(([k,v])=>`<div class="row"><span>${k}</span><b>${brl(v)}</b></div>`).join("")||'<div class="meta">Sem despesas no período.</div>';
  const ovs=state.payables.filter(overdue).sort((a,b)=>a.due.localeCompare(b.due)).slice(0,6);
  const alerts=state.payables.filter(x=>dueSoon(x)).sort((a,b)=>effectiveDue(a).localeCompare(effectiveDue(b))).slice(0,4);
  overdueSummary.innerHTML=(ovs.map(x=>`<div class="row"><div><b>${x.description}</b><div class="meta">${x.sector} · vencido ${effectiveDue(x).split("-").reverse().join("/")}</div></div><b class="bad">${brl(x.amount)}</b></div>`).join("")+
  alerts.map(x=>`<div class="row"><div><b>⚠ ${x.description}</b><div class="meta">${x.sector} · vence ${effectiveDue(x).split("-").reverse().join("/")}</div></div><b class="warn">${brl(x.amount)}</b></div>`).join(""))||'<div class="meta">Nenhuma dívida vencida ou próxima.</div>';
  const rec=state.receivables.filter(x=>x.status!=="recebido"&&x.due>=today()).sort((a,b)=>a.due.localeCompare(b.due)).slice(0,6);
  receivableDueSummary.innerHTML=rec.map(x=>`<div class="row"><div><b>${x.company}</b><div class="meta">${x.contract||"Sem contrato"} · ${x.due.split("-").reverse().join("/")}</div></div><b>${brl(x.amount-x.received)}</b></div>`).join("")||'<div class="meta">Nenhum recebimento próximo.</div>';
}
function saveReceivable(){
  const company=rCompany.value.trim(),amount=Number(rAmount.value||0);if(!company||amount<=0)return alert("Informe empresa e valor.");
  const obj={company,contract:rContract.value.trim(),description:rDescription.value.trim(),periodStart:rPeriodStart.value,periodEnd:rPeriodEnd.value,due:rDue.value,amount,received:Number(rReceived.value||0),status:rStatus.value,notes:rNotes.value.trim()};
  if(editR){let i=state.receivables.findIndex(x=>x.id===editR);state.receivables[i]={...state.receivables[i],...obj}}else state.receivables.push({id:uid(),...obj});
  save();resetReceivable();renderAll();
}
function editReceivable(id){const x=state.receivables.find(v=>v.id===id);if(!x)return;editR=id;receivableFormTitle.textContent="Editar recebimento";cancelReceivableEdit.classList.remove("hidden");rCompany.value=x.company;rContract.value=x.contract;rDescription.value=x.description;rPeriodStart.value=x.periodStart;rPeriodEnd.value=x.periodEnd;rDue.value=x.due;rAmount.value=x.amount;rReceived.value=x.received;rStatus.value=x.status;rNotes.value=x.notes||"";scrollTo(0,0)}
function deleteReceivable(id){if(!confirm("Excluir conta a receber?"))return;state.receivables=state.receivables.filter(x=>x.id!==id);save();renderAll()}
function resetReceivable(){editR=null;receivableFormTitle.textContent="Novo recebimento";cancelReceivableEdit.classList.add("hidden");rCompany.value="";rContract.value="";rDescription.value="";rAmount.value="";rReceived.value="";rStatus.value="pendente";rNotes.value=""}
function renderReceivables(){
  const q=(rSearch.value||"").toLowerCase(),st=rStatusFilter.value;
  const arr=[...state.receivables].sort((a,b)=>b.due.localeCompare(a.due)).filter(x=>(!q||(x.company+" "+x.contract+" "+x.description).toLowerCase().includes(q))&&(!st||x.status===st));
  receivableList.innerHTML=arr.map(x=>`<div class="item-card"><div class="head"><div><h3>${x.company}</h3><div class="meta">${x.contract||"Sem contrato"} · venc. ${x.due.split("-").reverse().join("/")}</div></div><div class="money">${brl(x.amount)}</div></div><div class="meta">${x.description||"Recebimento"} · período ${x.periodStart?.split("-").reverse().join("/")||"-"} a ${x.periodEnd?.split("-").reverse().join("/")||"-"}</div><span class="status ${x.status}">${x.status}</span><div class="row"><span>Recebido</span><b>${brl(x.received)}</b></div><div class="row"><span>Saldo</span><b>${brl(x.amount-x.received)}</b></div><div class="mini-actions"><button onclick="editReceivable('${x.id}')">Editar</button><button class="danger" onclick="deleteReceivable('${x.id}')">Excluir</button></div></div>`).join("")||'<div class="card meta">Nenhuma conta a receber.</div>';
}
function savePayable(){
  const amount=Number(pAmount.value||0),desc=pDescription.value.trim();if(amount<=0||!desc)return alert("Informe descrição e valor.");
  const obj={sector:pSector.value,category:pCategory.value,vendor:pVendor.value.trim(),description:desc,competence:pCompetence.value,due:pDue.value,due2:pDue2.value,paidDate:pStatus.value==="pago"?(pPaidDate.value||today()):pPaidDate.value,amount,status:pStatus.value,costCenter:pCostCenter.value.trim(),document:pDocument.value.trim(),notes:pNotes.value.trim()};
  if(editP){let i=state.payables.findIndex(x=>x.id===editP);state.payables[i]={...state.payables[i],...obj}}else state.payables.push({id:uid(),...obj});
  save();resetPayable();renderAll();
}
function editPayable(id){const x=state.payables.find(v=>v.id===id);if(!x)return;editP=id;payableFormTitle.textContent="Editar conta a pagar";cancelPayableEdit.classList.remove("hidden");pSector.value=x.sector;fillPayableCategories();pCategory.value=x.category;pVendor.value=x.vendor;pDescription.value=x.description;pCompetence.value=x.competence;pDue.value=x.due;pDue2.value=x.due2||"";pPaidDate.value=x.paidDate||"";pAmount.value=x.amount;pStatus.value=x.status;pCostCenter.value=x.costCenter;pDocument.value=x.document;pNotes.value=x.notes||"";scrollTo(0,0)}
function deletePayable(id){if(!confirm("Excluir conta a pagar?"))return;state.payables=state.payables.filter(x=>x.id!==id);save();renderAll()}
function resetPayable(){editP=null;payableFormTitle.textContent="Nova conta a pagar";cancelPayableEdit.classList.add("hidden");pVendor.value="";pDescription.value="";pAmount.value="";pStatus.value="pendente";pDue2.value="";pPaidDate.value="";pCostCenter.value="";pDocument.value="";pNotes.value=""}
function renderPayables(){
  const q=(pSearch.value||"").toLowerCase(),sec=pSectorFilter.value,st=pStatusFilter.value;
  const arr=[...state.payables].sort((a,b)=>effectiveDue(b).localeCompare(effectiveDue(a))).filter(x=>{
    const real=overdue(x)?"atrasado":x.status;
    return(!q||(x.description+" "+x.vendor+" "+x.category).toLowerCase().includes(q))&&(!sec||x.sector===sec)&&(!st||real===st)
  });
  payableList.innerHTML=arr.map(x=>{
    const real=overdue(x)?"atrasado":x.status,soon=dueSoon(x);
    return `<div class="item-card">
      <div class="head"><div><h3>${x.description}</h3><div class="meta">${x.sector} · ${x.category}</div></div><div class="money">${brl(x.amount)}</div></div>
      <div class="meta">${x.vendor||"Sem fornecedor"} · ${x.costCenter||"Sem centro de custo"}</div>
      <div class="due-grid">
        <div><span>1º vencimento</span><b>${x.due?.split("-").reverse().join("/")||"-"}</b></div>
        <div><span>2º vencimento</span><b>${x.due2?.split("-").reverse().join("/")||"-"}</b></div>
      </div>
      <span class="status ${real}">${real}</span>
      ${soon?'<span class="due-alert">⚠ Vencimento próximo</span>':""}
      ${x.paidDate?`<div class="paid-note">Pago em ${x.paidDate.split("-").reverse().join("/")}</div>`:""}
      <div class="mini-actions">
        ${x.status!=="pago"?`<button class="pay-btn" onclick="markPaid('${x.id}')">Dar baixa</button>`:""}
        <button onclick="editPayable('${x.id}')">Editar</button>
        <button class="danger" onclick="deletePayable('${x.id}')">Excluir</button>
      </div>
    </div>`
  }).join("")||'<div class="card meta">Nenhuma conta a pagar.</div>';
}
async function markPaid(id){
  const x=state.payables.find(v=>v.id===id);if(!x)return;
  const dt=prompt("Data do pagamento (AAAA-MM-DD):",today());
  if(!dt)return;
  x.status="pago";x.paidDate=dt;save();renderAll();
}
function activateDailyTab(btn){document.querySelectorAll("#dailyPayments .tabs button").forEach(x=>x.classList.remove("active"));btn.classList.add("active")}
function renderDailyPayments(){
  if(!window.dailyPaymentDate)return;
  const d=dailyPaymentDate.value||today();
  const due=state.payables.filter(x=>x.status!=="pago"&&(x.due===d||x.due2===d));
  const paid=state.payables.filter(x=>x.status==="pago"&&x.paidDate===d);
  const ov=state.payables.filter(x=>overdue(x)&&effectiveDue(x)<=d);
  const dueValue=due.reduce((a,x)=>a+x.amount,0),paidValue=paid.reduce((a,x)=>a+x.amount,0),ovValue=ov.reduce((a,x)=>a+x.amount,0);
  dailyPaymentKpis.innerHTML=`<div class="kpi"><span>Vence no dia</span><b>${brl(dueValue)}</b></div><div class="kpi"><span>Pago no dia</span><b class="good">${brl(paidValue)}</b></div><div class="kpi"><span>Atrasado</span><b class="bad">${brl(ovValue)}</b></div><div class="kpi"><span>Qtd. pagamentos</span><b>${paid.length}</b></div>`;
  let arr=dailyTab==="due"?due:dailyTab==="paid"?paid:dailyTab==="overdue"?ov:[...new Map([...due,...paid,...ov].map(x=>[x.id,x])).values()];
  dailyPaymentList.innerHTML=arr.map(x=>{
    const isPaid=x.status==="pago",isOver=overdue(x);
    return `<div class="item-card">
      <div class="head"><div><h3>${x.description}</h3><div class="meta">${x.sector} · ${x.category} · ${x.vendor||"Sem fornecedor"}</div></div><div class="money">${brl(x.amount)}</div></div>
      <div class="meta">1º venc.: ${x.due?.split("-").reverse().join("/")||"-"} · 2º venc.: ${x.due2?.split("-").reverse().join("/")||"-"}</div>
      <span class="status ${isPaid?"pago":isOver?"atrasado":"pendente"}">${isPaid?"pago":isOver?"atrasado":"pendente"}</span>
      ${x.paidDate?`<div class="paid-note">Baixa em ${x.paidDate.split("-").reverse().join("/")}</div>`:""}
      ${!isPaid?`<div class="mini-actions"><button class="pay-btn" onclick="markPaid('${x.id}')">Dar baixa agora</button></div>`:""}
    </div>`
  }).join("")||'<div class="card meta">Nenhum pagamento para esta seleção.</div>';
}
function renderDRE(){
  const s=dreStart.value,e=dreEnd.value;
  const r=state.receivables.filter(x=>inRange(x.periodEnd||x.due,s,e)),p=state.payables.filter(x=>inRange((x.competence||"")+"-01",s,e));
  const receita=r.reduce((a,x)=>a+x.amount,0),by={};p.forEach(x=>by[x.sector]=(by[x.sector]||0)+x.amount);const expenses=Object.values(by).reduce((a,v)=>a+v,0),res=receita-expenses,margin=receita?res/receita:0;
  dreContent.innerHTML=`<div class="card"><div class="dre-row total"><span>RECEITA BRUTA</span><b>${brl(receita)}</b></div>${Object.entries(by).map(([k,v])=>`<div class="dre-row"><span>${k}</span><b>${brl(v)}</b></div>`).join("")}<div class="dre-row total"><span>TOTAL DESPESAS</span><b>${brl(expenses)}</b></div></div><div class="card"><div class="dre-row total"><span>RESULTADO</span><b class="${res>=0?"good":"bad"}">${brl(res)}</b></div><div class="dre-row"><span>Margem</span><b>${(margin*100).toFixed(1)}%</b></div></div>`;
}
function saveLoan(){const inst=lInstitution.value.trim(),principal=Number(lPrincipal.value||0);if(!inst||principal<=0)return alert("Informe instituição e valor.");state.loans.push({id:uid(),institution:inst,contract:lContract.value.trim(),principal,balance:Number(lBalance.value||0),installment:Number(lInstallment.value||0),due:lDue.value,notes:lNotes.value.trim()});save();lInstitution.value="";lContract.value="";lPrincipal.value="";lBalance.value="";lInstallment.value="";lNotes.value="";renderLoans()}
function renderLoans(){loanList.innerHTML=state.loans.map(x=>`<div class="item-card"><div class="head"><div><h3>${x.institution}</h3><div class="meta">${x.contract||"Sem contrato"}</div></div><div class="money">${brl(x.balance)}</div></div><div class="row"><span>Contratado</span><b>${brl(x.principal)}</b></div><div class="row"><span>Parcela</span><b>${brl(x.installment)}</b></div><div class="row"><span>Próximo vencimento</span><b>${x.due?.split("-").reverse().join("/")||"-"}</b></div></div>`).join("")||'<div class="card meta">Nenhum empréstimo cadastrado.</div>'}
function obTab(name,btn){document.querySelectorAll(".tabs button").forEach(x=>x.classList.remove("active"));btn.classList.add("active");document.querySelectorAll(".obpane").forEach(x=>x.classList.remove("active"));document.getElementById("ob"+name[0].toUpperCase()+name.slice(1)).classList.add("active")}
function renderOverdue(){const arr=state.payables.filter(overdue);overdueList.innerHTML=arr.map(x=>`<div class="item-card"><div class="head"><div><h3>${x.description}</h3><div class="meta">${x.sector} · ${x.category}</div></div><div class="money bad">${brl(x.amount)}</div></div><div class="meta">Vencido em ${x.due.split("-").reverse().join("/")} · ${x.vendor||"Sem fornecedor"}</div></div>`).join("")||'<div class="card meta">Nenhuma dívida vencida.</div>'}
function backup(){const blob=new Blob([JSON.stringify(state,null,2)],{type:"application/json"}),a=document.createElement("a");a.href=URL.createObjectURL(blob);a.download=`jc-pavimentacao-backup-${today()}.json`;a.click();URL.revokeObjectURL(a.href)}
setup();