/* ================= CONFIGURAÇÃO SUPABASE ================= */
// ATENÇÃO: Coloque suas chaves reais aqui
const SUPABASE_URL = 'https://onqtmorndtxytctedemf.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im9ucXRtb3JuZHR4eXRjdGVkZW1mIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Njk2MTM3NDIsImV4cCI6MjA4NTE4OTc0Mn0.CYWfqBayNPIZ7BLzouBBMLBG0bDehD05tsHQ76xL15c';

const _supabase = supabase.createClient(SUPABASE_URL, SUPABASE_KEY);
let currentHistoryIdToResolve = null; 

/* ================= ESTADO GLOBAL ================= */
let db = { meds: [], pacientes: [], historico: [] };
let protocoloSelection = {}; 
let targetPatientId = null;
let retiradaTempData = null;

/* ================= INICIALIZAÇÃO ================= */
window.onload = async () => {
    const now = new Date();
    document.getElementById('dash_mes').value = now.toISOString().slice(0, 7);
    await carregarDadosDoBanco(); 
};

async function carregarDadosDoBanco() {
    try {
        const { data: medsData, error: errMed } = await _supabase.from('medicamentos').select('*');
        if (errMed) throw errMed;

        const { data: pacData, error: errPac } = await _supabase.from('pacientes').select('*');
        if (errPac) throw errPac;

        const { data: presData, error: errPres } = await _supabase.from('prescricoes').select('*');
        if (errPres) throw errPres;

        const { data: histData, error: errHist } = await _supabase.from('historico').select('*');
        if (errHist) throw errHist;

        // Mapeamentos
        db.meds = medsData;
        
        db.pacientes = pacData.map(p => {
            const minhasPrescricoes = presData.filter(x => x.paciente_id === p.id);
            return {
                ...p,
                ultimaRetirada: p.ultima_retirada, 
                temPendencia: p.tem_pendencia,
                meds: minhasPrescricoes.map(pr => ({ medId: pr.med_id, qtd: pr.qtd }))
            };
        });

        db.historico = histData.map(h => ({
            ...h,
            pacienteNome: h.paciente_nome,
            pendenciaGeral: h.pendencia_geral
        }));

        renderAll();

    } catch (error) {
        console.error("Erro ao carregar:", error);
    }
}

function renderAll() {
    renderDashboard();
    renderPacientes();
    renderProtocoloGrid();
}

/* ================= UI & UTILITÁRIOS ================= */
function switchTab(tabId, event) {
    document.querySelectorAll('.tab-pane').forEach(el => el.classList.add('hide'));
    document.querySelectorAll('.nav-btn').forEach(btn => btn.classList.remove('active'));
    document.getElementById(tabId).classList.remove('hide');
    if(event) event.currentTarget.classList.add('active');
    
    if(tabId === 'tab-historico') renderHistoricoGeral();
}

function toggleTheme() { document.body.classList.toggle('dark-mode'); }
function fecharModal(id) { document.getElementById(id).style.display = 'none'; }

/* ================= CADASTRO RÁPIDO MED ================= */
function abrirModalMed(id = null) {
    document.getElementById('modal_med').style.display = 'flex';
    if(id) {
        // Lógica de edição se necessário
    } else {
        document.getElementById('edit_med_id').value = '';
        document.getElementById('m_nome').value = '';
        document.getElementById('m_dosagem').value = '';
    }
}

async function salvarMed() {
    const medObj = {
        nome: document.getElementById('m_nome').value.toUpperCase(),
        tipo: document.getElementById('m_tipo').value,
        dosagem: document.getElementById('m_dosagem').value,
        qtd: 9999, // Estoque infinito
        min: 0,
        img: ''
    };

    if(!medObj.nome) return alert("Nome do remédio é obrigatório");

    try {
        const { error } = await _supabase.from('medicamentos').insert([medObj]);
        if(error) throw error;

        await carregarDadosDoBanco();
        fecharModal('modal_med');
        renderProtocoloGrid(); // Atualiza a lista na hora
    } catch (err) {
        alert('Erro ao salvar medicamento: ' + err.message);
    }
}

/* ================= PACIENTES & SELEÇÃO DE REMÉDIOS ================= */
function renderProtocoloGrid() {
    const container = document.getElementById('protocolo_grid');
    const search = document.getElementById('protocolo_search').value.toUpperCase();
    container.innerHTML = '';
    
    db.meds.sort((a,b) => a.nome.localeCompare(b.nome)).forEach(m => {
        if(search && !m.nome.includes(search)) return;
        const q = protocoloSelection[m.id] || 0;
        
        container.innerHTML += `
          <div class="mini-med-item" style="justify-content: space-between; padding: 10px;">
            <div style="flex: 1;">
                <div class="mini-med-name">${m.nome}</div>
                <div style="font-size:10px; color: #888;">${m.dosagem}</div>
            </div>
            <div class="mini-med-controls">
                <button onclick="updateCount(${m.id}, -1)">-</button>
                <span style="min-width: 20px; text-align: center;">${q}</span>
                <button onclick="updateCount(${m.id}, 1)">+</button>
            </div>
          </div>
        `;
    });
}

function updateCount(id, delta) {
    protocoloSelection[id] = (protocoloSelection[id] || 0) + delta;
    if(protocoloSelection[id] < 0) protocoloSelection[id] = 0;
    renderProtocoloGrid();
}

async function salvarPaciente() {
    const nome = document.getElementById('p_nome').value;
    const endereco = document.getElementById('p_endereco').value;
    const contato = document.getElementById('p_contato').value;

    const medsSelecionados = Object.keys(protocoloSelection)
        .map(id => ({ medId: parseInt(id), qtd: protocoloSelection[id] }))
        .filter(x => x.qtd > 0);

    if(!nome || medsSelecionados.length === 0) return alert("Nome e pelo menos 1 remédio obrigatórios.");
    
    try {
        const { data: pData, error: pError } = await _supabase
            .from('pacientes')
            .insert([{ nome, endereco, contato }])
            .select();
        
        if(pError) throw pError;

        const novoPacienteId = pData[0].id;
        const prescricoesParaSalvar = medsSelecionados.map(m => ({
            paciente_id: novoPacienteId,
            med_id: m.medId,
            qtd: m.qtd
        }));

        const { error: presError } = await _supabase.from('prescricoes').insert(prescricoesParaSalvar);
        if(presError) throw presError;

        protocoloSelection = {};
        document.getElementById('p_nome').value = '';
        document.getElementById('p_endereco').value = '';
        document.getElementById('p_contato').value = '';
        
        await carregarDadosDoBanco();
        switchTab('tab-pacientes', { currentTarget: document.querySelector('.nav-btn') }); 
        alert("Paciente cadastrado!"); 

    } catch (err) {
        alert("Erro ao salvar paciente: " + err.message);
    }
}

function renderPacientes() {
    const container = document.getElementById('pacientes_lista');
    const busca = document.getElementById('search_p').value.toUpperCase();
    container.innerHTML = '';

    db.pacientes.filter(p => p.nome.includes(busca)).forEach(p => {
        const medsList = p.meds.map(pm => {
            const m = db.meds.find(x => x.id === pm.medId);
            return m ? `${m.nome} (${pm.qtd})` : '?';
        }).join(', ');

        let statusBadge = `<span class="status-badge status-ok">OK</span>`;
        if(p.temPendencia) statusBadge = `<span class="status-badge status-pendente">PENDÊNCIA</span>`;

        container.innerHTML += `
            <div class="card patient-card">
                <div class="patient-header">
                    <div>
                        <h4 style="margin:0;">${p.nome} ${statusBadge}</h4>
                        <div class="patient-info">
                            <span><i class="fas fa-map-marker-alt"></i> ${p.endereco || 'S/ Endereço'}</span>
                        </div>
                    </div>
                    <div style="display:flex; gap:5px;">
                        <button class="btn btn-sm" onclick="abrirModalEditarPaciente(${p.id})"><i class="fas fa-edit"></i></button>
                        <button class="btn btn-sm btn-red" onclick="excluirPaciente(${p.id})"><i class="fas fa-trash"></i></button>
                    </div>
                </div>
                <div style="background:var(--bg-body); padding:8px; border-radius:4px; font-size:11px;">
                    <b>Prescrição:</b> ${medsList}
                </div>
                <div style="display:flex; justify-content:space-between; align-items:center; margin-top:5px;">
                    <small style="color:var(--text-muted)">Última: <b>${p.ultimaRetirada || '-'}</b></small>
                    <button class="btn-sm" style="border:none; background:transparent; color:var(--primary); cursor:pointer;" 
                                onclick="abrirModalAjusteData(${p.id}, '${p.ultimaRetirada || ''}')" title="Alterar Data Manualmente">
                            <i class="fas fa-calendar-alt"></i>
                        </button>
                    
                    <button class="btn btn-sm" onclick="abrirModalRetirada(${p.id})">
                        <i class="fas fa-check-circle"></i> RETIRADA
                    </button>
                </div>
            </div>
        `;
    });
}

async function excluirPaciente(id) {
    if(confirm("Remover paciente? Isso apagará o histórico dele também.")) {
        try {
            const { error } = await _supabase.from('pacientes').delete().eq('id', id);
            if(error) throw error;
            await carregarDadosDoBanco();
        } catch(err) {
            alert('Erro: ' + err.message);
        }
    }
}

/* ================= RETIRADA ================= */
function abrirModalRetirada(id) {
    const p = db.pacientes.find(x => x.id === id);
    if(!p) return;

    retiradaTempData = { pacienteId: id, itens: [] };
    document.getElementById('retirada_paciente_nome').innerText = p.nome;

    // DEFINE A DATA DE HOJE COMO PADRÃO
    const hojeISO = new Date().toISOString().split('T')[0];
    document.getElementById('retirada_data_custom').value = hojeISO;
    
    const tbody = document.getElementById('retirada_tbody');
    tbody.innerHTML = '';

    p.meds.forEach(pm => {
        const m = db.meds.find(x => x.id === pm.medId);
        if(!m) return;
        
        retiradaTempData.itens.push({ medId: m.id, prescrito: pm.qtd });

        tbody.innerHTML += `
            <tr>
                <td>${m.nome}</td>
                <td>${pm.qtd}</td>
                <td><input type="number" id="qtd_entrega_${m.id}" value="${pm.qtd}" min="0" style="width:60px;"></td>
            </tr>
        `;
    });

    document.getElementById('modal_retirada').style.display = 'flex';
}

async function salvarRetirada() {
    const pId = retiradaTempData.pacienteId;
    const p = db.pacientes.find(x => x.id === pId);
    
    // PEGA A DATA ESCOLHIDA PELO USUÁRIO
    const dataInput = document.getElementById('retirada_data_custom').value;
    if(!dataInput) return alert("Por favor, selecione uma data.");

    // Formata para exibição PT-BR (DD/MM/AAAA) para salvar na tabela pacientes
    const dataPartes = dataInput.split('-');
    const dataDisplay = `${dataPartes[2]}/${dataPartes[1]}/${dataPartes[0]}`;

    let houvePendencia = false;
    let itensHistorico = [];

    for (let item of retiradaTempData.itens) {
        const inputVal = parseInt(document.getElementById(`qtd_entrega_${item.medId}`).value) || 0;
        const m = db.meds.find(x => x.id === item.medId);

        let statusItem = 'OK';
        if(inputVal < item.prescrito) {
            houvePendencia = true;
            statusItem = `PARCIAL (${inputVal}/${item.prescrito})`;
        }

        itensHistorico.push({
            nomeRemedio: m.nome,
            qtdEntregue: inputVal,
            status: statusItem
        });
    }

    try {
        await _supabase.from('pacientes').update({
            ultima_retirada: dataDisplay,
            tem_pendencia: houvePendencia
        }).eq('id', pId);

        await _supabase.from('historico').insert([{
            paciente_id: pId,
            paciente_nome: p.nome,
            data: dataInput, // Salva no formato YYYY-MM-DD para ordenação correta no histórico
            pendencia_geral: houvePendencia,
            itens: itensHistorico 
        }]);

        await carregarDadosDoBanco();
        fecharModal('modal_retirada');
        alert("Retirada registrada na data: " + dataDisplay);
    } catch (err) {
        alert("Erro na retirada: " + err.message);
    }
}

/* ================= EDIÇÃO PACIENTE ================= */
let currentEditPatient = null;
function abrirModalEditarPaciente(id) {
  const p = db.pacientes.find(x => x.id === id);
  if (!p) return;

  currentEditPatient = id;
  document.getElementById('edit_paciente_nome').innerText = p.nome;
  const tbody = document.getElementById('edit_paciente_meds');
  tbody.innerHTML = '';

  p.meds.forEach(pm => {
      const m = db.meds.find(x => x.id === pm.medId);
      if (!m) return;
      tbody.innerHTML += `
        <tr>
          <td>${m.nome}</td>
          <td><input type="number" value="${pm.qtd}" min="1" id="edit_qtd_${m.id}"></td>
          <td>
            <button class="btn btn-sm btn-red" onclick="removerMedPaciente(${id}, ${m.id})"><i class="fas fa-trash"></i></button>
          </td>
        </tr>
      `;
    });
  document.getElementById('modal_edit_paciente').style.display = 'flex';
}

async function removerMedPaciente(pId, mId) {
    if(!confirm("Remover este remédio da receita?")) return;
    try {
        const { error } = await _supabase.from('prescricoes').delete().match({ paciente_id: pId, med_id: mId });
        if(error) throw error;
        await carregarDadosDoBanco();
        abrirModalEditarPaciente(pId);
    } catch (err) { alert(err.message); }
}

async function salvarEdicaoPaciente() {
    const pId = currentEditPatient;
    const p = db.pacientes.find(x => x.id === pId);
    try {
        for(let pm of p.meds) {
            const input = document.getElementById(`edit_qtd_${pm.medId}`);
            if(input) {
                const novaQtd = parseInt(input.value);
                if(novaQtd !== pm.qtd) {
                    await _supabase.from('prescricoes').update({ qtd: novaQtd }).match({ paciente_id: pId, med_id: pm.medId });
                }
            }
        }
        await carregarDadosDoBanco();
        fecharModal('modal_edit_paciente');
        alert("Salvo!");
    } catch(err) { alert(err.message); }
}

function abrirModalAddMed(pId) {
    targetPatientId = pId;
    document.getElementById('modal_add_med_patient').style.display = 'flex';
    renderAddMedGrid();
}

function renderAddMedGrid() {
    const c = document.getElementById('add_med_grid');
    const s = document.getElementById('add_med_search').value.toUpperCase();
    c.innerHTML = '';
    db.meds.filter(m => m.nome.includes(s)).forEach(m => {
        c.innerHTML += `<div class="mini-med-item" onclick="addMedToPatient(${m.id})" style="cursor:pointer; justify-content:center;">${m.nome}</div>`;
    });
}

async function addMedToPatient(mId) {
    try {
        const { error } = await _supabase.from('prescricoes').insert([{ paciente_id: targetPatientId, med_id: mId, qtd: 1 }]);
        if(error) throw error;
        await carregarDadosDoBanco(); 
        fecharModal('modal_add_med_patient');
        abrirModalEditarPaciente(targetPatientId);
    } catch (err) { alert("Erro ao adicionar: " + err.message); }
}

/* ================= DASHBOARD & HISTÓRICO ================= */
function renderDashboard() {
    const mesInput = document.getElementById('dash_mes').value;
    const retiradasDoMes = db.historico.filter(h => h.data.startsWith(mesInput));
    const totalItens = retiradasDoMes.reduce((acc, h) => acc + (h.itens || []).reduce((sum, i) => sum + i.qtdEntregue, 0), 0);
    document.getElementById('kpi_retiradas').innerText = retiradasDoMes.length;
    document.getElementById('kpi_itens_total').innerText = totalItens;
}

// === CORREÇÃO AQUI: FILTRANDO PACIENTES EXCLUÍDOS ===
function renderHistoricoGeral() {
    const tbody = document.querySelector('#table_historico_geral tbody');
    tbody.innerHTML = '';

    const nomeFiltro = document.getElementById('hist_nome')?.value.toUpperCase() || '';
    const apenasPendentes = document.getElementById('hist_pendencia')?.checked || false;

    db.historico
        .sort((a,b) => b.data.localeCompare(a.data))
        .filter(h => {
            // 1. Verifica se o paciente ainda existe na base atual (db.pacientes)
            const pacienteExiste = db.pacientes.find(p => p.id === h.paciente_id);
            if (!pacienteExiste) return false; // Se não existir (foi excluído), esconde.

            // 2. Filtros Normais (Nome e Pendência)
            const pNome = h.pacienteNome ? h.pacienteNome.toUpperCase() : '';
            if (nomeFiltro && !pNome.includes(nomeFiltro)) return false;
            if (apenasPendentes && h.pendenciaGeral !== true) return false;
            
            return true;
        })
        .forEach(h => {
            const detalhes = (h.itens || []).map(i => `${i.nomeRemedio}: ${i.qtdEntregue}`).join(', ');
            tbody.innerHTML += `
                <tr>
                    <td>${h.data.split('-').reverse().join('/')}</td>
                    <td>${h.pacienteNome}</td>
                    <td style="font-size: 11px;">${detalhes}</td>
                    <td>
                        <div style="display:flex; gap:10px; align-items:center;">
                            <span class="status-badge ${h.pendenciaGeral ? 'status-pendente' : 'status-ok'}" style="font-size:10px;">
                                ${h.pendenciaGeral ? 'PENDÊNCIA' : 'OK'}
                            </span>
                            <button class="btn btn-sm btn-circle" title="Ver Dossiê" onclick="verDossiePaciente(${h.paciente_id})">
                                <i class="fas fa-search"></i>
                            </button>
                        </div>
                    </td>
                </tr>
            `;
        });
}

function verDossiePaciente(pId) {
    const p = db.pacientes.find(x => x.id === pId);
    if (!p) return alert("Paciente não encontrado (talvez excluído).");

    const infoDiv = document.getElementById('detalhe_info_pessoal');
    infoDiv.innerHTML = `
        <p><strong><i class="fas fa-user"></i> Nome:</strong> ${p.nome}</p>
        <p><strong><i class="fas fa-calendar-check"></i> Última Retirada:</strong> ${p.ultimaRetirada || 'Nunca retirou'}</p>
        <button class="btn btn-sm btn-red" onclick="excluirHistoricoGeral(${p.id})"><i class="fas fa-trash-alt"></i> ELIMINAR DADOS</button>
    `;

    const histDiv = document.getElementById('detalhe_lista_historico');
    const logs = db.historico.filter(h => h.paciente_id === pId).sort((a,b) => b.data.localeCompare(a.data));

    histDiv.innerHTML = logs.length ? logs.map(l => `
        <div style="border-bottom: 1px solid #ddd; padding: 10px 0;">
            <small>Data: ${l.data.split('-').reverse().join('/')}</small>
            ${l.pendenciaGeral ? `<button class="btn btn-sm" style="margin-top:5px; background:var(--primary);" onclick="abrirModalResolver(${l.id})">Resolver Pendência</button>` : ''}
            <button class="btn-trash" onclick="excluirEntradaHistorico(${l.id}, ${p.id})"><i class="fas fa-trash"></i></button>
            <ul style="margin: 5px 0; padding-left: 20px; font-size: 12px;">
                ${l.itens.map(i => `<li>${i.nomeRemedio} - Entregue: ${i.qtdEntregue} (${i.status})</li>`).join('')}
            </ul>
        </div>
    `).join('') : "<p style='text-align:center;'>Nenhuma retirada.</p>";

    document.getElementById('modal_detalhes_historico').style.display = 'flex';
}

function abrirModalResolver(histId) {
    const log = db.historico.find(h => h.id === histId);
    if (!log) return;
    currentHistoryIdToResolve = histId;
    const tbody = document.getElementById('resolver_tbody');
    tbody.innerHTML = '';
    const paciente = db.pacientes.find(p => p.id === log.paciente_id);

    log.itens.forEach(item => {
        const prescrito = paciente.meds.find(m => {
            const medInfo = db.meds.find(med => med.id === m.medId);
            return medInfo.nome === item.nomeRemedio;
        });
        const qtdFaltante = prescrito ? (prescrito.qtd - item.qtdEntregue) : 0;
        if (qtdFaltante > 0) {
            tbody.innerHTML += `<tr><td>${item.nomeRemedio}</td><td style="color:var(--danger)">${qtdFaltante}</td><td><input type="number" id="resolver_qtd_${item.nomeRemedio}" value="${qtdFaltante}" min="0" style="width:60px;"></td></tr>`;
        }
    });
    document.getElementById('modal_resolver_pendencia').style.display = 'flex';
}

async function salvarResolucaoPendencia() {
    const log = db.historico.find(h => h.id === currentHistoryIdToResolve);
    const paciente = db.pacientes.find(p => p.id === log.paciente_id);
    const novaData = new Date().toISOString().split('T')[0];
    let novosItens = [...log.itens];
    let aindaTemPendencia = false;

    try {
        for (let i = 0; i < novosItens.length; i++) {
            const input = document.getElementById(`resolver_qtd_${novosItens[i].nomeRemedio}`);
            if (input) {
                const qtdAgora = parseInt(input.value) || 0;
                novosItens[i].qtdEntregue += qtdAgora;
                const medBD = db.meds.find(m => m.nome === novosItens[i].nomeRemedio);
                const prescrito = paciente.meds.find(m => m.medId === medBD.id);
                if (novosItens[i].qtdEntregue < prescrito.qtd) {
                    aindaTemPendencia = true;
                    novosItens[i].status = `PARCIAL (${novosItens[i].qtdEntregue}/${prescrito.qtd})`;
                } else {
                    novosItens[i].status = "OK";
                }
            }
        }
        await _supabase.from('historico').update({ data: novaData, itens: novosItens, pendencia_geral: aindaTemPendencia }).eq('id', currentHistoryIdToResolve);
        await _supabase.from('pacientes').update({ tem_pendencia: aindaTemPendencia }).eq('id', log.paciente_id);
        alert("Pendência atualizada!");
        fecharModal('modal_resolver_pendencia');
        fecharModal('modal_detalhes_historico');
        await carregarDadosDoBanco();
    } catch (err) { alert("Erro: " + err.message); }
}

async function excluirEntradaHistorico(histId, pId) {
    if (!confirm("Excluir este registro?")) return;
    try {
        await _supabase.from('historico').delete().eq('id', histId);
        await carregarDadosDoBanco();
        verDossiePaciente(pId);
    } catch (err) { alert("Erro: " + err.message); }
}

async function excluirHistoricoGeral(pId) {
    if (!confirm("Apagar TODO histórico deste paciente?")) return;
    try {
        await _supabase.from('historico').delete().eq('paciente_id', pId);
        await carregarDadosDoBanco();
        fecharModal('modal_detalhes_historico'); 
    } catch (err) { alert("Erro: " + err.message); }
}

/* ================= AJUSTE MANUAL DE DATA ================= */
function abrirModalAjusteData(pId, dataAtualString) {
    document.getElementById('ajuste_data_paciente_id').value = pId;
    const inputDate = document.getElementById('ajuste_data_input');
    
    // Tenta converter DD/MM/AAAA para YYYY-MM-DD para o input aceitar
    if(dataAtualString && dataAtualString.includes('/')) {
        const partes = dataAtualString.split('/');
        if(partes.length === 3) {
            // Assume DD/MM/AAAA -> YYYY-MM-DD
            inputDate.value = `${partes[2]}-${partes[1]}-${partes[0]}`;
        }
    } else {
        // Se não tiver data, coloca hoje
        inputDate.value = new Date().toISOString().split('T')[0];
    }
    
    document.getElementById('modal_ajuste_data').style.display = 'flex';
}

async function salvarAjusteData() {
    const pId = document.getElementById('ajuste_data_paciente_id').value;
    const novaDataIso = document.getElementById('ajuste_data_input').value;
    
    if(!novaDataIso) return alert("Selecione uma data válida.");

    // Converte YYYY-MM-DD para DD/MM/AAAA
    const p = novaDataIso.split('-');
    const novaDataDisplay = `${p[2]}/${p[1]}/${p[0]}`;

    try {
        const { error } = await _supabase
            .from('pacientes')
            .update({ ultima_retirada: novaDataDisplay })
            .eq('id', pId);

        if(error) throw error;

        await carregarDadosDoBanco();
        fecharModal('modal_ajuste_data');
        alert("Data atualizada com sucesso!");
    } catch (err) {
        alert("Erro ao atualizar data: " + err.message);
    }
}

