// Executar com: node tests/persistencia.cjs (sem instalar dependências).
const fs = require('node:fs');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const fonte = fs.readFileSync(require('node:path').join(__dirname, '../index.html'), 'utf8');
for (const script of fonte.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/gi)) new vm.Script(script[1]);
function extrair(nome) {
    const marcador = fonte.includes('        async function ' + nome + '(') ? '        async function ' : '        function ';
    const inicio = fonte.indexOf(marcador + nome + '(');
    assert.ok(inicio >= 0, nome);
    return fonte.slice(inicio, fonte.indexOf('\n        }', inicio) + '\n        }'.length);
}
const dados = new Map();
const remotos = new Map();
let falhar = false, falharProgresso = false, duranteEnvio = null;
const status = { style: {} };
const bancoDados = {
    from(tabela) {
        const consulta = { tabela, id: null, operacao: 'select', valor: null,
            select() { return this; }, eq(c, v) { this.id = String(v); return this; },
            update(v) { this.operacao = 'update'; this.valor = v; return this; },
            async maybeSingle() { return { data: remotos.get(this.id) || null, error: null }; },
            async single() {
                if (falhar || falharProgresso) return { error: new Error('offline') };
                if (this.operacao === 'update') remotos.set('aluno:' + this.id, this.valor);
                return { data: { id: this.id, ...(remotos.get('aluno:' + this.id) || { aulas_concluidas: [] }) }, error: null };
            },
            async upsert(v) {
                if (falhar) return { error: new Error('offline') };
                remotos.set(v.id, structuredClone(v));
                if (duranteEnvio) { const fn = duranteEnvio; duranteEnvio = null; fn(); }
                return { error: null };
            }
        };
        return consulta;
    }
};
const contexto = vm.createContext({
    bancoDados, console: { warn() {} }, setTimeout() { return 1; }, clearTimeout() {},
    localStorage: { getItem: k => dados.get(k) ?? null, setItem: (k,v) => dados.set(k,v) },
    document: { getElementById: () => status }
});
vm.runInContext(`
    let alunoLogadoDados = { id: 'ana' }, alunoLogado = 'ana';
    let respostasHtmlAtual = {}, aulaHtmlRespostasId = 'ingles_1_1', nomeAulaHtmlAtual = 'Teste';
    let timerSalvamentoHtml, sincronizandoAtividades = false;
    const atividadesPendentes = new Map();
    let aulasConcluidasAluno = [], respostasAbertas = {}, passosAulaAtual = [{tipo:'pergunta',pergunta:'Nome?'}];
    let cursoSelecionado = 'ingles', modSelecionado = 1, aulaSelecionada = 1, passoAtual = 0;
`, contexto);
for (const nome of ['chaveLocalRespostasHtml', 'atualizarStatusRespostasHtml', 'carregarRespostasHtmlNuvem', 'registrarRespostaHtml', 'persistirAtividadesPendentes', 'recuperarAtividadesPendentes', 'sincronizarAtividadesPendentes', 'salvarRespostaAberta', 'salvarProgressoAlunoNuvem', 'obterRespostasDoPassoHtml']) vm.runInContext(extrair(nome), contexto);
const run = s => vm.runInContext(s, contexto);
async function testar() {
    run("salvarRespostaAberta(0, 'Ana')");
    assert.equal(run("respostasHtmlAtual['passo-0'].valor"), 'Ana');
    assert.ok(dados.has('respostas_ana_ingles_1_1'));
    assert.ok(dados.has('atividades_pendentes_ana'));
    falhar = true;
    await run('sincronizarAtividadesPendentes()');
    assert.equal(run('atividadesPendentes.size'), 1);
    assert.match(status.textContent, /pendente/);
    run('atividadesPendentes.clear(); respostasHtmlAtual = {}; recuperarAtividadesPendentes()');
    assert.equal(run('atividadesPendentes.size'), 1, 'reabertura recupera fila offline');
    falhar = false;
    await run('sincronizarAtividadesPendentes()');
    assert.equal(remotos.get('ana__ingles_1_1').respostas[0].valor, 'Ana');
    assert.equal(run('atividadesPendentes.size'), 0);
    run("respostasHtmlAtual = {}; respostasAbertas = {}; alunoLogadoDados = {id:'outra'}; alunoLogado = 'outra'");
    await run("carregarRespostasHtmlNuvem('ingles_1_1')");
    assert.equal(run('Object.keys(respostasHtmlAtual).length'), 0, 'outra conta não recebe rascunhos');
    run("alunoLogadoDados = {id:'ana'}; alunoLogado = 'ana'");
    dados.set('respostas_html_ana_ingles_1_1', JSON.stringify([{campo_id:'passo-0',valor:'Mais recente',atualizado_em:'2099-01-01'}]));
    await run("carregarRespostasHtmlNuvem('ingles_1_1')");
    assert.equal(run('respostasAbertas[0]'), 'Mais recente', 'nuvem antiga não sobrescreve rascunho novo');
    remotos.set('ana__ingles_1_3', {respostas:[{pergunta:'Nome?',resposta:'Resposta antiga'}]});
    await run("carregarRespostasHtmlNuvem('ingles_1_3')");
    assert.equal(run('respostasAbertas[0]'), 'Resposta antiga', 'respostas anteriores continuam restauráveis');
    await run("carregarRespostasHtmlNuvem('ingles_1_1')");
    run("registrarRespostaHtml({campo_id:'quiz',tipo:'quiz',valor:'0',resposta:'A',correta:false}); registrarRespostaHtml({campo_id:'quiz',tipo:'quiz',valor:'1',resposta:'B',correta:true})");
    assert.equal(run('respostasHtmlAtual.quiz.tentativas.length'), 2);
    assert.equal(run('respostasHtmlAtual.quiz.tentativas[0].correta'), false);
    duranteEnvio = () => run("registrarRespostaHtml({campo_id:'nova',tipo:'texto',valor:'durante envio'})");
    await run('sincronizarAtividadesPendentes()');
    assert.equal(run('atividadesPendentes.size'), 1, 'resposta durante envio não é descartada');
    await run('sincronizarAtividadesPendentes()');
    assert.ok(remotos.get('ana__ingles_1_1').respostas.some(r => r.campo_id === 'nova'));
    // A conclusão reenvia tanto o registro da aula quanto o dashboard.
    remotos.set('aluno:ana', {aulas_concluidas:['ingles_1_2']});
    falharProgresso = true;
    await run('salvarProgressoAlunoNuvem()');
    assert.equal(run('atividadesPendentes.size'), 1, 'conclusão permanece pendente quando o dashboard falha');
    falharProgresso = false;
    await run('sincronizarAtividadesPendentes()');
    assert.deepEqual(Array.from(remotos.get('aluno:ana').aulas_concluidas), ['ingles_1_2','ingles_1_1']);
    assert.ok(remotos.get('ana__ingles_1_1').respostas.some(r => r.campo_id === 'portal-conclusao'));
    run("registrarRespostaHtml({campo_id:'html-0:campo',tipo:'texto',valor:'A'}); registrarRespostaHtml({campo_id:'html-1:campo',tipo:'texto',valor:'B'})");
    assert.equal(run("obterRespostasDoPassoHtml().find(r=>r.campo_id==='campo').valor"), 'A');
    run("passoAtual=1");
    assert.equal(run("obterRespostasDoPassoHtml().find(r=>r.campo_id==='campo').valor"), 'B');
    run("alunoLogado='professora_teste'; atividadesPendentes.clear(); registrarRespostaHtml({campo_id:'teste',valor:'não salvar'})");
    assert.equal(run('atividadesPendentes.size'), 0);
    // Confere também a sintaxe dos scripts gerados, executados dentro do iframe.
    const inseridos = [];
    const doc = {
        querySelector() { return null; }, querySelectorAll() { return []; },
        createElement(tag) { const el = {tag, name:'', content:'', textContent:''}; inseridos.push(el); return el; },
        head: { prepend() {}, appendChild() {} }, documentElement: {outerHTML:'<html></html>'}
    };
    contexto.DOMParser = class { parseFromString() { return doc; } };
    vm.runInContext(extrair('prepararHtmlParaIframe'),contexto);
    run(`prepararHtmlParaIframe('', [{campo_id:'portal-storage-local',tipo:'armazenamento',valor:JSON.stringify({quiz:'salvo'})}])`);
    const scripts = inseridos.filter(el=>el.tag==='script');
    scripts.forEach(el=>new vm.Script(el.textContent));
    const mensagens = [];
    const filho = { window: {}, parent:{postMessage:msg=>mensagens.push(msg)} };
    vm.runInNewContext(scripts[0].textContent, filho);
    assert.equal(filho.window.portalStorageAula.getItem('quiz'),'salvo');
    filho.window.portalStorageAula.setItem('quiz','novo');
    assert.equal(JSON.parse(mensagens[0].registro.valor).quiz,'novo');
    console.log('OK: sintaxe, rascunhos por aluno, offline/reabertura/reenvio, restauração, tentativas, corrida de envio, conclusão, múltiplos HTML, modo teste e storage do iframe.');
}
testar().catch(e=>{ console.error(e); process.exitCode=1; });
