// Teste opcional: node tests/persistencia-real.cjs --banco-real
// Cria uma conta sintética, usa a API real e remove somente os registros desse teste.
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const { randomUUID, randomInt } = require('node:crypto');
if (!process.argv.includes('--banco-real')) throw Error('Informe --banco-real para criar e remover registros sintéticos no banco configurado no portal.');
const fonte = fs.readFileSync(path.join(__dirname, '../index.html'), 'utf8');
const base = fonte.match(/const SUPABASE_URL = "([^"]+)"/)[1];
const chave = fonte.match(/const SUPABASE_KEY = "([^"]+)"/)[1];
const alunoId = '__teste_salvamento_' + randomUUID();
const aulaId = '__teste_aula_' + randomUUID();
const registroId = alunoId + '__' + aulaId;
let criado = false, offline = false;
async function api(tabela, { method = 'GET', filtros = {}, select, body } = {}) {
    const parametros = new URLSearchParams(filtros);
    if (select) parametros.set('select', select);
    const resposta = await fetch(base + '/rest/v1/' + tabela + '?' + parametros, {
        method, headers: { apikey: chave, 'Content-Type': 'application/json', Prefer: 'return=representation,resolution=merge-duplicates' },
        ...(body ? { body: JSON.stringify(body) } : {}), signal: AbortSignal.timeout(20000)
    });
    const texto = await resposta.text();
    if (!resposta.ok) throw Error(`API ${tabela}: ${resposta.status} ${texto}`);
    return texto ? JSON.parse(texto) : null;
}
const bancoDados = { from(tabela) {
    return { method: 'GET', filtros: {}, colunas: '*', body: undefined,
        select(s) { this.colunas=s; return this; }, eq(c,v) { this.filtros[c]='eq.'+v; return this; },
        order() { return this; }, upsert(v) { this.method='POST'; this.body=v; return this; },
        update(v) { this.method='PATCH'; this.body=v; return this; },
        async executar(unico) {
            try {
                if (offline) throw Error('Falha de conexão simulada');
                const data = await api(tabela, {method:this.method, filtros:this.filtros, select:this.colunas, body:this.body});
                if (unico === 'single' && data?.length !== 1) throw Error('Era esperado um registro');
                return {data:unico ? data?.[0] || null : data,error:null};
            } catch(error) { return {data:null,error}; }
        },
        maybeSingle() { return this.executar('maybe'); }, single() { return this.executar('single'); },
        then(ok, erro) { return this.executar().then(ok,erro); }
    };
} };
const local = new Map();
const elementos = new Map();
const elemento = id => { if (!elementos.has(id)) elementos.set(id,{style:{},textContent:'',innerHTML:'',value:''}); return elementos.get(id); };
const ctx = vm.createContext({ bancoDados, console, setTimeout(){return 1;}, clearTimeout(){},
    localStorage:{getItem:k=>local.get(k)??null,setItem:(k,v)=>local.set(k,v)}, document:{getElementById:elemento} });
vm.runInContext(`let alunoLogadoDados={id:${JSON.stringify(alunoId)}}, alunoLogado='teste automático';
let respostasHtmlAtual={},aulaHtmlRespostasId=${JSON.stringify(aulaId)},nomeAulaHtmlAtual='Teste de salvamento';
let timerSalvamentoHtml,sincronizandoAtividades=false; const atividadesPendentes=new Map();
let aulasConcluidasAluno=[],respostasAbertas={},respostasAlunosProfessor=[],passosAulaAtual=[{tipo:'pergunta',pergunta:'Resposta de verificação'}];
let cursoSelecionado='teste',modSelecionado='teste',aulaSelecionada='teste';`,ctx);
function adicionar(nome) {
    const prefixo = fonte.includes('        async function '+nome+'(') ? '        async function ' : '        function ';
    const inicio = fonte.indexOf(prefixo+nome+'(');
    assert.ok(inicio>=0,nome);
    vm.runInContext(fonte.slice(inicio,fonte.indexOf('\n        }',inicio)+'\n        }'.length),ctx);
}
for (const nome of ['chaveLocalRespostasHtml','atualizarStatusRespostasHtml','carregarRespostasHtmlNuvem','registrarRespostaHtml','persistirAtividadesPendentes','recuperarAtividadesPendentes','sincronizarAtividadesPendentes','salvarRespostaAberta','salvarProgressoAlunoNuvem','escHtml','renderizarRespostasAlunos','carregarRespostasAlunos']) adicionar(nome);
const run = s=>vm.runInContext(s,ctx);
async function testar() {
    try {
        const inserido = await api('alunos_matriculados',{method:'POST',body:{id:alunoId,nome_aluno:alunoId,senha:String(randomInt(100000,999999)),curso:'informatica',aulas_concluidas:[],modulos_liberados:[]}});
        assert.equal(inserido[0].id,alunoId); criado=true;
        run("salvarRespostaAberta(0,'Texto escrito na verificação'); registrarRespostaHtml({campo_id:'quiz-1',tipo:'quiz',valor:'0',resposta:'Alternativa A',correta:false}); registrarRespostaHtml({campo_id:'quiz-1',tipo:'quiz',valor:'1',resposta:'Alternativa B',correta:true}); registrarRespostaHtml({campo_id:'html-0:observacao',tipo:'textarea',valor:'Prática feita',resposta:'Prática feita',pergunta:'O que você fez?'})");
        await run('sincronizarAtividadesPendentes()');
        assert.equal(run('atividadesPendentes.size'),0,'primeiro envio confirmado');
        // Reabre sem a cópia local: a restauração precisa vir do banco real.
        local.clear();
        run('respostasHtmlAtual={}; respostasAbertas={}');
        await run(`carregarRespostasHtmlNuvem(${JSON.stringify(aulaId)})`);
        assert.equal(run('respostasAbertas[0]'),'Texto escrito na verificação');
        assert.equal(run("respostasHtmlAtual['quiz-1'].tentativas.length"),2);
        assert.equal(run("respostasHtmlAtual['html-0:observacao'].valor"),'Prática feita');
        offline=true;
        run("registrarRespostaHtml({campo_id:'offline',tipo:'texto',valor:'Feito sem conexão',resposta:'Feito sem conexão'})");
        await run('sincronizarAtividadesPendentes()');
        assert.equal(run('atividadesPendentes.size'),1,'falha mantém fila');
        run('atividadesPendentes.clear(); recuperarAtividadesPendentes()');
        offline=false;
        await run('sincronizarAtividadesPendentes()');
        assert.equal(run('atividadesPendentes.size'),0,'reenvio confirmado');
        await run('salvarProgressoAlunoNuvem()');
        const aluno = await api('alunos_matriculados',{filtros:{id:'eq.'+alunoId},select:'aulas_concluidas'});
        assert.ok(aluno[0].aulas_concluidas.includes(aulaId));
        // Restringe a consulta do painel ao aluno sintético, preservando sua função real de renderização.
        const bancoFiltrado = {from(tabela){return bancoDados.from(tabela).eq('aluno_id',alunoId);}};
        ctx.bancoDados=bancoFiltrado;
        await run('carregarRespostasAlunos()');
        const painel = elemento('lista-respostas-alunos').innerHTML;
        for (const texto of ['Texto escrito na verificação','Alternativa B','2 tentativa(s)','Aula concluída','Feito sem conexão']) assert.ok(painel.includes(texto),'Painel contém '+texto);
        console.log('OK na API real: texto, quiz com duas tentativas, HTML, reabertura sem cópia local, fila offline, reenvio, conclusão e painel da professora.');
    } finally {
        // Somente IDs únicos criados por esta execução. Não excluir nem consultar registros de alunos.
        if (criado) {
            await api('respostas_alunos',{method:'DELETE',filtros:{id:'eq.'+registroId}});
            await api('alunos_matriculados',{method:'DELETE',filtros:{id:'eq.'+alunoId}});
            const restantes = await api('respostas_alunos',{filtros:{id:'eq.'+registroId},select:'id'});
            const alunos = await api('alunos_matriculados',{filtros:{id:'eq.'+alunoId},select:'id'});
            assert.equal(restantes.length+alunos.length,0);
            console.log('Limpeza confirmada: nenhum registro sintético permaneceu no banco.');
        }
    }
}
testar().catch(e=>{console.error(e);process.exitCode=1;});
