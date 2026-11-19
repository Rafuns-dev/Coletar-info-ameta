# Ameta – Cadastro de Prestadores (Primeiro Contato)

Aplicação corporativa desenvolvida para coletar dados iniciais de prestadores de serviço PJ no primeiro contato com a **Ameta**, com painel administrativo privado para consulta, edição e exportação pela equipe.

---

## 1. Visão Geral das Funcionalidades

### Formulário Público (`/`)
- Página única com **exatamente os 16 campos obrigatórios**, na ordem e com os rótulos definidos.
- Máscaras automáticas e validação real de **CPF** e **CNPJ** (dígitos verificadores), CEP, telefone com DDD e e-mail.
- Proteção anti-spam invisível (**honeypot** + **rate limiting** por IP).
- Tela de confirmação **"Cadastro enviado com sucesso"**.
- Linha única e discreta de conformidade LGPD abaixo do botão **Enviar**.

### Área Administrativa (`/admin`)
- Autenticação privada com e-mail e senha (**Argon2id**) e cookie de sessão `httpOnly`.
- Proteção contra CSRF (`X-Requested-With` + validação de origem), cabeçalhos de segurança (`helmet`) e rate limiting de login.
- **Criptografia em repouso (AES-256-GCM)** dos campos sensíveis no banco de dados.
- **Mascaramento LGPD** de CPF (`***.456.789-**`) e RG na listagem geral; visualização completa apenas na tela de detalhe.
- Busca por nome, CPF, CNPJ ou e-mail, filtro por função e intervalo de datas, ordenação e paginação.
- Página de detalhe com os **16 campos** exatamente como enviados, data/hora do envio, botão **"Copiar dados"**, edição validada, exclusão com confirmação e **exportação individual em PDF**.
- Exportação da lista inteira ou de registros selecionados em **CSV (UTF-8 BOM)** e **Excel (.xlsx)**.
- Alternância entre **modo claro e modo escuro** no painel administrativo.
- Notificação opcional por e-mail para a equipe via SMTP a cada novo cadastro.

---

## 2. Instalação e Execução Local

### Pré-requisitos
- Node.js 20+ (recomendado Node 22)
- npm 10+

### Passo a passo

```bash
# 1. Instalar dependências
npm install

# 2. Copiar variáveis de ambiente
cp .env.example .env

# 3. Popular banco inicial (usuário admin + 5 cadastros fictícios)
npm run seed

# 4. Iniciar servidor de desenvolvimento (porta 3000)
npm run dev
```

Acesse:
- Formulário público: `http://localhost:3000/`
- Painel administrativo: `http://localhost:3000/admin`

### Credenciais padrão do seed (ambiente de desenvolvimento)
- **E-mail:** `admin@ameta.com.br`
- **Senha:** `Ameta@2026!`

> **Importante:** Em produção, altere `ADMIN_EMAIL`, `ADMIN_PASSWORD`, `ENCRYPTION_KEY` e `SESSION_SECRET` antes de iniciar a aplicação.

---

## 3. Variáveis de Ambiente

Consulte `.env.example`:

| Variável | Descrição |
| --- | --- |
| `PORT` | Porta HTTP do servidor (padrão `3000`). |
| `APP_URL` | URL pública onde o aplicativo está hospedado. |
| `DATABASE_PATH` | Caminho para o arquivo SQLite (ex.: `./data/ameta.db`). |
| `ENCRYPTION_KEY` | Chave secreta usada para derivar a chave AES-256-GCM dos dados sensíveis. |
| `SESSION_SECRET` | Segredo usado para hash de tokens de sessão e IPs. |
| `ADMIN_EMAIL` | E-mail do administrador criado automaticamente no primeiro boot/seed. |
| `ADMIN_PASSWORD` | Senha do administrador inicial (armazenada com Argon2id). |
| `ADMIN_NAME` | Nome exibido no painel administrativo. |
| `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, `SMTP_FROM`, `NOTIFY_EMAIL` | Configuração opcional de envio de e-mail a cada novo cadastro. |

---

## 4. Como Alterar as Listas de Funções e Estado Civil

Todas as opções das listas suspensas estão centralizadas em um único arquivo:

- Arquivo: `src/shared/formConfig.ts`
- **`ROLE_OPTIONS`**: lista de opções do campo *"Qual será a sua função na empresa"*.
- **`MARITAL_STATUS_OPTIONS`**: lista de opções do campo *"Estado Civil"*.

Ao adicionar, remover ou renomear um item nesse arquivo, tanto o formulário público, os filtros do painel quanto a validação Zod no backend passam a refletir a nova lista automaticamente.

---

## 5. Testes Automatizados

Execute os testes de validação (CPF/CNPJ), criptografia AES-256-GCM, Argon2id e middleware de autorização/rate limiting:

```bash
npm test
```

Para verificar tipos TypeScript e build de produção:

```bash
npm run lint
npm run build
```

---

## 6. Deploy

### Opção A: Docker

```bash
docker build -t ameta-prestadores .
docker run -d \
  -p 3000:3000 \
  -v ameta_data:/app/data \
  -e NODE_ENV=production \
  -e APP_URL="https://cadastros.ameta.com.br" \
  -e ENCRYPTION_KEY="sua-chave-secreta-forte" \
  -e SESSION_SECRET="seu-segredo-de-sessao-forte" \
  -e ADMIN_EMAIL="equipe@ameta.com.br" \
  -e ADMIN_PASSWORD="SuaSenhaForteAqui!" \
  --name ameta-prestadores \
  ameta-prestadores
```

### Opção B: Cloud Run / Railway / Render / VPS Node.js
1. Execute `npm install && npm run build`.
2. Configure todas as variáveis de ambiente (com destaque para `ENCRYPTION_KEY`, `SESSION_SECRET`, `ADMIN_PASSWORD` e volume persistente para `DATABASE_PATH`).
3. Inicie com `npm run start`.
