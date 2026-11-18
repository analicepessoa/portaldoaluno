# Salvamento de atividades

Implementado em 18/11/2026 no `index.html`, usando a tabela já existente `respostas_alunos`, sem alteração da estrutura do banco.

## O que fica registrado

- Perguntas abertas: última versão do texto, mesmo sem concluir a aula.
- Quiz nativo: alternativa, acerto/erro e até 100 tentativas recentes por questão.
- HTML importado: campos de formulário e grupos de alternativas reconhecidos, resultado dos botões de correção reconhecidos e dados gravados com `localStorage.setItem` pelos scripts inline da aula.
- Último passo acessado e conclusão pelo botão do portal. Conclusão não significa aprovação no quiz.
- Textos e escolhas não constituem um histórico de todas as teclas, nem comprovam tempo de estudo.

No painel da professora, abrir **Respostas dos Alunos** e **Atualizar**. Cada cartão apresenta a quantidade de respostas, se há conclusão registrada, a última atualização e permite expandir as tentativas. Dados internos do armazenamento da atividade ficam ocultos. Abrir a aula ou marcar conclusão, isoladamente, não comprova que todos os exercícios foram feitos; conferir as respostas no cartão.

O campo **Filtrar por nome ou apelido do aluno** filtra os registros carregados conforme a digitação. Aceita parte do nome, sem diferenciar maiúsculas e acentos. **Limpar filtro** volta à lista completa. Atualizar os dados mantém o texto da busca.

## Recuperação e sincronização

O portal mantém uma cópia e uma fila de envio por aluno neste navegador. Tenta enviar após a edição, ao entrar novamente, ao voltar a conexão, ao voltar à aba e a cada 30 segundos enquanto o portal está aberto e o aluno está conectado. Fechar o navegador não garante o envio imediato; a fila é retomada no próximo acesso à mesma conta neste aparelho. Limpar os dados do navegador remove registros que ainda não chegaram à nuvem.

Falhas retornadas pelo banco mantêm o envio pendente. A conclusão só sai da fila depois de gravar as atividades e atualizar `aulas_concluidas`. O aluno não altera mais `modulos_liberados` ao concluir aulas.

O carregamento prefere registros mais recentes por campo. A sincronização consulta e mescla respostas remotas antes de enviar; isso reduz sobreposições, mas não substitui uma operação atômica no servidor para edição simultânea da mesma aula em vários aparelhos.

As respostas antigas da nuvem continuam disponíveis. Rascunhos antigos que só existiam na chave local compartilhada `respostas_<aula>` permanecem no navegador, mas não são atribuídos automaticamente a uma conta, pois não identificam o aluno.

## Requisitos dos HTMLs

Manter IDs e nomes estáveis entre versões da aula. Campos dinâmicos sem identificação dependem da ordem no documento. Para alternativas em botões, agrupar a questão com `data-resposta-id="questao-1"`; o grupo deve conter apenas os botões de alternativas. Os seletores comuns `.question`, `.pergunta`, `.quiz-q` e `[data-quiz-question]` também são reconhecidos.

Arquivos enviados, documentos criados em outros aplicativos, páginas externas, canvas, jogos e componentes em outros iframes não são capturados automaticamente. Scripts externos não passam pela adaptação do `localStorage` dos scripts inline. Não foi removido o isolamento de segurança dos HTMLs.

Atividades próprias podem registrar explicitamente o seu estado:

```js
window.portalAtividade.registrar({
    campo_id: 'jogo-associacao', // identificador estável, exclusivo neste passo HTML
    tipo: 'quiz',              // quiz/botao/acao guardam tentativas; texto guarda última versão
    pergunta: 'Associe os dispositivos',
    valor: JSON.stringify({ pares: ['mouse:entrada'] }),
    resposta: '1 associação correta',
    correta: true              // opcional; informar apenas se a atividade corrigiu
});

window.addEventListener('portal-atividades-restauradas', () => {
    const salvo = window.portalAtividade.obter('jogo-associacao');
    if (salvo) {
        const estado = JSON.parse(salvo.valor);
        // Reaplicar o estado à interface do jogo.
    }
});
```

Respostas de texto são limitadas a 10.000 caracteres e o estado de armazenamento a 200.000 caracteres. O modo professora_teste não grava atividades.

## Validação

Executar `node tests/persistencia.cjs`. Os testes não requerem npm nem usam dados reais; verificam sintaxe, separação por aluno, fila offline, recuperação, reenvio, restauração, tentativas, alterações durante envio, conclusão, passos HTML distintos e armazenamento injetado no iframe.

O projeto real foi inspecionado pelo painel do Supabase em 18/11/2026. A conexão automática continua limitada a outra organização; o navegador está conectado à organização `analicepessoa's Org`, onde está `portal-informatica`.

Confirmados: `respostas_alunos.respostas` é JSONB, `id` é a chave primária de texto e `alunos_matriculados.aulas_concluidas` é um array. As tabelas de respostas e alunos permitem SELECT/INSERT/UPDATE ao papel `anon` e estão com RLS desativada. Isso é um problema de segurança existente: a separação de rascunhos no navegador não restringe o acesso público aos dados no servidor. A correção exige revisar autenticação e políticas em conjunto; nenhuma permissão foi alterada nesta verificação.

Executado no banco real um teste com `SET LOCAL ROLE anon`: inserção e atualização por conflito de um registro sintético de respostas, seguidas de `ROLLBACK`. A execução terminou sem erro e uma consulta confirmou que o registro de teste não ficou persistido. Não foram usados nem alterados registros de alunos. Esse teste confirma compatibilidade de esquema e permissões SQL; não substitui um teste completo do cliente pela API REST.

Após a verificação SQL, foi executado `node tests/persistencia-real.cjs --banco-real`, usando as funções de salvamento e de renderização do painel extraídas do próprio portal e um adaptador para a API REST real. O teste criou uma conta sintética com identificadores exclusivos, gravou texto, duas tentativas de quiz e um campo HTML, limpou a cópia local e confirmou a recuperação da nuvem. Também simulou erro de conexão, recuperou a fila, reenviou, verificou a conclusão em `alunos_matriculados` e as respostas no HTML produzido pelo painel da professora. O script confirmou a remoção da conta e das respostas sintéticas. As permissões permaneceram inalteradas, conforme solicitado pela usuária.

No navegador, um HTML de teste isolado confirmou captura de edição e restauração de radio, textarea, alternativas em botões e armazenamento interno no iframe com sandbox. Isso complementa os testes das funções; não é uma simulação de cliques em todas as telas de login e navegação do portal.

Versão do cache do PWA: `portal-educacional-v14`. A publicação pode ser acompanhada pelo histórico de implantação do GitHub Pages do repositório `analicepessoa/portaldoaluno`.
