/* ================= CONFIGURAÇÃO SUPABASE ================= */
// ATENÇÃO: Coloque suas chaves reais aqui
const SUPABASE_URL = 'https://onqtmorndtxytctedemf.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im9ucXRtb3JuZHR4eXRjdGVkZW1mIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Njk2MTM3NDIsImV4cCI6MjA4NTE4OTc0Mn0.CYWfqBayNPIZ7BLzouBBMLBG0bDehD05tsHQ76xL15c';

// CORREÇÃO DO ERRO: Usamos '_supabase' para não conflitar com a biblioteca global
const _supabase = supabase.createClient(SUPABASE_URL, SUPABASE_KEY);
let currentHistoryIdToResolve = null; // Variável global nova

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

        // CORREÇÃO DO NOME DO PACIENTE NO HISTÓRICO
        db.historico = histData.map(h => ({
            ...h,
            pacienteNome: h.paciente_nome, // Aqui estava o erro do undefined (snake_case -> camelCase)
            pendenciaGeral: h.pendencia_geral
        }));

        console.log("Dados carregados:", db);
        renderAll();

    } catch (error) {
        console.error("Erro ao carregar:", error);
    }
}

function renderAll() {
    renderDashboard();
    renderPacientes();
    renderFarmacia();
    renderProtocoloGrid();
}

/* ================= UI & UTILITÁRIOS ================= */
function switchTab(tabId, event) {
    document.querySelectorAll('.tab-pane').forEach(el => el.classList.add('hide'));
    document.querySelectorAll('.nav-btn').forEach(btn => btn.classList.remove('active'));
    document.getElementById(tabId).classList.remove('hide');
    if(event) event.currentTarget.classList.add('active');
    
    if(tabId === 'tab-farmacia') renderFarmacia();
    if(tabId === 'tab-historico') renderHistoricoGeral();
}

function toggleTheme() { document.body.classList.toggle('dark-mode'); }
function fecharModal(id) { document.getElementById(id).style.display = 'none'; }

/* ================= FARMÁCIA ================= */
function renderFarmacia() {
    const container = document.getElementById('farmacia_grid');
    const search = document.getElementById('farmacia_search').value.toUpperCase();
    const typeFilter = document.getElementById('farmacia_filtro_tipo').value;
    
    container.innerHTML = '';
    const meds = [...db.meds].sort((a,b) => a.nome.localeCompare(b.nome));

    meds.forEach(m => {
        if(search && !m.nome.includes(search)) return;
        if(typeFilter && m.tipo !== typeFilter) return;

        const isLow = m.qtd <= m.min;
        container.innerHTML += `
            <div class="med-card ${isLow ? 'alert-stock' : ''}">
                <img src="${m.img || 'https://via.placeholder.com/150x95?text=Med'}" class="med-img">
                <div class="med-body">
                    <div style="font-weight:bold; font-size:13px;">${m.nome}</div>
                    <div style="font-size:11px; color:var(--text-muted)">${m.tipo} • ${m.dosagem}</div>
                    <div style="font-size:12px; font-weight:800; margin-top:5px; color:${isLow ? 'var(--danger)' : 'var(--primary)'}">
                        Estoque: ${m.qtd}
                    </div>
                </div>
                <div style="position:absolute; top:5px; right:5px; display:flex; gap:2px;">
                    <button class="btn btn-sm btn-circle" onclick="abrirModalMed(${m.id})"><i class="fas fa-edit"></i></button>
                    <button class="btn btn-sm btn-red btn-circle" onclick="excluirMed(${m.id})"><i class="fas fa-trash"></i></button>
                </div>
            </div>
        `;
    });
}

function abrirModalMed(id = null) {
    document.getElementById('modal_med').style.display = 'flex';
    if(id) {
        const m = db.meds.find(x => x.id === id);
        document.getElementById('edit_med_id').value = m.id;
        document.getElementById('m_nome').value = m.nome;
        document.getElementById('m_tipo').value = m.tipo;
        document.getElementById('m_dosagem').value = m.dosagem;
        document.getElementById('m_qtd').value = m.qtd;
        document.getElementById('m_min').value = m.min;
        document.getElementById('m_img_url').value = m.img || '';
    } else {
        document.getElementById('edit_med_id').value = '';
        document.getElementById('m_nome').value = '';
        document.getElementById('m_qtd').value = '';
        document.getElementById('m_min').value = 5;
    }
}

async function salvarMed() {
    const id = document.getElementById('edit_med_id').value;
    
    const medObj = {
        nome: document.getElementById('m_nome').value.toUpperCase(),
        tipo: document.getElementById('m_tipo').value,
        dosagem: document.getElementById('m_dosagem').value,
        qtd: parseFloat(document.getElementById('m_qtd').value) || 0,
        min: parseFloat(document.getElementById('m_min').value) || 0,
        img: document.getElementById('m_img_url').value
    };

    try {
        if(id) {
            const { error } = await _supabase.from('medicamentos').update(medObj).eq('id', id);
            if(error) throw error;
        } else {
            const { error } = await _supabase.from('medicamentos').insert([medObj]);
            if(error) throw error;
        }

        await carregarDadosDoBanco();
        fecharModal('modal_med');
        alert("Medicamento salvo com sucesso!"); // MENSAGEM SUCESSO
    } catch (err) {
        alert('Erro ao salvar medicamento: ' + err.message);
    }
}

async function excluirMed(id) {
    if(confirm("Apagar medicamento?")) {
        try {
            const { error } = await _supabase.from('medicamentos').delete().eq('id', id);
            if(error) throw error;
            await carregarDadosDoBanco();
            alert("Medicamento excluído com sucesso!"); // MENSAGEM SUCESSO
        } catch(err) {
            alert('Erro ao excluir: ' + err.message);
        }
    }
}

/* ================= PACIENTES ================= */
function renderProtocoloGrid() {
    const container = document.getElementById('protocolo_grid');
    const search = document.getElementById('protocolo_search').value.toUpperCase();
    container.innerHTML = '';
    
    db.meds.sort((a,b) => a.nome.localeCompare(b.nome)).forEach(m => {
        if(search && !m.nome.includes(search)) return;
        const q = protocoloSelection[m.id] || 0;
        container.innerHTML += `
          <div class="mini-med-item">
            <div class="mini-med-header">
                <span class="mini-med-name">${m.nome}</span>
            </div>

            <div class="mini-med-controls">
                <button onclick="updateCount(${m.id}, -1)">-</button>
                <span>${q}</span>
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
        alert("Paciente cadastrado com sucesso!"); // MENSAGEM SUCESSO

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
                            <span><i class="fas fa-phone"></i> ${p.contato || 'S/ Contato'}</span>
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
            alert("Paciente removido com sucesso!"); // MENSAGEM SUCESSO
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
    const tbody = document.getElementById('retirada_tbody');
    tbody.innerHTML = '';

    p.meds.forEach(pm => {
        const m = db.meds.find(x => x.id === pm.medId);
        if(!m) return;
        
        const sugestao = (m.qtd < pm.qtd) ? m.qtd : pm.qtd;
        const alertaEstoque = (m.qtd < pm.qtd) ? 'color:var(--danger); font-weight:bold;' : '';

        retiradaTempData.itens.push({ medId: m.id, prescrito: pm.qtd });

        tbody.innerHTML += `
            <tr>
                <td>${m.nome}</td>
                <td style="${alertaEstoque}">${m.qtd}</td>
                <td>${pm.qtd}</td>
                <td>
                    <input type="number" id="qtd_entrega_${m.id}" value="${sugestao}" min="0" max="${m.qtd}" style="width:60px;">
                </td>
            </tr>
        `;
    });

    document.getElementById('modal_retirada').style.display = 'flex';
}

async function salvarRetirada() {
    const pId = retiradaTempData.pacienteId;
    const p = db.pacientes.find(x => x.id === pId);
    
    let houvePendencia = false;
    let itensHistorico = [];
    const dataHoje = new Date().toISOString().split('T')[0];
    const dataDisplay = new Date().toLocaleDateString('pt-BR');

    const updatesEstoque = [];

    for (let item of retiradaTempData.itens) {
        const inputVal = parseInt(document.getElementById(`qtd_entrega_${item.medId}`).value) || 0;
        const m = db.meds.find(x => x.id === item.medId);

        let novoEstoque = m.qtd - inputVal;
        if(novoEstoque < 0) novoEstoque = 0;
        
        updatesEstoque.push({ id: m.id, qtd: novoEstoque });

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
        for(let up of updatesEstoque) {
            await _supabase.from('medicamentos').update({ qtd: up.qtd }).eq('id', up.id);
        }

        await _supabase.from('pacientes').update({
            ultima_retirada: dataDisplay,
            tem_pendencia: houvePendencia
        }).eq('id', pId);

        await _supabase.from('historico').insert([{
            paciente_id: pId,
            paciente_nome: p.nome,
            data: dataHoje,
            pendencia_geral: houvePendencia,
            itens: itensHistorico 
        }]);

        await carregarDadosDoBanco();
        fecharModal('modal_retirada');
        alert("Retirada registrada com sucesso!"); // MENSAGEM SUCESSO
        
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
          <td>
            <input type="number" value="${pm.qtd}" min="1" id="edit_qtd_${m.id}">
          </td>
          <td>
            <button class="btn btn-sm btn-red" onclick="removerMedPaciente(${id}, ${m.id})">
              <i class="fas fa-trash"></i>
            </button>
          </td>
        </tr>
      `;
    });

  document.getElementById('modal_edit_paciente').style.display = 'flex';
}

async function removerMedPaciente(pId, mId) {
    if(!confirm("Remover este remédio da receita?")) return;
    try {
        const { error } = await _supabase
            .from('prescricoes')
            .delete()
            .match({ paciente_id: pId, med_id: mId });
            
        if(error) throw error;
        
        await carregarDadosDoBanco();
        abrirModalEditarPaciente(pId);
        alert("Remédio removido da receita com sucesso!"); // MENSAGEM SUCESSO
    } catch (err) {
        alert(err.message);
    }
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
                    await _supabase
                        .from('prescricoes')
                        .update({ qtd: novaQtd })
                        .match({ paciente_id: pId, med_id: pm.medId });
                }
            }
        }
        await carregarDadosDoBanco();
        fecharModal('modal_edit_paciente');
        alert("Alterações salvas com sucesso!"); // MENSAGEM SUCESSO
    } catch(err) {
        alert(err.message);
    }
}

/* ================= ADD MED EXTRA ================= */
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
        const { error } = await _supabase.from('prescricoes').insert([{
            paciente_id: targetPatientId,
            med_id: mId,
            qtd: 1
        }]);
        if(error) throw error;

        await carregarDadosDoBanco(); // Atualiza o db local
        
        // Em vez de fechar tudo, apenas atualizamos o modal de edição que está por baixo
        alert("Medicamento adicionado!");
        fecharModal('modal_add_med_patient');
        
        // Re-renderiza o modal de edição para mostrar o novo item na tabela
        abrirModalEditarPaciente(targetPatientId);
        
    } catch (err) {
        alert("Erro ao adicionar: " + err.message);
    }
}

/* ================= DASHBOARD & HISTÓRICO ================= */
function renderDashboard() {
    const mesInput = document.getElementById('dash_mes').value;
    const retiradasDoMes = db.historico.filter(h => h.data.startsWith(mesInput));
    
    const totalItensEntregues = retiradasDoMes.reduce((acc, h) => {
        return acc + (h.itens || []).reduce((sum, i) => sum + i.qtdEntregue, 0);
    }, 0);

    const estoqueBaixo = db.meds.filter(m => m.qtd <= m.min).length;

    document.getElementById('kpi_retiradas').innerText = retiradasDoMes.length;
    document.getElementById('kpi_itens_total').innerText = totalItensEntregues;
    document.getElementById('kpi_alerta').innerText = estoqueBaixo;
}

function renderHistoricoGeral() {

    injetarFiltroPendencia();
    const tbody = document.querySelector('#table_historico_geral tbody');
    tbody.innerHTML = '';

    const nomeFiltro = document.getElementById('hist_nome')?.value.toUpperCase() || '';
    const ini = document.getElementById('hist_ini')?.value || '';
    const fim = document.getElementById('hist_fim')?.value || '';
    const apenasPendentes = document.getElementById('hist_pendencia')?.checked || false;

    // Pegamos o histórico ordenado por data (mais recente primeiro)
    const historicoFiltrado = [...db.historico]
        .sort((a,b) => b.data.localeCompare(a.data))
        .filter(h => {
            const pNome = h.pacienteNome ? h.pacienteNome.toUpperCase() : '';
            if (nomeFiltro && !pNome.includes(nomeFiltro)) return false;
            if (ini && h.data < ini) return false;
            if (fim && h.data > fim) return false;
            // FILTRO DE PENDÊNCIA (Novo!)
            if (apenasPendentes && h.pendenciaGeral !== true) return false;
                    return true;
            });

    historicoFiltrado.forEach(h => {
        const detalhes = (h.itens || [])
            .map(i => `${i.nomeRemedio}: ${i.qtdEntregue}`)
            .join(', ');

        const dataFormatada = h.data ? h.data.split('-').reverse().join('/') : '-';

        tbody.innerHTML += `
            <tr>
                <td>${dataFormatada}</td>
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

// FUNÇÃO DA LUPA: MOSTRA TUDO DO PACIENTE
function verDossiePaciente(pId) {
    const p = db.pacientes.find(x => x.id === pId);
    if (!p) {
        alert("Dados do paciente não encontrados no sistema atual.");
        return;
    }

    // 1. Informações Pessoais
    const infoDiv = document.getElementById('detalhe_info_pessoal');
    infoDiv.innerHTML = `
        <p><strong><i class="fas fa-user"></i> Nome:</strong> ${p.nome}</p>
        <p><strong><i class="fas fa-map-marker-alt"></i> Endereço:</strong> ${p.endereco || 'Não informado'}</p>
        <p><strong><i class="fas fa-phone"></i> Contato:</strong> ${p.contato || 'Não informado'}</p>
        <p><strong><i class="fas fa-calendar-check"></i> Última Retirada:</strong> ${p.ultimaRetirada || 'Nunca retirou'}</p>
        <p><strong><i class="fas fa-exclamation-triangle"></i> Status de Pendência:</strong> 
           ${p.temPendencia ? '<span style="color:var(--danger)">Possui pendências de estoque</span>' : '<span style="color:var(--success)">Regular</span>'}
        </p>
        <button class="btn btn-sm btn-red" onclick="excluirHistoricoGeral(${p.id})">
                <i class="fas fa-trash-alt"></i> ELIMINAR TODOS OS DADOS DESSA PESSOA
        </button>
    `;

    // 2. Lista de todas as vezes que ele retirou algo
    const histDiv = document.getElementById('detalhe_lista_historico');
    const logs = db.historico
        .filter(h => h.paciente_id === pId)
        .sort((a,b) => b.data.localeCompare(a.data));

    if(logs.length === 0) {
        histDiv.innerHTML = "<p style='text-align:center; color:var(--text-muted); padding:10px;'>Nenhuma retirada registrada.</p>";
    } else {
        histDiv.innerHTML = logs.map(l => {
            const itens = l.itens.map(i => `<li>${i.nomeRemedio} - Entregue: ${i.qtdEntregue} (${i.status})</li>`).join('');
            const botaoResolver = l.pendenciaGeral 
                ? `<button class="btn btn-sm" style="margin-top:5px; background:var(--primary);" onclick="abrirModalResolver(${l.id})">
                    <i class="fas fa-box-open"></i> Resolver Pendência
                   </button>` 
                : '';

            return `
                <div style="border-bottom: 1px solid #ddd; padding: 10px 0;">
                    <small>Data: ${l.data.split('-').reverse().join('/')}</small>
                    ${botaoResolver}
                    <button class="btn-trash" title="Excluir este dia" onclick="excluirEntradaHistorico(${l.id}, ${p.id})">
                            <i class="fas fa-trash"></i>
                        </button>
                    <ul style="margin: 5px 0; padding-left: 20px; font-size: 12px;">${itens}</ul>
                </div>
            `;
        }).join('');
    }

    document.getElementById('modal_detalhes_historico').style.display = 'flex';
}

function injetarFiltroPendencia() {
    const filterBar = document.querySelector('#tab-historico .filter-bar'); // Ajuste o seletor conforme seu HTML
    if (filterBar && !document.getElementById('hist_pendencia')) {
        const div = document.createElement('label');
        div.className = 'filter-check-container';
        div.innerHTML = `
            <input type="checkbox" id="hist_pendencia" onchange="renderHistoricoGeral()">
            <span>Ver apenas pendências</span>
        `;
        filterBar.appendChild(div);
    }
}

function abrirModalResolver(histId) {
    const log = db.historico.find(h => h.id === histId);
    if (!log) return;

    currentHistoryIdToResolve = histId;
    const tbody = document.getElementById('resolver_tbody');
    tbody.innerHTML = '';

    // Precisamos saber quanto era a prescrição original. 
    // Como o histórico antigo pode não ter essa info, vamos cruzar com a receita atual do paciente
    const paciente = db.pacientes.find(p => p.id === log.paciente_id);

    log.itens.forEach(item => {
        // Busca na prescrição do paciente quanto ele deveria receber
        const prescrito = paciente.meds.find(m => {
            const medInfo = db.meds.find(med => med.id === m.medId);
            return medInfo.nome === item.nomeRemedio;
        });

        const qtdFaltante = prescrito ? (prescrito.qtd - item.qtdEntregue) : 0;

        // SÓ MOSTRA SE AINDA FALTAR ALGO (Remédios entregues não aparecem)
        if (qtdFaltante > 0) {
            const medEstoque = db.meds.find(m => m.nome === item.nomeRemedio);
            const sugestao = Math.min(medEstoque.qtd, qtdFaltante);

            tbody.innerHTML += `
                <tr>
                    <td>${item.nomeRemedio}</td>
                    <td style="color:var(--danger)">${qtdFaltante}</td>
                    <td>
                        <input type="number" id="resolver_qtd_${item.nomeRemedio}" 
                               value="${sugestao}" min="0" max="${medEstoque.qtd}" style="width:60px;">
                    </td>
                </tr>
            `;
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
                const medBD = db.meds.find(m => m.nome === novosItens[i].nomeRemedio);
                
                // 1. Abater do estoque no Supabase
                const novoEstoque = medBD.qtd - qtdAgora;
                await _supabase.from('medicamentos').update({ qtd: novoEstoque }).eq('id', medBD.id);

                // 2. Atualizar objeto do histórico
                novosItens[i].qtdEntregue += qtdAgora;
                
                // Verificar se após essa entrega ainda falta
                const prescrito = paciente.meds.find(m => m.medId === medBD.id);
                if (novosItens[i].qtdEntregue < prescrito.qtd) {
                    aindaTemPendencia = true;
                    novosItens[i].status = `PARCIAL (${novosItens[i].qtdEntregue}/${prescrito.qtd})`;
                } else {
                    novosItens[i].status = "OK";
                }
            }
        }

        // 3. Atualizar o registro de Histórico no Supabase
        await _supabase.from('historico').update({
            data: novaData, // Atualiza para o dia da retirada da pendência
            itens: novosItens,
            pendencia_geral: aindaTemPendencia
        }).eq('id', currentHistoryIdToResolve);

        // 4. Atualizar o status de pendência no cadastro do Paciente (opcional)
        // Se este log era o único pendente, o paciente fica OK.
        await _supabase.from('pacientes').update({ tem_pendencia: aindaTemPendencia }).eq('id', log.paciente_id);

        alert("Pendência atualizada com sucesso!");
        fecharModal('modal_resolver_pendencia');
        fecharModal('modal_detalhes_historico');
        await carregarDadosDoBanco(); // Recarrega tudo

    } catch (err) {
        alert("Erro ao resolver: " + err.message);
    }
}

/* ================= EXCLUSÃO DE HISTÓRICO ================= */

// 1. Apaga apenas UM dia de retirada
async function excluirEntradaHistorico(histId, pId) {
    if (!confirm("Deseja excluir este registro de retirada permanentemente?")) return;

    try {
        const { error } = await _supabase
            .from('historico')
            .delete()
            .eq('id', histId);

        if (error) throw error;

        alert("Registro excluído com sucesso!");
        await carregarDadosDoBanco(); // Atualiza o DB local
        verDossiePaciente(pId); // Recarrega o dossiê para mostrar a lista atualizada
    } catch (err) {
        alert("Erro ao excluir registro: " + err.message);
    }
}

// 2. Apaga TODO o histórico de um paciente
async function excluirHistoricoGeral(pId) {
    if (!confirm("CUIDADO: Isso apagará TODO o histórico de retiradas deste paciente. Continuar?")) return;

    try {
        const { error } = await _supabase
            .from('historico')
            .delete()
            .eq('paciente_id', pId);

        if (error) throw error;

        alert("Todo o histórico foi removido!");
        await carregarDadosDoBanco();
        fecharModal('modal_detalhes_historico'); // Fecha o dossiê já que não há mais o que ver
    } catch (err) {
        alert("Erro ao limpar histórico: " + err.message);
    }

}

// Verifica se o usuário já está logado ao carregar a página
window.addEventListener('load', async () => {
    // 1. Verifica se existe sessão ativa (Login normal)
    const { data: { session } } = await _supabase.auth.getSession();

    // 2. Verifica se a URL tem o hash de recuperação/convite (Vindo do E-mail)
    const hash = window.location.hash;

    // Se tiver "type=invite" ou "type=recovery" na URL, mostra tela de criar senha
    if (hash && (hash.includes("type=invite") || hash.includes("type=recovery"))) {
        console.log("Link de convite detectado!");
        configurarTelaNovaSenha(); 
    } 
    // Se não for convite, mas tiver sessão, entra no app
    else if (session) {
        mostrarApp();
    }
    // Se não tiver nada, o usuário vê a tela de login normal (que já está no HTML)
});

async function handleAuth() {
    const email = document.getElementById('auth-email').value;
    const passwordField = document.getElementById('auth-password');
    const msg = document.getElementById('auth-msg');

    // Se o campo de senha está escondido, primeiro verificamos o e-mail
    if (passwordField.classList.contains('hide')) {
        // Aqui apenas mostramos o campo de senha para quem já tem conta
        passwordField.classList.remove('hide');
        document.getElementById('auth-subtitle').innerText = "Digite sua senha";
        return;
    }

    const password = passwordField.value;
    
    // Tenta fazer login
    const { error } = await _supabase.auth.signInWithPassword({ email, password });

    if (error) {
        msg.innerText = "Erro: " + error.message;
    } else {
        mostrarApp();
    }
}

// Para quem clicou no e-mail para criar a senha
function configurarTelaNovaSenha() {
    // Esconde o login normal e adapta para "Criar Senha"
    document.getElementById('auth-container').classList.remove('hide');
    document.getElementById('app-content').classList.add('hide'); // Garante que o app tá escondido

    document.getElementById('auth-title').innerText = "Bem-vindo ao S.A.D.";
    document.getElementById('auth-subtitle').innerText = "Crie sua senha de acesso";
    
    // Esconde campo de e-mail (já sabemos quem é)
    document.getElementById('auth-email').classList.add('hide');
    
    // Mostra campo de senha
    const passInput = document.getElementById('auth-password');
    passInput.classList.remove('hide');
    passInput.placeholder = "Nova Senha";
    
    const btn = document.querySelector('#auth-container .btn');
    btn.innerText = "Salvar e Entrar";
    
    // Muda a ação do botão para ATUALIZAR a senha
    btn.onclick = async () => {
        const newPassword = passInput.value;
        if(newPassword.length < 6) {
            alert("A senha precisa ter pelo menos 6 caracteres.");
            return;
        }

        const { data, error } = await _supabase.auth.updateUser({ password: newPassword });
        
        if (error) {
            alert("Erro: " + error.message);
        } else {
            alert("Senha cadastrada com sucesso!");
            mostrarApp(); // Entra no sistema
            // Limpa a URL para não ficar suja
            window.history.replaceState(null, null, window.location.pathname);
        }
    };
}

function mostrarApp() {
    document.getElementById('auth-container').classList.add('hide');
    document.getElementById('app-content').classList.remove('hide');
    // Inicie suas funções de renderização aqui
    carregarDadosDoBanco();
}

async function logout() {
    await _supabase.auth.signOut();
    window.location.reload();
}

