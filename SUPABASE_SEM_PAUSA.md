# Manter o Supabase ativo

O portal possui uma automação em `.github/workflows/manter-supabase-ativo.yml` que faz uma consulta pequena ao banco três vezes por dia. Ela também pode ser executada manualmente na aba **Actions** do repositório, em **Manter Supabase ativo → Run workflow**.

## Para começar

1. Publique os arquivos na branch principal (`main`).
2. No GitHub, abra **Actions** e confirme que as automações estão habilitadas.
3. Abra **Manter Supabase ativo** e execute **Run workflow** uma vez para testar.
4. Confirme que a execução ficou verde.

A automação usa somente a chave pública que já existe no `index.html`; não é necessário cadastrar uma senha ou uma chave administrativa no GitHub.

## Limitações importantes

- Se o Supabase já estiver pausado, primeiro é necessário reativá-lo no painel do Supabase.
- Em repositórios públicos sem nenhuma atividade por 60 dias, o GitHub pode desabilitar automações agendadas. Nesse caso, abra a aba **Actions** e reative o fluxo.
- No plano pago do Supabase, os projetos não são pausados por inatividade; essa é a opção com garantia de disponibilidade.
