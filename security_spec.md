# Especificação de Segurança Firestore — Ameta Cadastro de Prestadores

## 1. Invariantes de Dados
1. **Envio público estrito (`cadastros`)**: Visitantes não autenticados só podem executar `create` em `/cadastros/{cadastroId}`, fornecendo exatamente os 16 campos do formulário público e os 6 campos de estado inicial (`status == "Novo"`, `observacoes == ""`, `visto == false`, `vistoEm == null`, `criadoEm == request.time`, `atualizadoEm == request.time`). Nenhum campo extra é aceito.
2. **Isolamento de leitura pública**: Visitantes sem autenticação, contas Firebase Auth sem documento em `/usuarios/{uid}` e usuários com `ativo == false` nunca podem ler (`get` ou `list`), atualizar ou excluir documentos em nenhuma coleção.
3. **RBAC em duas camadas (`/usuarios/{uid}` com `role: "admin" | "operador"`)**:
   - `operador` (`ativo == true`): pode ler e listar `cadastros` e `termos`, atualizar exclusivamente `status`, `observacoes`, `visto`, `vistoEm` e `atualizadoEm` em `cadastros`, criar `termos` imutáveis e registrar eventos próprios em `auditoria`. Não pode alterar os 16 campos cadastrais, excluir registros, ler `auditoria` nem gerenciar `usuarios`.
   - `admin` (`ativo == true`): possui todas as permissões de operador, além de editar os 16 campos de `cadastros`, excluir `cadastros`/`termos`, ler/listar `auditoria` e criar/ler/atualizar/excluir `usuarios` (impedido de desativar, rebaixar ou remover o próprio acesso).
4. **Imutabilidade de auditoria e termos**: Registros em `/termos` e `/auditoria` nunca podem ser alterados (`allow update: if false;`), e registros em `/auditoria` nunca podem ser excluídos (`allow delete: if false;`).
5. **Documentos opcionais (`/cadastros/{cadastroId}/documentos/{docTipo}`)**: Aceita apenas os tipos `rg`, `cnh` e `certificado_mei`, com MIME permitido (`application/pdf`, `image/jpeg`, `image/png`, `image/webp`) e tamanho máximo de 700 KB (`conteudoBase64 <= 950000`). Visitantes só podem criar atomicamente junto com o novo cadastro (`getAfter(...).data.criadoEm == request.time`), nunca ler, listar, alterar ou anexar a cadastros já existentes.

## 2. Payloads Adversariais ("Dirty Dozen")
1. **Leitura anônima em `cadastros` ou `documentos`**: Visitante sem login executa `getDoc`/`getDocs` em `cadastros` ou `cadastros/{id}/documentos` -> `PERMISSION_DENIED`.
2. **Campo fantasma no formulário público**: Visitante envia os 16 campos + `isAdmin: true` -> `PERMISSION_DENIED` (`hasOnly`).
3. **Status inicial adulterado**: Visitante cria `cadastros` com `status: "Concluído"` ou `visto: true` -> `PERMISSION_DENIED`.
4. **CPF/CNPJ com formato inválido ou repetido**: Visitante envia `cpf: "111.111.111-11"` ou `cnpj: "00.000.000/0000-00"` -> `PERMISSION_DENIED`.
5. **Timestamp forjado**: Visitante envia `criadoEm` diferente de `request.time` -> `PERMISSION_DENIED`.
6. **ID venenoso**: Criação com ID contendo caracteres especiais ou >128 chars -> `PERMISSION_DENIED` (`isValidId`).
7. **Usuário autenticado fora de `usuarios` ou com `ativo: false`**: Conta Firebase Auth válida sem documento ativo em `/usuarios/{uid}` tenta ler `cadastros` -> `PERMISSION_DENIED`.
8. **Auto-promoção de privilégio**: `operador` tenta criar/atualizar seu próprio documento em `/usuarios/{uid}` para `role: "admin"` -> `PERMISSION_DENIED`.
9. **Edição indevida por operador**: `operador` tenta alterar `nomeCompleto` ou `cpf` em `cadastros`, ou excluir `cadastros`/`termos`/`documentos` -> `PERMISSION_DENIED`.
10. **Leitura ou adulteração de auditoria**: `operador` tenta listar `/auditoria`, ou qualquer usuário tenta atualizar/apagar um log de `/auditoria` -> `PERMISSION_DENIED`.
11. **Falsificação de ator na auditoria**: Usuário da equipe tenta gravar `/auditoria` com `uid` de outro usuário -> `PERMISSION_DENIED`.
12. **Termo ou anexo órfão / inválido**: Criação em `/termos` com `cadastroId` inexistente, atualização de `/termos/{id}`, ou anexo público em `/cadastros/{id}/documentos/{docTipo}` fora da criação atômica do cadastro ou com `docTipo`/MIME/tamanho inválido -> `PERMISSION_DENIED`.
