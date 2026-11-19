# Especificação de Segurança Firestore — Ameta Cadastro de Prestadores

## 1. Invariantes de Dados
1. **Envio público estrito (`cadastros`)**: Visitantes não autenticados só podem executar `create` em `/cadastros/{cadastroId}`, fornecendo exatamente os 16 campos do formulário público e os 6 campos de estado inicial (`status == "Novo"`, `observacoes == ""`, `visto == false`, `vistoEm == null`, `criadoEm == request.time`, `atualizadoEm == request.time`). Nenhum campo extra é aceito.
2. **Isolamento de leitura pública**: Visitantes sem autenticação (e usuários autenticados sem registro ativo em `/usuarios/{uid}`) nunca podem ler (`get` ou `list`), atualizar ou excluir documentos em nenhuma coleção.
3. **RBAC em duas camadas (`/usuarios/{uid}`)**:
   - `operador` (`ativo == true`): pode ler e listar `cadastros` e `termos`, atualizar `cadastros` e `termos`, criar `termos` e criar registros em `auditoria` (sem poder ler ou listar `auditoria` ou gerenciar `usuarios`, nem excluir documentos).
   - `administrador` (`ativo == true` ou e-mail inicial verificado): possui todas as permissões de operador, além de excluir `cadastros`/`termos`, ler/listar `auditoria` e criar/ler/atualizar/excluir `usuarios`.
4. **Integridade de autoria e temporal**: `criadoEm` e `atualizadoEm` devem corresponder a `request.time`. Em `termos`, `geradoPorUid` deve igualar `request.auth.uid` e o `cadastroId` deve existir em `/cadastros`. Em `auditoria`, `atorUid` deve igualar `request.auth.uid` e atualizações/exclusões são bloqueadas.

## 2. Payloads Adversariais ("Dirty Dozen")
1. **Leitura anônima em `cadastros`**: Visitante sem login executa `getDoc`/`getDocs` em `cadastros` -> `PERMISSION_DENIED`.
2. **Campo fantasma no formulário público**: Visitante envia os 16 campos + `isAdmin: true` -> `PERMISSION_DENIED` (`hasOnly`).
3. **Status inicial adulterado**: Visitante cria `cadastros` com `status: "Concluído"` ou `visto: true` -> `PERMISSION_DENIED`.
4. **CPF/CNPJ com formato inválido ou repetido**: Visitante envia `cpf: "111.111.111-11"` ou `cnpj: "00.000.000/0000-00"` -> `PERMISSION_DENIED`.
5. **Timestamp forjado**: Visitante envia `criadoEm` diferente de `request.time` -> `PERMISSION_DENIED`.
6. **ID venenoso**: Criação com ID contendo caracteres especiais ou >128 chars -> `PERMISSION_DENIED` (`isValidId`).
7. **Usuário autenticado fora de `usuarios`**: Conta Firebase Auth válida sem documento ativo em `/usuarios/{uid}` tenta ler `cadastros` -> `PERMISSION_DENIED`.
8. **Auto-promoção de privilégio**: `operador` tenta criar/atualizar seu próprio documento em `/usuarios/{uid}` para `perfil: "administrador"` -> `PERMISSION_DENIED`.
9. **Exclusão por operador**: `operador` tenta executar `delete` em `/cadastros/{id}` ou `/termos/{id}` -> `PERMISSION_DENIED`.
10. **Leitura de auditoria por operador**: `operador` tenta listar `/auditoria` -> `PERMISSION_DENIED`.
11. **Falsificação de ator na auditoria**: Usuário do painel tenta gravar `auditoria` com `atorUid` de outro usuário -> `PERMISSION_DENIED`.
12. **Termo órfão ou adulteração de `criadoEm`**: Criação em `/termos` com `cadastroId` inexistente ou atualização tentando alterar `criadoEm` em `cadastros` -> `PERMISSION_DENIED`.
