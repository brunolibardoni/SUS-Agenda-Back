# SaudeAgenda - Configuração do Banco de Dados

## Pré-requisitos

1. **SQL Server** instalado e rodando
2. **SQL Server Management Studio (SSMS)** ou **Azure Data Studio**
3. **Node.js** versão 16 ou superior

## Configuração do Banco de Dados

### 1. Configurar SQL Server

1. Abra o SQL Server Management Studio
2. Conecte-se ao seu servidor SQL Server
3. Execute o script `server/database/schema.sql` para criar:
   - Banco de dados `SaudeAgenda`
   - Todas as tabelas necessárias
   - Índices para performance
   - Dados iniciais

### 2. Configurar Variáveis de Ambiente

1. Copie o arquivo `.env.example` para `.env`
2. Configure as variáveis de conexão:

```env
DB_SERVER=localhost
DB_DATABASE=SaudeAgenda
DB_USER=sa
DB_PASSWORD=SuaSenhaAqui
DB_PORT=1433
DB_ENCRYPT=true
DB_TRUST_SERVER_CERTIFICATE=true
```

### 3. Estrutura do Banco

#### Tabelas Principais:
- **Cities**: Cidades disponíveis no sistema
- **Users**: Usuários (pacientes e admins)
- **HealthPosts**: Postos de saúde por cidade
- **Services**: Serviços disponíveis por cidade
- **ScheduleTemplates**: Modelos de horário
- **AvailableSlots**: Horários disponíveis gerados
- **Bookings**: Agendamentos realizados
- **ContactInfo**: Informações de contato por cidade
- **Notifications**: Notificações para usuários

#### Relacionamentos:
- Todas as entidades são organizadas por cidade
- Usuários podem ter múltiplos agendamentos
- Agendamentos geram notificações automáticas
- Modelos de horário geram slots disponíveis

## Como Executar

### Desenvolvimento:
```bash
npm run dev
```
Isso iniciará:
- Servidor API na porta 3001
- Frontend na porta 5173

### Apenas Servidor:
```bash
npm run server
```

### Endpoints da API:

#### Cidades:
- `GET /api/cities` - Listar cidades ativas
- `GET /api/cities/admin` - Listar todas as cidades (admin)
- `POST /api/cities` - Criar cidade
- `PUT /api/cities/:id` - Atualizar cidade
- `DELETE /api/cities/:id` - Deletar cidade

#### Postos de Saúde:
- `GET /api/cities/:cityId/health-posts` - Listar por cidade
- `POST /api/health-posts` - Criar posto
- `PUT /api/health-posts/:id` - Atualizar posto
- `DELETE /api/health-posts/:id` - Deletar posto

#### Serviços:
- `GET /api/cities/:cityId/services` - Listar por cidade
- `POST /api/services` - Criar serviço
- `PUT /api/services/:id` - Atualizar serviço
- `DELETE /api/services/:id` - Deletar serviço

#### E mais endpoints para modelos, agendamentos, contato e notificações...

## Troubleshooting

### Erro de Conexão:
1. Verifique se o SQL Server está rodando
2. Confirme as credenciais no arquivo `.env`
3. Teste a conexão com SSMS primeiro

### Erro de Permissões:
1. Certifique-se que o usuário tem permissões no banco
2. Execute como administrador se necessário

### Erro de Porta:
1. Verifique se a porta 1433 está disponível
2. Configure firewall se necessário
