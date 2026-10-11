const sb=window.supabase.createClient(CFG.url,CFG.key);
const SECTORS={
  "Escritório":["RH","Compras","Administrativo","Engenharia","Portaria","Limpeza","Contabilidade","TI","Telefonia e Internet","Material de escritório","Honorários","Seguros"],
  "Obras":["Manutenção","Equipamentos","Aluguel","Refeição","Combustível","Peças","Pedágio","Locação de veículos","EPIs","Frete","Hospedagem","Sinalização","Laboratório","Terceiros","Ferramentas","Mobilização","Desmobilização"],
  "Financeiro":["Empréstimos","Financiamentos","Juros","Tarifas bancárias","Antecipações","Seguros financeiros"],
  "Impostos":["FGTS","INSS","DARF","ISS","IRPJ","CSLL","PIS","COFINS","Simples Nacional","Taxas municipais","Taxas estaduais","Outros impostos"],
  "Utilidades":["Água","Luz","Internet","Telefone","Gás"],
  "Frota":["Combustível","Manutenção","Pneus","Seguro","IPVA","Licenciamento","Locação de veículos","Rastreamento"],
  "Outros":["Despesas diversas","Acordos","Multas","Custas","Outros"]
};

let state={receivables:[],payables:[],loans:[]};
let editR=null,editP=null,dailyTab='all';

const brl=v=>Number(v||0).toLocaleString("pt-BR",{style:"currency",currency:"BRL"});
const today=()=>new Date().toISOString().slice(0,10);
const monthStart=()=>today().slice(0,7)+"-01";
const uid=()=>crypto.randomUUID?crypto.randomUUID():String(Date.now())+Math.random();

async function boot(){
  bindLogin();
  const {data:{session}}=await sb.auth.getSession();
  if(session){
    loginScreen.classList.add("hidden");
    await loadCloud();
  }
  setupUI();
}
function bindLogin(){
  loginForm.onsubmit=async e=>{
    e.preventDefault();
    loginMessage.textContent="Entrando...";
    const {error}=await sb.auth.signInWithPassword({email:loginEmail.value,password:loginPassword.value});
    if(error){loginMessage.textContent="E-mail ou senha inválidos.";return}
    loginMessage.textContent="";
    loginScreen.classList.add("hidden");
    await loadCloud();
  };
  logoutBtn.onclick=async()=>{await sb.auth.signOut();loginScreen.classList.remove("hidden")};
}
function setupUI(){
  dashStart.value=monthStart();dashEnd.value=today();dreStart.value=monthStart();dreEnd.value=today();
  rPeriodStart.value=monthStart();rPeriodEnd.value=today();rDue.value=today();
  pCompetence.value=today().slice(0,7);pDue.value=today();pDue2.value="";pPaidDate.value="";
  dailyPaymentDate.value=today();lDue.value=today();
  pSector.innerHTML=Object.keys(SECTORS).map(x=>`<option>${x}</option>`).join("");
  pSectorFilter.innerHTML='<option value="">Todos os setores</option>'+Object.keys(SECTORS).map(x=>`<option>${x}</option>`).join("");
  fillPayableCategories();
}
async function loadCloud(){
  const [r,p,l]=await Promise.all([
    sb.from("jc_contas_receber").select("*").order("vencimento",{ascending:false}),
    sb.from("jc_contas_pagar").select("*").order("primeiro_vencimento",{ascending:false}),
    sb.from("jc_emprestimos").select("*").order("created_at",{ascending:false})
  ]);
  const err=[r,p,l].find(x=>x.error);
  if(err){alert("Erro ao carregar dados: "+err.error.message);return}
  state.receivables=(r.data||[]).map(x=>({
    id:x.id,company:x.empresa,contract:x.numero_contrato||"",description:x.descricao||"",
    periodStart:x.periodo_inicio||"",periodEnd:x.periodo_fim||"",due:x.vencimento,
    amount:Number(x.valor||0),received:Number(x.valor_recebido||0),status:x.status||"pendente",notes:x.observacao||""
  }));
  state.payables=(p.data||[]).map(x=>({
    id:x.id,sector:x.setor,category:x.categoria,vendor:x.fornecedor||"",description:x.descricao,
    competence:x.competencia||"",due:x.primeiro_vencimento,due2:x.segundo_vencimento||"",
    amount:Number(x.valor||0),status:x.status||"pendente",paidDate:x.data_pagamento||"",
    costCenter:x.centro_custo||"",document:x.numero_documento||"",notes:x.observacao||""
  }));
  state.loans=(l.data||[]).map(x=>({
    id:x.id,institution:x.instituicao,contract:x.contrato||"",principal:Number(x.valor_contratado||0),
    balance:Number(x.saldo_devedor||0),installment:Number(x.parcela_mensal||0),
    due:x.proximo_vencimento||"",notes:x.observacao||"",active:x.ativo
  }));
  renderAll();
}
function go(v){document.querySelectorAll(".view").forEach(x=>x.classList.remove("active"));document.getElementById(v).classList.add("active");scrollTo(0,0);renderAll();if(v==="dailyPayments")renderDailyPayments()}
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
  const r=state.receivables.filter(x=>inRange(x.due,s,e)),p=state.payables.filter(x=>inRange(x.due,s,e)||inRange(x.due2,s,e));
  const toReceive=r.reduce((a,x)=>a+(x.amount-x.received),0),received=r.reduce((a,x)=>a+x.received,0);
  const toPay=p.filter(x=>x.status!=="pago").reduce((a,x)=>a+x.amount,0),paid=p.filter(x=>x.status==="pago").reduce((a,x)=>a+x.amount,0);
  const overdueV=state.payables.filter(overdue).reduce((a,x)=>a+x.amount,0),result=received-paid;
  kpis.innerHTML=`<div class="kpi"><span>A receber</span><b>${brl(toReceive)}</b></div><div class="kpi"><span>A pagar</span><b class="warn">${brl(toPay)}</b></div><div class="kpi"><span>Vencidas</span><b class="bad">${brl(overdueV)}</b></div><div class="kpi"><span>Resultado caixa</span><b class="${result>=0?"good":"bad"}">${brl(result)}</b></div>`;

  const sectors={};p.forEach(x=>sectors[x.sector]=(sectors[x.sector]||0)+x.amount);
  sectorSummary.innerHTML=Object.entries(sectors).sort((a,b)=>b[1]-a[1]).map(([k,v])=>`<div class="row"><span>${k}</span><b>${brl(v)}</b></div>`).join("")||'<div class="meta">Sem despesas no período.</div>';

  const ovs=state.payables.filter(overdue).sort((a,b)=>effectiveDue(a).localeCompare(effectiveDue(b))).slice(0,6);
  const alerts=state.payables.filter(x=>dueSoon(x)).sort((a,b)=>effectiveDue(a).localeCompare(effectiveDue(b))).slice(0,4);
  overdueSummary.innerHTML=(ovs.map(x=>`<div class="row"><div><b>${x.description}</b><div class="meta">${x.sector} · vencido ${effectiveDue(x).split("-").reverse().join("/")}</div></div><b class="bad">${brl(x.amount)}</b></div>`).join("")+
  alerts.map(x=>`<div class="row"><div><b>⚠ ${x.description}</b><div class="meta">${x.sector} · vence ${effectiveDue(x).split("-").reverse().join("/")}</div></div><b class="warn">${brl(x.amount)}</b></div>`).join(""))||'<div class="meta">Nenhuma dívida vencida ou próxima.</div>';

  const rec=state.receivables.filter(x=>x.status!=="recebido"&&x.due>=today()).sort((a,b)=>a.due.localeCompare(b.due)).slice(0,6);
  receivableDueSummary.innerHTML=rec.map(x=>`<div class="row"><div><b>${x.company}</b><div class="meta">${x.contract||"Sem contrato"} · ${x.due.split("-").reverse().join("/")}</div></div><b>${brl(x.amount-x.received)}</b></div>`).join("")||'<div class="meta">Nenhum recebimento próximo.</div>';
}

async function saveReceivable(){
  const company=rCompany.value.trim(),amount=Number(rAmount.value||0);
  if(!company||amount<=0)return alert("Informe empresa e valor.");
  const payload={
    empresa:company,numero_contrato:rContract.value.trim(),descricao:rDescription.value.trim(),
    periodo_inicio:rPeriodStart.value||null,periodo_fim:rPeriodEnd.value||null,vencimento:rDue.value,
    valor:amount,valor_recebido:Number(rReceived.value||0),status:rStatus.value,observacao:rNotes.value.trim()
  };
  let q=editR?sb.from("jc_contas_receber").update(payload).eq("id",editR):sb.from("jc_contas_receber").insert(payload);
  const {error}=await q;if(error)return alert(error.message);
  resetReceivable();await loadCloud();
}
function editReceivable(id){
  const x=state.receivables.find(v=>String(v.id)===String(id));if(!x)return;
  editR=x.id;receivableFormTitle.textContent="Editar recebimento";cancelReceivableEdit.classList.remove("hidden");
  rCompany.value=x.company;rContract.value=x.contract;rDescription.value=x.description;rPeriodStart.value=x.periodStart;rPeriodEnd.value=x.periodEnd;rDue.value=x.due;rAmount.value=x.amount;rReceived.value=x.received;rStatus.value=x.status;rNotes.value=x.notes||"";scrollTo(0,0)
}
async function deleteReceivable(id){
  if(!confirm("Excluir conta a receber?"))return;
  const {error}=await sb.from("jc_contas_receber").delete().eq("id",id);if(error)return alert(error.message);
  await loadCloud();
}
function resetReceivable(){editR=null;receivableFormTitle.textContent="Novo recebimento";cancelReceivableEdit.classList.add("hidden");rCompany.value="";rContract.value="";rDescription.value="";rAmount.value="";rReceived.value="";rStatus.value="pendente";rNotes.value=""}
function renderReceivables(){
  const q=(rSearch.value||"").toLowerCase(),st=rStatusFilter.value;
  const arr=[...state.receivables].sort((a,b)=>b.due.localeCompare(a.due)).filter(x=>(!q||(x.company+" "+x.contract+" "+x.description).toLowerCase().includes(q))&&(!st||x.status===st));
  receivableList.innerHTML=arr.map(x=>`<div class="item-card"><div class="head"><div><h3>${x.company}</h3><div class="meta">${x.contract||"Sem contrato"} · venc. ${x.due.split("-").reverse().join("/")}</div></div><div class="money">${brl(x.amount)}</div></div><div class="meta">${x.description||"Recebimento"} · período ${x.periodStart?.split("-").reverse().join("/")||"-"} a ${x.periodEnd?.split("-").reverse().join("/")||"-"}</div><span class="status ${x.status}">${x.status}</span><div class="row"><span>Recebido</span><b>${brl(x.received)}</b></div><div class="row"><span>Saldo</span><b>${brl(x.amount-x.received)}</b></div><div class="mini-actions"><button onclick="editReceivable('${x.id}')">Editar</button><button class="danger" onclick="deleteReceivable('${x.id}')">Excluir</button></div></div>`).join("")||'<div class="card meta">Nenhuma conta a receber.</div>';
}

async function savePayable(){
  const amount=Number(pAmount.value||0),desc=pDescription.value.trim();
  if(amount<=0||!desc)return alert("Informe descrição e valor.");
  const payload={
    setor:pSector.value,categoria:pCategory.value,fornecedor:pVendor.value.trim(),descricao:desc,
    competencia:pCompetence.value,primeiro_vencimento:pDue.value,segundo_vencimento:pDue2.value||null,
    valor:amount,status:pStatus.value,data_pagamento:pStatus.value==="pago"?(pPaidDate.value||today()):(pPaidDate.value||null),
    centro_custo:pCostCenter.value.trim(),numero_documento:pDocument.value.trim(),observacao:pNotes.value.trim()
  };
  let q=editP?sb.from("jc_contas_pagar").update(payload).eq("id",editP):sb.from("jc_contas_pagar").insert(payload);
  const {error}=await q;if(error)return alert(error.message);
  resetPayable();await loadCloud();
}
function editPayable(id){
  const x=state.payables.find(v=>String(v.id)===String(id));if(!x)return;
  editP=x.id;payableFormTitle.textContent="Editar conta a pagar";cancelPayableEdit.classList.remove("hidden");
  pSector.value=x.sector;fillPayableCategories();pCategory.value=x.category;pVendor.value=x.vendor;pDescription.value=x.description;pCompetence.value=x.competence;pDue.value=x.due;pDue2.value=x.due2||"";pPaidDate.value=x.paidDate||"";pAmount.value=x.amount;pStatus.value=x.status;pCostCenter.value=x.costCenter;pDocument.value=x.document;pNotes.value=x.notes||"";scrollTo(0,0)
}
async function deletePayable(id){
  if(!confirm("Excluir conta a pagar?"))return;
  const {error}=await sb.from("jc_contas_pagar").delete().eq("id",id);if(error)return alert(error.message);
  await loadCloud();
}
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
      <div class="due-grid"><div><span>1º vencimento</span><b>${x.due?.split("-").reverse().join("/")||"-"}</b></div><div><span>2º vencimento</span><b>${x.due2?.split("-").reverse().join("/")||"-"}</b></div></div>
      <span class="status ${real}">${real}</span>${soon?'<span class="due-alert">⚠ Vencimento próximo</span>':""}
      ${x.paidDate?`<div class="paid-note">Pago em ${x.paidDate.split("-").reverse().join("/")}</div>`:""}
      <div class="mini-actions">${x.status!=="pago"?`<button class="pay-btn" onclick="markPaid('${x.id}')">Dar baixa</button>`:""}<button onclick="editPayable('${x.id}')">Editar</button><button class="danger" onclick="deletePayable('${x.id}')">Excluir</button></div>
    </div>`
  }).join("")||'<div class="card meta">Nenhuma conta a pagar.</div>';
}
async function markPaid(id){
  const x=state.payables.find(v=>String(v.id)===String(id));if(!x)return;
  const dt=prompt("Data do pagamento (AAAA-MM-DD):",today());if(!dt)return;
  const {error}=await sb.from("jc_contas_pagar").update({status:"pago",data_pagamento:dt}).eq("id",id);
  if(error)return alert(error.message);
  await loadCloud();
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
    return `<div class="item-card"><div class="head"><div><h3>${x.description}</h3><div class="meta">${x.sector} · ${x.category} · ${x.vendor||"Sem fornecedor"}</div></div><div class="money">${brl(x.amount)}</div></div><div class="meta">1º venc.: ${x.due?.split("-").reverse().join("/")||"-"} · 2º venc.: ${x.due2?.split("-").reverse().join("/")||"-"}</div><span class="status ${isPaid?"pago":isOver?"atrasado":"pendente"}">${isPaid?"pago":isOver?"atrasado":"pendente"}</span>${x.paidDate?`<div class="paid-note">Baixa em ${x.paidDate.split("-").reverse().join("/")}</div>`:""}${!isPaid?`<div class="mini-actions"><button class="pay-btn" onclick="markPaid('${x.id}')">Dar baixa agora</button></div>`:""}</div>`
  }).join("")||'<div class="card meta">Nenhum pagamento para esta seleção.</div>';
}
function renderDRE(){
  const s=dreStart.value,e=dreEnd.value;
  const r=state.receivables.filter(x=>inRange(x.periodEnd||x.due,s,e));
  const p=state.payables.filter(x=>inRange((x.competence||"")+"-01",s,e));
  const receita=r.reduce((a,x)=>a+x.amount,0),by={};p.forEach(x=>by[x.sector]=(by[x.sector]||0)+x.amount);
  const expenses=Object.values(by).reduce((a,v)=>a+v,0),res=receita-expenses,margin=receita?res/receita:0;
  dreContent.innerHTML=`<div class="card"><div class="dre-row total"><span>RECEITA BRUTA</span><b>${brl(receita)}</b></div>${Object.entries(by).map(([k,v])=>`<div class="dre-row"><span>${k}</span><b>${brl(v)}</b></div>`).join("")}<div class="dre-row total"><span>TOTAL DESPESAS</span><b>${brl(expenses)}</b></div></div><div class="card"><div class="dre-row total"><span>RESULTADO</span><b class="${res>=0?"good":"bad"}">${brl(res)}</b></div><div class="dre-row"><span>Margem</span><b>${(margin*100).toFixed(1)}%</b></div></div>`;
}
async function saveLoan(){
  const inst=lInstitution.value.trim(),principal=Number(lPrincipal.value||0);
  if(!inst||principal<=0)return alert("Informe instituição e valor.");
  const payload={instituicao:inst,contrato:lContract.value.trim(),valor_contratado:principal,saldo_devedor:Number(lBalance.value||0),parcela_mensal:Number(lInstallment.value||0),proximo_vencimento:lDue.value||null,observacao:lNotes.value.trim(),ativo:true};
  const {error}=await sb.from("jc_emprestimos").insert(payload);if(error)return alert(error.message);
  lInstitution.value="";lContract.value="";lPrincipal.value="";lBalance.value="";lInstallment.value="";lNotes.value="";await loadCloud();
}
function renderLoans(){
  loanList.innerHTML=state.loans.map(x=>`<div class="item-card"><div class="head"><div><h3>${x.institution}</h3><div class="meta">${x.contract||"Sem contrato"}</div></div><div class="money">${brl(x.balance)}</div></div><div class="row"><span>Contratado</span><b>${brl(x.principal)}</b></div><div class="row"><span>Parcela</span><b>${brl(x.installment)}</b></div><div class="row"><span>Próximo vencimento</span><b>${x.due?.split("-").reverse().join("/")||"-"}</b></div></div>`).join("")||'<div class="card meta">Nenhum empréstimo cadastrado.</div>';
}
function obTab(name,btn){document.querySelectorAll(".tabs button").forEach(x=>x.classList.remove("active"));btn.classList.add("active");document.querySelectorAll(".obpane").forEach(x=>x.classList.remove("active"));document.getElementById("ob"+name[0].toUpperCase()+name.slice(1)).classList.add("active")}
function renderOverdue(){
  const arr=state.payables.filter(overdue);
  overdueList.innerHTML=arr.map(x=>`<div class="item-card"><div class="head"><div><h3>${x.description}</h3><div class="meta">${x.sector} · ${x.category}</div></div><div class="money bad">${brl(x.amount)}</div></div><div class="meta">Vencido em ${effectiveDue(x).split("-").reverse().join("/")} · ${x.vendor||"Sem fornecedor"}</div></div>`).join("")||'<div class="card meta">Nenhuma dívida vencida.</div>';
}
function backup(){const blob=new Blob([JSON.stringify(state,null,2)],{type:"application/json"}),a=document.createElement("a");a.href=URL.createObjectURL(blob);a.download=`jc-pavimentacao-backup-${today()}.json`;a.click();URL.revokeObjectURL(a.href)}

boot();