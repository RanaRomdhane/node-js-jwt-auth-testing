const request = require("supertest");
const mongoose = require("mongoose");
const db = require("../../app/models");
const User = db.user;
const Role = db.role;

// Forcer l'utilisation d'IPv4 explicitement
const TEST_DB_URI = "mongodb://127.0.0.1:27017/test_db_jest_integration";

// Augmenter le timeout global
jest.setTimeout(30000);

// Créer une instance d'application Express pour les tests
let app;

beforeAll(async () => {
  // Vérifier si MongoDB est accessible
  try {
    // Fermer toutes les connexions existantes
    if (mongoose.connection.readyState !== 0) {
      await mongoose.disconnect();
    }
    
    console.log("🔄 Tentative de connexion à MongoDB...");
    
    // Connexion à la base de test avec IPv4 explicite
    await mongoose.connect(TEST_DB_URI, {
      useNewUrlParser: true,
      useUnifiedTopology: true,
      serverSelectionTimeoutMS: 10000,
      socketTimeoutMS: 45000,
    });
    
    console.log("✅ Connected to MongoDB for testing");
    
    // Initialiser les rôles
    const roleCount = await Role.estimatedDocumentCount();
    if (roleCount === 0) {
      await new Role({ name: "user" }).save();
      console.log("✅ added 'user' to roles collection");
      await new Role({ name: "moderator" }).save();
      console.log("✅ added 'moderator' to roles collection");
      await new Role({ name: "admin" }).save();
      console.log("✅ added 'admin' to roles collection");
    }

    // Maintenant importer et configurer l'app Express
    const express = require("express");
    const cors = require("cors");
    
    app = express();

    var corsOptions = {
      origin: "http://localhost:8081"
    };

    app.use(cors(corsOptions));

    // parse requests of content-type - application/json
    app.use(express.json());

    // parse requests of content-type - application/x-www-form-urlencoded
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
    console.log("💡 Assurez-vous que MongoDB est démarré avec: mongod --dbpath C:\\data\\db");
    throw error;
  }
}, 30000);

beforeEach(async () => {
  // Nettoyer seulement si connecté
  if (mongoose.connection.readyState === 1) {
    await User.deleteMany({});
  }
});

afterAll(async () => {
  // Nettoyer seulement si connecté
  if (mongoose.connection.readyState === 1) {
    await User.deleteMany({});
    await Role.deleteMany({});
    await mongoose.connection.dropDatabase();
    await mongoose.connection.close();
    console.log("✅ MongoDB connection closed");
  }
}, 30000);

// Vérifier la connexion avant chaque suite de tests
const checkMongoConnection = () => {
  if (mongoose.connection.readyState !== 1) {
    console.log("❌ MongoDB non connecté. État de la connexion:", mongoose.connection.readyState);
    throw new Error("MongoDB non connecté. Démarrez MongoDB avec: mongod --dbpath C:\\data\\db");
  }
  console.log("✅ MongoDB est connecté");
};

describe("IT-01 : Test d'Intégration - Inscription", () => {
  beforeAll(() => {
    checkMongoConnection();
  });

  test("Doit créer un nouvel utilisateur dans la DB", async () => {
    const response = await request(app)
      .post("/api/auth/signup")
      .send({
        username: "testuser",
        email: "test@example.com",
        password: "password123",
        roles: ["user"]
      });
    
    expect(response.statusCode).toBe(200);
    expect(response.body.message).toBe("User was registered successfully!");
    
    // Vérifier dans la DB
    const user = await User.findOne({ username: "testuser" });
    expect(user).toBeDefined();
    expect(user.email).toBe("test@example.com");
    expect(user.username).toBe("testuser");
  }, 10000);
  
  test("Doit rejeter un utilisateur déjà existant", async () => {
    // Créer d'abord l'utilisateur
    await request(app)
      .post("/api/auth/signup")
      .send({
        username: "duplicate",
        email: "duplicate@example.com",
        password: "password123"
      });
    
    // Tenter de créer à nouveau
    const response = await request(app)
      .post("/api/auth/signup")
      .send({
        username: "duplicate",
        email: "duplicate@example.com",
        password: "password123"
      });
    
    expect(response.statusCode).toBe(400);
    expect(response.body.message).toContain("Failed");
  }, 10000);
});

describe("IT-02 : Test d'Intégration - Login + JWT", () => {
  beforeAll(() => {
    checkMongoConnection();
  });

  beforeEach(async () => {
    // Créer un utilisateur de test
    await request(app)
      .post("/api/auth/signup")
      .send({
        username: "loginuser",
        email: "login@example.com",
        password: "password123"
      });
  }, 10000);
  
  test("Doit retourner un token JWT valide", async () => {
    const response = await request(app)
      .post("/api/auth/signin")
      .send({
        username: "loginuser",
        password: "password123"
      });
    
    expect(response.statusCode).toBe(200);
    expect(response.body.accessToken).toBeDefined();
    expect(response.body.id).toBeDefined();
    expect(response.body.username).toBe("loginuser");
    expect(response.body.email).toBe("login@example.com");
  }, 10000);
  
  test("Doit rejeter un mauvais mot de passe", async () => {
    const response = await request(app)
      .post("/api/auth/signin")
      .send({
        username: "loginuser",
        password: "wrongpassword"
      });
    
    expect(response.statusCode).toBe(401);
    expect(response.body.message).toBe("Invalid Password!");
  }, 10000);
});

describe("IT-03 : Test Middleware Auth", () => {
  let token;
  
  beforeAll(() => {
    checkMongoConnection();
  });

  beforeEach(async () => {
    // Créer un utilisateur et obtenir le token
    await request(app)
      .post("/api/auth/signup")
      .send({
        username: "authuser",
        email: "auth@example.com",
        password: "password123"
      });
    
    const loginResponse = await request(app)
      .post("/api/auth/signin")
      .send({
        username: "authuser",
        password: "password123"
      });
    
    token = loginResponse.body.accessToken;
  }, 15000);
  
  test("Doit autoriser l'accès avec token valide", async () => {
    const response = await request(app)
      .get("/api/test/user")
      .set("x-access-token", token);
    
    expect(response.statusCode).toBe(200);
    expect(response.body).toBeDefined();
    // Vérifier simplement que la réponse est réussie
  }, 10000);
  
  test("Doit rejeter l'accès sans token", async () => {
    const response = await request(app)
      .get("/api/test/user");
    
    expect(response.statusCode).toBe(403);
    expect(response.body.message).toBe("No token provided!");
  }, 10000);
});

describe("IT-04 : Test Rôles et Autorisations", () => {
  beforeAll(() => {
    checkMongoConnection();
  });

  test("Doit autoriser l'accès user à /api/test/user", async () => {
    // Créer un utilisateur normal
    await request(app)
      .post("/api/auth/signup")
      .send({
        username: "normaluser",
        email: "normal@example.com",
        password: "password123",
        roles: ["user"]
      });
    
    const userLogin = await request(app)
      .post("/api/auth/signin")
      .send({
        username: "normaluser",
        password: "password123"
      });
    
    const userToken = userLogin.body.accessToken;
    
    const response = await request(app)
      .get("/api/test/user")
      .set("x-access-token", userToken);
    
    expect(response.statusCode).toBe(200);
  }, 15000);
});