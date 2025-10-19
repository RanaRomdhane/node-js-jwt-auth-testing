const request = require("supertest");
const mongoose = require("mongoose");
const db = require("../../app/models");
const User = db.user;
const Role = db.role;

// Utiliser la même base de test que les autres tests
const TEST_DB_URI = "mongodb://127.0.0.1:27017/test_db_e2e";

// Augmenter le timeout global
jest.setTimeout(30000);

let app;

beforeAll(async () => {
  // Vérifier si MongoDB est accessible
  try {
    // Fermer toutes les connexions existantes
    if (mongoose.connection.readyState !== 0) {
      await mongoose.disconnect();
    }
    
    console.log("🔄 Connexion à MongoDB pour les tests E2E...");
    
    // Connexion à la base de test avec IPv4 explicite
    await mongoose.connect(TEST_DB_URI, {
      useNewUrlParser: true,
      useUnifiedTopology: true,
      serverSelectionTimeoutMS: 10000,
      socketTimeoutMS: 45000,
    });
    
    console.log("✅ Connected to MongoDB for E2E testing");
    
    // Initialiser les rôles si nécessaire
    const roleCount = await Role.estimatedDocumentCount();
    if (roleCount === 0) {
      await new Role({ name: "user" }).save();
      await new Role({ name: "moderator" }).save();
      await new Role({ name: "admin" }).save();
      console.log("✅ Rôles initialisés");
    }

    // Créer l'application Express pour les tests
    const express = require("express");
    const cors = require("cors");
    
    app = express();

    var corsOptions = {
      origin: "http://localhost:8081"
    };

    app.use(cors(corsOptions));
    app.use(express.json());
    app.use(express.urlencoded({ extended: true }));

    // simple route
    app.get("/", (req, res) => {
      res.json({ message: "Welcome to bezkoder application." });
    });

    // routes
    require("../../app/routes/auth.routes")(app);
    require("../../app/routes/user.routes")(app);

  } catch (error) {
    console.log("❌ Erreur de connexion MongoDB:", error.message);
    throw error;
  }
}, 30000);

beforeEach(async () => {
  // Nettoyer les utilisateurs avant chaque test
  if (mongoose.connection.readyState === 1) {
    await User.deleteMany({});
  }
});

afterAll(async () => {
  // Nettoyer complètement la base de test
  if (mongoose.connection.readyState === 1) {
    await User.deleteMany({});
    await Role.deleteMany({});
    await mongoose.connection.dropDatabase();
    await mongoose.connection.close();
    console.log("✅ MongoDB connection closed for E2E tests");
  }
}, 30000);

// Vérifier la connexion avant chaque suite de tests
const checkMongoConnection = () => {
  if (mongoose.connection.readyState !== 1) {
    throw new Error("MongoDB non connecté pour les tests E2E");
  }
  console.log("✅ MongoDB est connecté pour E2E");
};

describe("ST-01 : Flux Utilisateur Complet", () => {
  beforeAll(() => {
    checkMongoConnection();
  });

  test("Scénario complet : Inscription → Login → Accès Ressource", async () => {
    // Étape 1 : Inscription
    const signupResponse = await request(app)
      .post("/api/auth/signup")
      .send({
        username: "e2euser",
        email: "e2e@example.com",
        password: "password123"
      });
    
    expect(signupResponse.statusCode).toBe(200);
    expect(signupResponse.body.message).toBe("User was registered successfully!");
    console.log("✅ Inscription réussie");
    
    // Étape 2 : Login
    const signinResponse = await request(app)
      .post("/api/auth/signin")
      .send({
        username: "e2euser",
        password: "password123"
      });
    
    expect(signinResponse.statusCode).toBe(200);
    expect(signinResponse.body.accessToken).toBeDefined();
    const token = signinResponse.body.accessToken;
    console.log("✅ Login réussi, token obtenu");
    
    // Étape 3 : Accès à une ressource protégée
    const userContentResponse = await request(app)
      .get("/api/test/user")
      .set("x-access-token", token);
    
    expect(userContentResponse.statusCode).toBe(200);
    expect(userContentResponse.body).toBeDefined();
    // Vérifier que la réponse contient du contenu utilisateur
    if (userContentResponse.body.message) {
      expect(userContentResponse.body.message).toContain("User Content");
    }
    console.log("✅ Accès à la ressource autorisé");
    
    // Étape 4 : Vérifier que l'utilisateur est bien en base
    const userInDb = await User.findOne({ username: "e2euser" });
    expect(userInDb).toBeDefined();
    expect(userInDb.email).toBe("e2e@example.com");
    console.log("✅ Utilisateur vérifié en base de données");
  }, 15000);
});

describe("ST-02 : Tentative Accès Non Autorisé", () => {
  beforeAll(() => {
    checkMongoConnection();
  });

  test("Utilisateur sans token ne peut pas accéder", async () => {
    const response = await request(app)
      .get("/api/test/user");
    
    expect(response.statusCode).toBe(403);
    expect(response.body.message).toBe("No token provided!");
    console.log("✅ Accès refusé sans token");
  }, 10000);

  test("Utilisateur avec token invalide ne peut pas accéder", async () => {
    const response = await request(app)
      .get("/api/test/user")
      .set("x-access-token", "token.invalide.123");
    
    expect(response.statusCode).toBe(401);
    console.log("✅ Accès refusé avec token invalide");
  }, 10000);
});

describe("ST-03 : Gestion des Erreurs", () => {
  beforeAll(() => {
    checkMongoConnection();
  });

  test("Inscription avec email déjà existant échoue", async () => {
    // Premier utilisateur
    await request(app)
      .post("/api/auth/signup")
      .send({
        username: "user1",
        email: "duplicate@example.com",
        password: "password123"
      });
    
    // Deuxième utilisateur avec le même email
    const response = await request(app)
      .post("/api/auth/signup")
      .send({
        username: "user2",
        email: "duplicate@example.com",
        password: "password123"
      });
    
    expect(response.statusCode).toBe(400);
    expect(response.body.message).toContain("Failed");
    console.log("✅ Inscription dupliquée correctement rejetée");
  }, 10000);

  test("Login avec mauvais mot de passe échoue", async () => {
    // Créer un utilisateur
    await request(app)
      .post("/api/auth/signup")
      .send({
        username: "testlogin",
        email: "testlogin@example.com",
        password: "password123"
      });
    
    // Tenter de se connecter avec mauvais mot de passe
    const response = await request(app)
      .post("/api/auth/signin")
      .send({
        username: "testlogin",
        password: "mauvaispassword"
      });
    
    expect(response.statusCode).toBe(401);
    expect(response.body.message).toBe("Invalid Password!");
    console.log("✅ Login avec mauvais mot de passe correctement rejeté");
  }, 10000);
});