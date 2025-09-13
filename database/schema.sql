USE Agendamento;
GO

-----------------------------------------------------
-- DROP TABLES (para rodar o script várias vezes)
-----------------------------------------------------
DROP TABLE IF EXISTS Notifications;
DROP TABLE IF EXISTS ContactInfo;
DROP TABLE IF EXISTS Bookings;
DROP TABLE IF EXISTS AvailableSlots;
DROP TABLE IF EXISTS ScheduleTemplates;
DROP TABLE IF EXISTS Services;
DROP TABLE IF EXISTS HealthPosts;
DROP TABLE IF EXISTS Users;
DROP TABLE IF EXISTS Cities;
DROP TABLE IF EXISTS LoginAttempts;
GO

-----------------------------------------------------
-- DROP TRIGGERS (boa prática antes de recriar)
-----------------------------------------------------
DROP TRIGGER IF EXISTS trg_DeleteCity_ScheduleTemplates;
DROP TRIGGER IF EXISTS trg_DeleteCity_AvailableSlots;
DROP TRIGGER IF EXISTS trg_DeleteCity_Bookings;
DROP TRIGGER IF EXISTS trg_DeleteUser_Notifications;
GO

-----------------------------------------------------
-- CRIAÇÃO DAS TABELAS
-----------------------------------------------------

CREATE TABLE LoginAttempts (
    Id INT IDENTITY(1,1) PRIMARY KEY,
    Email NVARCHAR(200) NOT NULL,
    IP NVARCHAR(50) NOT NULL,
    AttemptCount INT DEFAULT 1,
    BlockedUntil DATETIME2 NULL,
    LastAttempt DATETIME2 DEFAULT GETDATE()
);

-- Tabela de Cidades
CREATE TABLE Cities (
    Id UNIQUEIDENTIFIER PRIMARY KEY DEFAULT NEWID(),
    Name NVARCHAR(100) NOT NULL,
    State NVARCHAR(2) NOT NULL,
    IsActive BIT DEFAULT 1,
    CreatedAt DATETIME2 DEFAULT GETDATE(),
    UpdatedAt DATETIME2 DEFAULT GETDATE()
);

-- Tabela de Usuários
CREATE TABLE Users (
    Id UNIQUEIDENTIFIER PRIMARY KEY DEFAULT NEWID(),
    Name NVARCHAR(200) NOT NULL,
    Email NVARCHAR(200) UNIQUE NOT NULL,
    CPF NVARCHAR(14) UNIQUE NOT NULL,
    Phone NVARCHAR(20) NOT NULL,
    BirthDate DATE NOT NULL,
    Age INT NOT NULL,
    Gender NVARCHAR(20) NOT NULL CHECK (Gender IN ('masculino', 'feminino', 'outro')),
    City NVARCHAR(100) NOT NULL,
    Address NVARCHAR(500) NOT NULL,
    PasswordHash NVARCHAR(255) NOT NULL,
    Role NVARCHAR(20) DEFAULT 'patient' CHECK (Role IN ('patient', 'admin')),
    AuthProvider NVARCHAR(20) DEFAULT 'local' CHECK (AuthProvider IN ('local', 'google')),
    isDeveloper BIT NOT NULL DEFAULT 0,
    CreatedAt DATETIME2 DEFAULT GETDATE(),
    UpdatedAt DATETIME2 DEFAULT GETDATE()
);

-- Tabela de Postos de Saúde
CREATE TABLE HealthPosts (
    Id UNIQUEIDENTIFIER PRIMARY KEY DEFAULT NEWID(),
    Name NVARCHAR(200) NOT NULL,
    Address NVARCHAR(500) NOT NULL,
    Distance DECIMAL(5,2) DEFAULT 0,
    CityId UNIQUEIDENTIFIER NOT NULL,
    CreatedAt DATETIME2 DEFAULT GETDATE(),
    UpdatedAt DATETIME2 DEFAULT GETDATE(),
    FOREIGN KEY (CityId) REFERENCES Cities(Id) ON DELETE CASCADE
);

-- Tabela de Serviços
CREATE TABLE Services (
    Id UNIQUEIDENTIFIER PRIMARY KEY DEFAULT NEWID(),
    Name NVARCHAR(200) NOT NULL,
    Duration NVARCHAR(50) NOT NULL,
    Requirements NVARCHAR(1000) NOT NULL,
    CityId UNIQUEIDENTIFIER NOT NULL,
    CreatedAt DATETIME2 DEFAULT GETDATE(),
    UpdatedAt DATETIME2 DEFAULT GETDATE(),
    FOREIGN KEY (CityId) REFERENCES Cities(Id) ON DELETE CASCADE
);

-- Tabela de Modelos de Horário
CREATE TABLE ScheduleTemplates (
    Id UNIQUEIDENTIFIER PRIMARY KEY DEFAULT NEWID(),
    Name NVARCHAR(200) NOT NULL,
    HealthPostId UNIQUEIDENTIFIER NOT NULL,
    ServiceId UNIQUEIDENTIFIER NOT NULL,
    DaysOfWeek NVARCHAR(20) NOT NULL,
    TimeSlot TIME NOT NULL, -- mantido como TIME para compatibilidade com Node.js
    SlotsPerTime INT NOT NULL,
    StartDate DATE NOT NULL,
    EndDate DATE NULL,
    IsActive BIT DEFAULT 1,
    CityId UNIQUEIDENTIFIER NOT NULL,
    CreatedAt DATETIME2 DEFAULT GETDATE(),
    UpdatedAt DATETIME2 DEFAULT GETDATE(),
    FOREIGN KEY (HealthPostId) REFERENCES HealthPosts(Id) ON DELETE CASCADE,
    FOREIGN KEY (ServiceId) REFERENCES Services(Id) ON DELETE NO ACTION,
    FOREIGN KEY (CityId) REFERENCES Cities(Id) ON DELETE NO ACTION
);

-- Tabela de Horários Disponíveis
CREATE TABLE AvailableSlots (
    Id UNIQUEIDENTIFIER PRIMARY KEY DEFAULT NEWID(),
    Date DATE NOT NULL,
    Time TIME NOT NULL,
    TotalSlots INT NOT NULL,
    BookedSlots INT DEFAULT 0,
    AvailableSlots AS (TotalSlots - BookedSlots),
    HealthPostId UNIQUEIDENTIFIER NOT NULL,
    ServiceId UNIQUEIDENTIFIER NOT NULL,
    CityId UNIQUEIDENTIFIER NOT NULL,
    CreatedAt DATETIME2 DEFAULT GETDATE(),
    UpdatedAt DATETIME2 DEFAULT GETDATE(),
    FOREIGN KEY (HealthPostId) REFERENCES HealthPosts(Id) ON DELETE CASCADE,
    FOREIGN KEY (ServiceId) REFERENCES Services(Id) ON DELETE NO ACTION,
    FOREIGN KEY (CityId) REFERENCES Cities(Id) ON DELETE NO ACTION -- ajustado
);

-- Tabela de Agendamentos
CREATE TABLE Bookings (
    Id NVARCHAR(50) PRIMARY KEY,
    PatientUserId UNIQUEIDENTIFIER NOT NULL,
    HealthPostId UNIQUEIDENTIFIER NOT NULL,
    ServiceId UNIQUEIDENTIFIER NOT NULL,
    Date DATE NOT NULL,
    Time TIME NOT NULL,
    PatientCount INT DEFAULT 1,
    QRCode NVARCHAR(100) NOT NULL,
    Status NVARCHAR(20) DEFAULT 'confirmed' CHECK (Status IN ('confirmed', 'cancelled', 'completed')),
    AdminComment NVARCHAR(1000) NULL,
    CityId UNIQUEIDENTIFIER NOT NULL,
    CreatedAt DATETIME2 DEFAULT GETDATE(),
    UpdatedAt DATETIME2 DEFAULT GETDATE(),
    FOREIGN KEY (PatientUserId) REFERENCES Users(Id) ON DELETE CASCADE,
    FOREIGN KEY (HealthPostId) REFERENCES HealthPosts(Id) ON DELETE CASCADE,
    FOREIGN KEY (ServiceId) REFERENCES Services(Id) ON DELETE NO ACTION,
    FOREIGN KEY (CityId) REFERENCES Cities(Id) ON DELETE NO ACTION -- ajustado
);

-- Tabela de Informações de Contato
CREATE TABLE ContactInfo (
    Id UNIQUEIDENTIFIER PRIMARY KEY DEFAULT NEWID(),
    CentralPhone NVARCHAR(20) NOT NULL,
    CentralHours NVARCHAR(200) NOT NULL,
    GeneralHours NVARCHAR(500) NOT NULL,
    EmergencyInfo NVARCHAR(1000) NOT NULL,
    CityId UNIQUEIDENTIFIER NOT NULL,
    CreatedAt DATETIME2 DEFAULT GETDATE(),
    UpdatedAt DATETIME2 DEFAULT GETDATE(),
    FOREIGN KEY (CityId) REFERENCES Cities(Id) ON DELETE CASCADE
);

-- Tabela de Notificações
CREATE TABLE Notifications (
    Id UNIQUEIDENTIFIER PRIMARY KEY DEFAULT NEWID(),
    UserId UNIQUEIDENTIFIER NOT NULL,
    BookingId NVARCHAR(50) NULL,
    Type NVARCHAR(50) NOT NULL CHECK (Type IN ('booking_confirmed', 'booking_cancelled', 'booking_completed', 'admin_message')),
    Title NVARCHAR(200) NOT NULL,
    Message NVARCHAR(1000) NOT NULL,
    AdminComment NVARCHAR(1000) NULL,
    IsRead BIT DEFAULT 0,
    CreatedAt DATETIME2 DEFAULT GETDATE(),
    FOREIGN KEY (UserId) REFERENCES Users(Id) ON DELETE NO ACTION, -- ajustado
    FOREIGN KEY (BookingId) REFERENCES Bookings(Id) ON DELETE SET NULL
);
GO

-----------------------------------------------------
-- TRIGGERS PARA MANTER O COMPORTAMENTO DE EXCLUSÃO
-----------------------------------------------------
CREATE TRIGGER trg_DeleteCity_ScheduleTemplates
ON Cities
AFTER DELETE
AS
BEGIN
    DELETE st FROM ScheduleTemplates st INNER JOIN deleted d ON st.CityId = d.Id;
END;
GO

CREATE TRIGGER trg_DeleteCity_AvailableSlots
ON Cities
AFTER DELETE
AS
BEGIN
    DELETE av FROM AvailableSlots av INNER JOIN deleted d ON av.CityId = d.Id;
END;
GO

CREATE TRIGGER trg_DeleteCity_Bookings
ON Cities
AFTER DELETE
AS
BEGIN
    DELETE b FROM Bookings b INNER JOIN deleted d ON b.CityId = d.Id;
END;
GO

CREATE TRIGGER trg_DeleteUser_Notifications
ON Users
AFTER DELETE
AS
BEGIN
    DELETE n FROM Notifications n INNER JOIN deleted d ON n.UserId = d.Id;
END;
GO

-----------------------------------------------------
-- INSERÇÃO DE DADOS INICIAIS
-----------------------------------------------------
INSERT INTO Cities (Name, State, IsActive) VALUES 
('Capinzal', 'SC', 1),
('Joaçaba', 'SC', 1),
('Piratuba', 'SC', 1),
('Zortéa', 'SC', 1),
('Lacerdópolis', 'SC', 1),
('Ouro', 'SC', 1);

-----------------------------------------------------
-- CRIAÇÃO DE ÍNDICES
-----------------------------------------------------
CREATE INDEX IX_HealthPosts_CityId ON HealthPosts(CityId);
CREATE INDEX IX_Services_CityId ON Services(CityId);
CREATE INDEX IX_ScheduleTemplates_CityId ON ScheduleTemplates(CityId);
CREATE INDEX IX_AvailableSlots_CityId ON AvailableSlots(CityId);
CREATE INDEX IX_AvailableSlots_Date ON AvailableSlots(Date);
CREATE INDEX IX_Bookings_PatientUserId ON Bookings(PatientUserId);
CREATE INDEX IX_Bookings_CityId ON Bookings(CityId);
CREATE INDEX IX_Notifications_UserId ON Notifications(UserId);
CREATE INDEX IX_Notifications_IsRead ON Notifications(IsRead);
CREATE INDEX IX_LoginAttempts_Email ON LoginAttempts(Email);
CREATE INDEX IX_LoginAttempts_IP ON LoginAttempts(IP);
GO
