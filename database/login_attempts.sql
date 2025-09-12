-- Tabela para controle de tentativas de login
CREATE TABLE LoginAttempts (
    Id INT IDENTITY(1,1) PRIMARY KEY,
    Email NVARCHAR(200) NOT NULL,
    IP NVARCHAR(50) NOT NULL,
    AttemptCount INT DEFAULT 1,
    BlockedUntil DATETIME2 NULL,
    LastAttempt DATETIME2 DEFAULT GETDATE()
);
CREATE INDEX IX_LoginAttempts_Email ON LoginAttempts(Email);
CREATE INDEX IX_LoginAttempts_IP ON LoginAttempts(IP);
