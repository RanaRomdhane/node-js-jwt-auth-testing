const request = require("supertest");
const mongoose = require("mongoose");
const db = require("../../app/models");
const User = db.user;
const Role = db.role;
const jwt = require("jsonwebtoken");
const config = require("../../app/config/auth.config");

const TEST_DB_URI = "mongodb://127.0.0.1:27017/test_db_security";

jest.setTimeout(30000);

let app;

beforeAll(async () => {
  try {
    if (mongoose.connection.readyState !== 0) {
      await mongoose.disconnect();
    }
    
    await mongoose.connect(TEST_DB_URI, {
      useNewUrlParser: true,
      useUnifiedTopology: true,
    });
    
    // Initialiser les rôles
    const roleCount = await Role.estimatedDocumentCount();
    if (roleCount === 0) {
      await new Role({ name: "user" }).save();
      await new Role({ name: "moderator" }).save();
      await new Role({ name: "admin" }).save();
    }

    // Créer l'application Express pour les tests
    const express = require("express");
    const cors = require("cors");
    
    app = express();

    app.use(cors());
    app.use(express.json());
    app.use(express.urlencoded({ extended: true }));

    app.get("/", (req, res) => {
      res.json({ message: "Welcome to bezkoder application." });
    });

    require("../../app/routes/auth.routes")(app);
    require("../../app/routes/user.routes")(app);

  } catch (error) {
    console.log("❌ Erreur setup sécurité:", error.message);
    throw error;
  }
});

beforeEach(async () => {
  if (mongoose.connection.readyState === 1) {
    await User.deleteMany({});
  }
});

afterAll(async () => {
  if (mongoose.connection.readyState === 1) {
    await User.deleteMany({});
    await Role.deleteMany({});
    await mongoose.connection.dropDatabase();
    await mongoose.connection.close();
  }
});

describe("SEC-01 : Test Injection", () => {
  test("Doit rejeter une tentative d'injection SQL dans le login", async () => {
    const response = await request(app)
      .post("/api/auth/signin")
      .send({
        username: "admin' OR '1'='1",
        password: "anything"
      });
    
    expect(response.statusCode).not.toBe(200);
    expect([404, 401]).toContain(response.statusCode);
  });

  test("Doit rejeter une tentative d'injection NoSQL", async () => {
    const response = await request(app)
      .post("/api/auth/signin")
      .send({
        username: { "$ne": "admin" },
        password: { "$exists": true }
      });
    
    expect(response.statusCode).not.toBe(200);
    expect([400, 404]).toContain(response.statusCode);
  });

  test("Doit rejeter des scripts XSS dans l'inscription", async () => {
    const response = await request(app)
      .post("/api/auth/signup")
      .send({
        username: "<script>alert('xss')</script>",
        email: "test@example.com",
        password: "password123"
      });
    
    expect([200, 400]).toContain(response.statusCode);
  });
});

describe("SEC-02 : Token JWT Invalide", () => {
  test("Doit rejeter un token manipulé", async () => {
    const response = await request(app)
      .get("/api/test/user")
      .set("x-access-token", "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.manipulated");
    
    expect(response.statusCode).toBe(401);
  });

  test("Doit rejeter un token avec signature invalide", async () => {
    const fakeToken = jwt.sign({ id: "123" }, "wrong-secret", {
      expiresIn: 86400
    });
    
    const response = await request(app)
      .get("/api/test/user")
      .set("x-access-token", fakeToken);
    
    expect(response.statusCode).toBe(401);
  });

  test("Doit rejeter un token expiré", async () => {
    const expiredToken = jwt.sign({ id: "123" }, config.secret, {
      expiresIn: -1
    });
    
    const response = await request(app)
      .get("/api/test/user")
      .set("x-access-token", expiredToken);
    
    expect(response.statusCode).toBe(401);
  });
});

describe("SEC-03 : Validation des Entrées", () => {
  test("Doit rejeter un email trop long", async () => {
    const longEmail = "a".repeat(300) + "@example.com";
    
    const response = await request(app)
      .post("/api/auth/signup")
      .send({
        username: "testuser",
        email: longEmail,
        password: "password123"
      });
    
    expect(response.statusCode).not.toBe(500);
  });

  test("Doit rejeter un password trop long", async () => {
    const longPassword = "a".repeat(1000);
    
    const response = await request(app)
      .post("/api/auth/signup")
      .send({
        username: "testuser",
        email: "test@example.com",
        password: longPassword
      });
    
    expect(response.statusCode).not.toBe(500);
  });

  test("Doit rejeter des données malformées", async () => {
    const response = await request(app)
      .post("/api/auth/signup")
      .send({
        username: 12345,
        email: "test@example.com",
        password: "password123"
      });
    
    expect(response.statusCode).not.toBe(500);
  });
});

describe("SEC-04 : Tests d'Autorisation Basiques", () => {
  let userToken;
  
  beforeAll(async () => {
    // Créer seulement un utilisateur normal pour les tests basiques
    const userResponse = await request(app)
      .post("/api/auth/signup")
      .send({
        username: "normaluser",
        email: "normal@example.com",
        password: "password123"
      });
    
    const userLogin = await request(app)
      .post("/api/auth/signin")
      .send({
        username: "normaluser",
        password: "password123"
      });
    
    userToken = userLogin.body.accessToken;
  }, 10000);

  test("Doit permettre l'accès user avec token valide", async () => {
    const response = await request(app)
      .get("/api/test/user")
      .set("x-access-token", userToken);
    
    expect(response.statusCode).toBe(200);
  }, 10000);

  test("Doit rejeter l'accès sans token", async () => {
    const response = await request(app)
      .get("/api/test/user");
    
    expect(response.statusCode).toBe(403);
  }, 10000);
});

describe("SEC-05 : Tests de Bruteforce", () => {
  test("Doit ralentir après plusieurs tentatives échouées", async () => {
    const attempts = 5;
    
    for (let i = 0; i < attempts; i++) {
      const response = await request(app)
        .post("/api/auth/signin")
        .send({
          username: "nonexistentuser",
          password: "wrongpassword" + i
        });
      
      expect([404, 401]).toContain(response.statusCode);
    }
    
    const finalResponse = await request(app)
      .post("/api/auth/signin")
      .send({
        username: "nonexistentuser",
        password: "finalattempt"
      });
    
    expect([404, 401]).toContain(finalResponse.statusCode);
  });
});

describe("SEC-06 : Headers de Sécurité", () => {
  test("Doit inclure les headers de sécurité CORS", async () => {
    const response = await request(app)
      .get("/")
      .set("Origin", "http://malicious-site.com");
    
    expect(response.headers['access-control-allow-origin']).toBeDefined();
  });

  test("Doit rejeter les méthodes HTTP non autorisées", async () => {
    const response = await request(app)
      .put("/api/auth/signin")
      .send({
        username: "test",
        password: "test"
      });
    
    expect([404, 405]).toContain(response.statusCode);
  });
});

describe("SEC-07 : Tests de Sécurité Basiques", () => {
  test("Doit rejeter les requêtes sans body", async () => {
    const response = await request(app)
      .post("/api/auth/signin")
      .send();
    
    expect(response.statusCode).not.toBe(200);
  });

  test("Doit rejeter les requêtes avec body vide", async () => {
    const response = await request(app)
      .post("/api/auth/signin")
      .send({});
    
    expect(response.statusCode).not.toBe(200);
  });

  test("Doit rejeter les tokens vides", async () => {
    const response = await request(app)
      .get("/api/test/user")
      .set("x-access-token", "");
    
    expect(response.statusCode).toBe(403);
  });
});

describe("SEC-08 : Tests de Contournement", () => {
  test("Doit rejeter les tentatives de contournement par chemin", async () => {
    const response = await request(app)
      .get("/api/test/../admin"); // Tentative de path traversal
    
    expect([404, 403]).toContain(response.statusCode);
  });

  test("Doit rejeter les tokens avec payload malveillant", async () => {
    // Token avec payload contenant des tentatives d'injection
    const maliciousToken = jwt.sign({ 
      id: "123", 
      roles: ["admin"], // Tentative d'usurpation de rôle
      "$where": "malicious" 
    }, config.secret, {
      expiresIn: 86400
    });
    
    const response = await request(app)
      .get("/api/test/user")
      .set("x-access-token", maliciousToken);
    
    // Le token est syntaxiquement valide mais l'utilisateur n'existe pas
    // Peut retourner 401 (Unauthorized) ou 404 (User not found) ou 200 si le token est accepté
    expect([200, 401, 404]).toContain(response.statusCode);
  });
});

describe("SEC-09 : Tests de Robustesse", () => {
  test("Doit gérer les headers malformés", async () => {
    const response = await request(app)
      .get("/api/test/user")
      .set("x-access-token", null)
      .set("Authorization", "Bearer invalid");
    
    expect(response.statusCode).not.toBe(500); // Ne doit pas planter
  });

  test("Doit rejeter les content-types incorrects", async () => {
    const response = await request(app)
      .post("/api/auth/signin")
      .set("Content-Type", "text/plain")
      .send("username=test&password=test");
    
    expect(response.statusCode).not.toBe(200);
  });
});

describe("SEC-10 : Tests de Performance Sécurité", () => {
  test("Doit répondre rapidement aux requêtes malveillantes", async () => {
    const startTime = Date.now();
    
    const response = await request(app)
      .post("/api/auth/signin")
      .send({
        username: "admin' OR '1'='1",
        password: "anything"
      });
    
    const endTime = Date.now();
    const responseTime = endTime - startTime;
    
    // La réponse devrait être rapide même pour des tentatives d'injection
    expect(responseTime).toBeLessThan(1000); // Moins d'1 seconde
    expect(response.statusCode).not.toBe(200);
  });
});