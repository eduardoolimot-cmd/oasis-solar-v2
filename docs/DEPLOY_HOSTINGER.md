# Deploy do OASIS SOLAR na Hostinger (VPS)

Passo a passo para publicar o sistema num **VPS da Hostinger** com Ubuntu. Tudo roda num servidor só:

```
navegador ──HTTPS──> nginx ──┬── /        → arquivos do front-end (apps/web/dist)
                             └── /api/... → API Node.js (porta 3333, só acessível de dentro do servidor)
                                              └── banco SQLite (apps/api/prisma/dev.db) + fotos (apps/api/uploads)
```

> **Por que VPS e não hospedagem compartilhada?** A API precisa ficar rodando o tempo todo (processo Node.js
> permanente) e gravar em disco (banco SQLite e fotos enviadas). Planos de hospedagem compartilhada/WordPress
> não servem para isso. Um VPS KVM 1 ou KVM 2 da Hostinger é suficiente para o porte atual (14 usinas).

> **Banco: SQLite em produção (recomendado agora).** O código tem comentários prevendo PostgreSQL em
> produção, mas manter o SQLite tem duas vantagens hoje: (1) você sobe o banco atual com **todos os dados
> já lançados** simplesmente copiando o arquivo `dev.db`; (2) o **Backup completo** da tela Administração só
> funciona com SQLite. Para o volume atual (poucas usinas e usuários) o SQLite atende bem. Migrar para
> PostgreSQL fica como evolução futura (exige migrar os dados e adaptar o backup).

---

## Parte 1 — Subir o código para o GitHub (no seu computador)

O repositório local já está pronto, com o primeiro commit feito. Falta criar o repositório no GitHub e enviar.

1. Entre em <https://github.com/new> e crie um repositório:
   - **Nome:** `oasis-solar` (ou o que preferir)
   - **Visibilidade:** **Private** (recomendado — o código é do seu negócio)
   - **Não** marque "Add a README", ".gitignore" nem "license" (o projeto já tem os arquivos).
2. No terminal, dentro da pasta do projeto (`C:\Users\Eduardo Motta\oasis solar v2`), rode — trocando
   `SEU-USUARIO` pelo seu usuário do GitHub:

   ```bash
   git remote add origin https://github.com/SEU-USUARIO/oasis-solar.git
   git push -u origin main
   ```

   Na primeira vez, o Windows abre uma janela do navegador para você fazer login no GitHub (Git Credential
   Manager). É só autorizar.

**O que NÃO vai para o GitHub (de propósito, pelo `.gitignore`):** o banco de dados (`dev.db`, com os dados
reais das usinas), o arquivo `.env` (segredos), as fotos enviadas (`apps/api/uploads/`) e o `node_modules`.
O banco e as fotos são enviados direto para o servidor na Parte 4.

---

## Parte 2 — Preparar o VPS (uma vez só)

1. No painel da Hostinger (hPanel) → **VPS** → crie/reinstale o sistema com **Ubuntu 24.04**. Anote o **IP**
   do servidor e defina a senha de root.
2. No **domínio** (hPanel → Domínios → DNS), crie um registro **A** apontando para o IP do VPS, por exemplo
   `painel.seudominio.com.br` → `IP-DO-VPS`. (A propagação pode levar alguns minutos.)
3. Conecte no servidor (no Windows, pelo PowerShell ou pelo terminal do próprio hPanel):

   ```bash
   ssh root@IP-DO-VPS
   ```

4. Instale Node.js 22, nginx, git e o PM2 (que mantém a API rodando e religa sozinha se o servidor reiniciar):

   ```bash
   apt update && apt upgrade -y
   curl -fsSL https://deb.nodesource.com/setup_22.x | bash -
   apt install -y nodejs nginx git sqlite3
   npm install -g pm2
   ```

5. Firewall — libere só SSH e web (a porta 3333 da API fica fechada para fora; só o nginx fala com ela):

   ```bash
   ufw allow OpenSSH
   ufw allow 'Nginx Full'
   ufw enable
   ```

---

## Parte 3 — Baixar o código e compilar (no servidor)

1. Clone o repositório. Como ele é **privado**, o servidor precisa de permissão para ler: crie um
   *Personal Access Token* no GitHub (Settings → Developer settings → Fine-grained tokens → acesso de
   **leitura** só a esse repositório) e use-o como senha quando o `git clone` pedir.

   ```bash
   mkdir -p /var/www && cd /var/www
   git clone https://github.com/SEU-USUARIO/oasis-solar.git
   cd oasis-solar
   ```

2. Instale as dependências e compile a API e o front:

   ```bash
   npm ci
   npm run prisma:generate
   npm run build:api
   npm run build:web
   ```

3. Crie o arquivo de configuração da API (`apps/api/.env`):

   ```bash
   nano apps/api/.env
   ```

   Conteúdo (troque o domínio; gere o `JWT_SECRET` com o comando abaixo):

   ```
   DATABASE_URL="file:./dev.db"
   JWT_SECRET="COLE-AQUI-UM-VALOR-LONGO-E-ALEATORIO"
   JWT_EXPIRES_IN="8h"
   PORT=3333
   CORS_ORIGIN="https://painel.seudominio.com.br"
   ```

   Para gerar um `JWT_SECRET` forte:

   ```bash
   node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"
   ```

   Salve (`Ctrl+O`, Enter) e saia (`Ctrl+X`). **Nunca** use no servidor o mesmo `JWT_SECRET` do seu
   computador.

---

## Parte 4 — Enviar o banco de dados e as fotos (do seu computador para o servidor)

O banco com todos os dados está em `apps\api\prisma\dev.db` no seu computador, e as fotos em
`apps\api\uploads\`.

1. **Pare a API local** antes de copiar (para o arquivo do banco não estar em uso).
2. No PowerShell do **seu computador**, dentro da pasta do projeto:

   ```powershell
   scp "apps\api\prisma\dev.db" root@IP-DO-VPS:/var/www/oasis-solar/apps/api/prisma/dev.db
   scp -r "apps\api\uploads" root@IP-DO-VPS:/var/www/oasis-solar/apps/api/
   ```

   (Alternativa sem linha de comando: o programa **WinSCP** ou **FileZilla**, modo SFTP, com o IP, usuário
   `root` e a senha do VPS.)

> Começando com um banco **vazio** em vez de copiar o seu: no servidor, rode
> `cd apps/api && npx prisma db push && SEED_ADMIN_SENHA="uma-senha-forte" npm run seed`.

---

## Parte 5 — Ligar a API com o PM2 (no servidor)

```bash
cd /var/www/oasis-solar/apps/api
pm2 start dist/index.js --name oasis-api
pm2 save
pm2 startup     # rode o comando que ele imprimir, para a API subir sozinha após reiniciar o VPS
```

Teste: `curl -i http://localhost:3333/api/usinas` deve responder `401` (é o esperado sem login — mostra que
a API está no ar).

Comandos úteis: `pm2 status`, `pm2 logs oasis-api`, `pm2 restart oasis-api`.

---

## Parte 6 — Configurar o nginx (no servidor)

```bash
nano /etc/nginx/sites-available/oasis-solar
```

Cole (trocando o domínio):

```nginx
server {
    listen 80;
    server_name painel.seudominio.com.br;

    # Front-end (arquivos gerados pelo build do Vite)
    root /var/www/oasis-solar/apps/web/dist;
    index index.html;

    # Uploads de fotos/imagens até 10 MB (limite da própria aplicação)
    client_max_body_size 12m;

    # API
    location /api/ {
        proxy_pass http://127.0.0.1:3333;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_read_timeout 300s;   # backup completo e relatórios podem demorar
    }

    # Rotas do React (ex.: /painel, /lancamentos) sempre caem no index.html
    location / {
        try_files $uri $uri/ /index.html;
    }
}
```

Ative e recarregue:

```bash
ln -s /etc/nginx/sites-available/oasis-solar /etc/nginx/sites-enabled/
rm -f /etc/nginx/sites-enabled/default
nginx -t && systemctl reload nginx
```

---

## Parte 7 — HTTPS (cadeado) gratuito

```bash
apt install -y certbot python3-certbot-nginx
certbot --nginx -d painel.seudominio.com.br
```

Aceite o redirecionamento automático para HTTPS. O certificado renova sozinho.

Pronto: acesse `https://painel.seudominio.com.br`.

---

## Parte 8 — Primeiros cuidados depois do deploy

1. **Troque a senha do administrador imediatamente.** Se você copiou o banco local, o usuário
   `admin@oasissolar.local` ainda pode estar com a senha padrão `OasisSolar@2026` — que está escrita no
   README e no código-fonte (repositório). Troque em **Usuários e Acessos**.
2. Faça um **Backup completo** (tela Administração) e guarde o `.zip` fora do servidor. Repita com
   frequência (ex.: semanal). Opcional: ative os snapshots/backups automáticos do VPS no hPanel.

---

## Backup pela linha de comando (no servidor)

Gera um arquivo `.tar.gz` com o banco e as fotos — o mesmo conteúdo do "Backup completo" da tela
Administração. O banco é copiado com o comando `.backup` do SQLite, que tira uma cópia consistente mesmo
com a API rodando (copiar o `dev.db` direto, com `cp`, pode pegar o arquivo no meio de uma gravação).

```bash
cd /var/www/oasis-solar/apps/api && D=$(date +%F_%H%M) && mkdir -p /root/backups && sqlite3 prisma/dev.db ".backup /root/backups/banco-$D.db" && tar -czf /root/backups/oasis-backup-$D.tar.gz -C /root/backups banco-$D.db -C /var/www/oasis-solar/apps/api uploads && rm /root/backups/banco-$D.db && ls -lh /root/backups/oasis-backup-$D.tar.gz
```

Baixar para o seu computador (no PowerShell do Windows; troque o nome pelo que o comando acima mostrou):

```powershell
scp root@IP-DO-VPS:/root/backups/oasis-backup-2026-09-23_1430.tar.gz "$HOME\Downloads\"
```

**Backup automático diário** (todo dia às 3h, apagando os com mais de 30 dias): rode `crontab -e` e
acrescente a linha abaixo (tudo numa linha só; os `%` precisam da barra `\` no cron):

```
0 3 * * * cd /var/www/oasis-solar/apps/api && D=$(date +\%F_\%H\%M) && mkdir -p /root/backups && sqlite3 prisma/dev.db ".backup /root/backups/banco-$D.db" && tar -czf /root/backups/oasis-backup-$D.tar.gz -C /root/backups banco-$D.db -C /var/www/oasis-solar/apps/api uploads && rm /root/backups/banco-$D.db && find /root/backups -name 'oasis-backup-*.tar.gz' -mtime +30 -delete
```

Os backups automáticos ficam no próprio servidor — baixe um de vez em quando para fora dele (se o VPS
tiver um problema, os backups dali vão junto).

**Restaurar** um backup:

```bash
mkdir -p /tmp/restaura && tar -xzf /root/backups/oasis-backup-XXXX.tar.gz -C /tmp/restaura
pm2 stop oasis-api
cp /var/www/oasis-solar/apps/api/prisma/dev.db /root/backups/antes-de-restaurar.db
cp /tmp/restaura/banco-*.db /var/www/oasis-solar/apps/api/prisma/dev.db
cp -r /tmp/restaura/uploads/. /var/www/oasis-solar/apps/api/uploads/
pm2 start oasis-api
```

---

## Atualizar o sistema depois (novas versões)

No seu computador: faça commit e `git push`. No servidor:

```bash
cd /var/www/oasis-solar
cp apps/api/prisma/dev.db ~/backup-antes-de-atualizar-$(date +%F).db   # backup do banco
git pull
npm ci
npm run prisma:generate
npm run build:api
npm run build:web
cd apps/api && npx prisma db push      # só se o schema.prisma mudou
pm2 restart oasis-api
```

> O `prisma db push` aplica mudanças de estrutura do banco. Se ele avisar que vai **apagar dados**
> ("data loss"), **não confirme** — pare e verifique a mudança antes.

Para mudar a versão exibida no rodapé, altere o campo `"version"` do `package.json` da raiz antes do build.
