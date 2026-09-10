# Handoff — Lider CRM — Etapa 1

## Estado

Etapa 1 concluída em 2026-09-02. Nenhuma migração de banco ou deploy foi
executado. O arquivo de origem foi preservado; as mudanças desta etapa são
as alterações presentes neste diretório.

## Alterações feitas

1. **Guardrail de produção**
   - `ENV=production` agora exige `JWT_SECRET`, `ALLOWED_ORIGINS`,
     `SUPABASE_URL` e `SUPABASE_ANON_KEY` fornecidos explicitamente.
   - O Worker retorna `503 PRODUCTION_MISCONFIGURED` para as demais rotas
     quando um check está pendente.
   - `/api/v1/health` continua público para diagnóstico.

2. **Evolution API protegida**
   - Criados `POST /api/v1/whatsapp/send` e
     `GET /api/v1/whatsapp/status`.
   - A chave fica somente nas variáveis do Worker.
   - `js/whatsapp.js` não lê mais meta tag, `window` ou chave do provedor.
   - Sem configuração da Evolution, o frontend mantém o fallback para
     abrir o WhatsApp normalmente.

3. **Métodos HTTP**
   - Removido o retry automático que transformava um 405 em outro método.
   - Um GET acidental não pode mais ser convertido silenciosamente em POST,
     PUT ou DELETE.

4. **Documentação e operação**
   - README ajustado para refletir o runtime real.
   - Adicionado alias `npm run verify:mirror`.

## Configurar na conta nova

No ambiente de produção do Worker, configurar os valores reais:

```text
ENV=production
JWT_SECRET=<segredo aleatório forte>
SUPABASE_URL=<URL do projeto>
SUPABASE_ANON_KEY=<publishable/anon key>
ALLOWED_ORIGINS=<origens web separadas por vírgula>
SUPABASE_SERVICE_ROLE=<service role, se usado pelo backend>
EVOLUTION_BASE_URL=<URL da Evolution API, opcional>
EVOLUTION_API_KEY=<chave da Evolution API, opcional>
EVOLUTION_INSTANCE=lidercrm
```

Não colocar `JWT_SECRET`, `SUPABASE_SERVICE_ROLE` ou `EVOLUTION_API_KEY` em
`index.html`, `app.html`, `www/`, `js/`, meta tags ou variáveis expostas ao
navegador.

## Validação para retomar

Executar na ordem:

```sh
npm ci
npm test -- --run
npm run lint
npm run typecheck
npm run mirror:check
npm run audit:load-order
npm run check:load-order
npm run audit:name-collisions
```

Também testar manualmente:

- `GET /api/v1/health` sem configuração de produção;
- login com `ENV=production` e configuração completa;
- envio de WhatsApp com a chave somente no Worker;
- chamada GET acidental para rota POST, esperando 405 sem mutação;
- `npm run cap:sync` e igualdade raiz/`www/`.

## Próximo ponto de parada

A próxima etapa recomendada é **Etapa 2 — estabilização de dados**, nesta
ordem:

1. adicionar versionamento/ETag efetivo aos documentos mutáveis;
2. tornar movimentos do Kanban atômicos;
3. parar de ignorar erros do dual-write relacional + `fs_documents`;
4. escolher uma fonte principal por domínio;
5. consolidar as duas filas offline;
6. só depois iniciar a migração gradual de `fs_documents` para tabelas.

Não iniciar ainda uma reescrita React nem adicionar novos patches globais.