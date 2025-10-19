const request = require('supertest');
const mongoose = require('mongoose');
const db = require('../../app/models');
const User = db.user;
const Role = db.role;

const TEST_DB_URI = "mongodb://127.0.0.1:27017/test_db_performance";

jest.setTimeout(60000); // Timeout de 60s pour les tests de performance

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

    // Créer l'application Express
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

    // Créer un utilisateur de test pour les performances
    await request(app)
      .post("/api/auth/signup")
      .send({
        username: "perfuser",
        email: "perf@example.com",
        password: "password123"
      });

  } catch (error) {
    console.log("❌ Erreur setup performance:", error.message);
    throw error;
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

describe("PT-01 : Test de Performance - Requêtes Simultanées", () => {
  test("Doit gérer 50 requêtes de login en moins de 5 secondes", async () => {
    const numRequests = 50;
    const startTime = Date.now();
    
    const requests = Array.from({ length: numRequests }, () => 
      request(app)
        .post("/api/auth/signin")
        .send({
          username: "perfuser",
          password: "password123"
        })
    );
    
    const responses = await Promise.all(requests);
    const endTime = Date.now();
    const totalTime = endTime - startTime;
    
    console.log(`⏱️  ${numRequests} requêtes en ${totalTime}ms`);
    console.log(`📊 Temps moyen par requête: ${(totalTime / numRequests).toFixed(2)}ms`);
    
    // Vérifier que toutes les réponses sont réussies
    const successfulResponses = responses.filter(response => 
      response.statusCode === 200
    );
    
    expect(successfulResponses.length).toBe(numRequests);
    expect(totalTime).toBeLessThan(5000); // Moins de 5 secondes
    
    // Vérifier que chaque réponse a un token
    responses.forEach(response => {
      expect(response.body.accessToken).toBeDefined();
    });
  }, 30000);
});

describe("PT-02 : Test de Performance - Inscription", () => {
  test("Doit gérer 20 inscriptions rapides", async () => {
    const numUsers = 20;
    const startTime = Date.now();
    
    const requests = Array.from({ length: numUsers }, (_, index) => 
      request(app)
        .post("/api/auth/signup")
        .send({
          username: `loaduser${index}`,
          email: `loaduser${index}@example.com`,
          password: "password123"
        })
    );
    
    const responses = await Promise.all(requests);
    const endTime = Date.now();
    const totalTime = endTime - startTime;
    
    console.log(`⏱️  ${numUsers} inscriptions en ${totalTime}ms`);
    console.log(`📊 Temps moyen: ${(totalTime / numUsers).toFixed(2)}ms`);
    
    // Au moins 90% des inscriptions doivent réussir
    const successfulRegistrations = responses.filter(response => 
      response.statusCode === 200
    );
    
    expect(successfulRegistrations.length).toBeGreaterThanOrEqual(numUsers * 0.9);
    expect(totalTime).toBeLessThan(10000); // Moins de 10 secondes
  }, 30000);
});

describe("PT-03 : Test de Performance - Accès Protégé", () => {
  let authToken;
  
  beforeAll(async () => {
    // Obtenir un token pour les tests
    const loginResponse = await request(app)
      .post("/api/auth/signin")
      .send({
        username: "perfuser",
        password: "password123"
      });
    
    authToken = loginResponse.body.accessToken;
  });

  test("Doit gérer 100 requêtes d'accès protégé rapidement", async () => {
    const numRequests = 100;
    const startTime = Date.now();
    
    const requests = Array.from({ length: numRequests }, () => 
      request(app)
        .get("/api/test/user")
        .set("x-access-token", authToken)
    );
    
    const responses = await Promise.all(requests);
    const endTime = Date.now();
    const totalTime = endTime - startTime;
    
    console.log(`⏱️  ${numRequests} requêtes protégées en ${totalTime}ms`);
    console.log(`📊 Temps moyen: ${(totalTime / numRequests).toFixed(2)}ms`);
    
    // Toutes les requêtes doivent réussir
    const successfulResponses = responses.filter(response => 
      response.statusCode === 200
    );
    
    expect(successfulResponses.length).toBe(numRequests);
    expect(totalTime).toBeLessThan(3000); // Moins de 3 secondes
  }, 30000);
});

describe("PT-04 : Test de Charge - Mémoire et CPU", () => {
  test("Ne pas planter sous charge élevée", async () => {
    const phases = [10, 25, 50]; // Nombre croissant de requêtes simultanées
    
    for (const concurrency of phases) {
      const startTime = Date.now();
      
      const requests = Array.from({ length: concurrency }, (_, index) => 
        request(app)
          .post("/api/auth/signin")
          .send({
            username: "perfuser",
            password: "password123"
          })
      );
      
      const responses = await Promise.all(requests);
      const endTime = Date.now();
      const totalTime = endTime - startTime;
      
      const successfulResponses = responses.filter(response => 
        response.statusCode === 200
      );
      
      console.log(`⚡ ${concurrency} requêtes simultanées: ${successfulResponses.length}/${concurrency} réussies en ${totalTime}ms`);
      
      // Au moins 80% doivent réussir même sous charge
      expect(successfulResponses.length).toBeGreaterThanOrEqual(concurrency * 0.8);
      expect(totalTime).toBeLessThan(concurrency * 100); // Temps raisonnable
    }
  }, 45000);
});