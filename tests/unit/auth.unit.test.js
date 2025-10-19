const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const config = require("../../app/config/auth.config");

describe("UT-01 : Tests Unitaires - Hashage Password", () => {
  test("Doit hasher le mot de passe correctement", () => {
    const password = "password123";
    const hashedPassword = bcrypt.hashSync(password, 8);
    
    expect(hashedPassword).toBeDefined();
    expect(hashedPassword).not.toBe(password);
    expect(bcrypt.compareSync(password, hashedPassword)).toBe(true);
  });
  
  test("Doit rejeter un mauvais mot de passe", () => {
    const password = "password123";
    const wrongPassword = "wrongpass";
    const hashedPassword = bcrypt.hashSync(password, 8);
    
    expect(bcrypt.compareSync(wrongPassword, hashedPassword)).toBe(false);
  });
});

describe("UT-02 : Tests Unitaires - JWT Token", () => {
  test("Doit générer un token JWT valide", () => {
    const userId = "12345";
    const token = jwt.sign({ id: userId }, config.secret, {
      expiresIn: 86400 // 24 heures
    });
    
    expect(token).toBeDefined();
    
    const decoded = jwt.verify(token, config.secret);
    expect(decoded.id).toBe(userId);
  });
  
  test("Doit rejeter un token expiré", (done) => {
    const token = jwt.sign({ id: "12345" }, config.secret, {
      expiresIn: 1 // 1 seconde
    });
    
    setTimeout(() => {
      expect(() => {
        jwt.verify(token, config.secret);
      }).toThrow();
      done();
    }, 2000);
  });
});

describe("UT-04 : Validation Email", () => {
  const validateEmail = (email) => {
    if (!email) return false;
    const re = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return re.test(email);
  };
  
  test("Doit accepter un email valide", () => {
    expect(validateEmail("user@example.com")).toBe(true);
    expect(validateEmail("test.user+tag@example.co.uk")).toBe(true);
  });
  
  test("Doit rejeter un email invalide", () => {
    expect(validateEmail("invalid-email")).toBe(false);
    expect(validateEmail("@example.com")).toBe(false);
    expect(validateEmail("user@")).toBe(false);
    expect(validateEmail("user@.com")).toBe(false);
    expect(validateEmail("")).toBe(false);
    expect(validateEmail(null)).toBe(false);
    expect(validateEmail(undefined)).toBe(false);
  });
});

describe("UT-05 : Validation Password", () => {
  const validatePassword = (password) => {
    return !!(password && password.length >= 6);
  };
  
  test("Doit accepter un password valide", () => {
    expect(validatePassword("password123")).toBe(true);
    expect(validatePassword("123456")).toBe(true);
    expect(validatePassword("abcdef")).toBe(true);
  });
  
  test("Doit rejeter un password trop court", () => {
    expect(validatePassword("12345")).toBe(false);
    expect(validatePassword("")).toBe(false);
    expect(validatePassword(null)).toBe(false);
    expect(validatePassword(undefined)).toBe(false);
  });
});

describe("UT-06 : Validation Username", () => {
  const validateUsername = (username) => {
    return !!(username && username.length >= 3 && username.length <= 20);
  };
  
  test("Doit accepter un username valide", () => {
    expect(validateUsername("john")).toBe(true);
    expect(validateUsername("johndoe123")).toBe(true);
    expect(validateUsername("user_name")).toBe(true);
  });
  
  test("Doit rejeter un username invalide", () => {
    expect(validateUsername("ab")).toBe(false); // Trop court
    expect(validateUsername("thisusernameistoolong123")).toBe(false); // Trop long
    expect(validateUsername("")).toBe(false);
    expect(validateUsername(null)).toBe(false);
    expect(validateUsername(undefined)).toBe(false);
  });
});

describe("UT-07 : Formatage des Réponses", () => {
  const formatUserResponse = (user) => {
    if (!user) return null;
    return {
      id: user._id,
      username: user.username,
      email: user.email,
      roles: user.roles
    };
  };
  
  test("Doit formater correctement la réponse utilisateur", () => {
    const mockUser = {
      _id: "507f1f77bcf86cd799439011",
      username: "testuser",
      email: "test@example.com",
      password: "hashedpassword",
      roles: ["user"]
    };
    
    const formatted = formatUserResponse(mockUser);
    
    expect(formatted.id).toBe(mockUser._id);
    expect(formatted.username).toBe(mockUser.username);
    expect(formatted.email).toBe(mockUser.email);
    expect(formatted.roles).toEqual(mockUser.roles);
    expect(formatted.password).toBeUndefined(); // Le password ne doit pas être inclus
  });
  
  test("Doit retourner null pour un utilisateur null", () => {
    expect(formatUserResponse(null)).toBe(null);
    expect(formatUserResponse(undefined)).toBe(null);
  });
});

describe("UT-08 : Vérification des Rôles", () => {
  const hasRole = (userRoles, requiredRole) => {
    return !!(userRoles && userRoles.includes(requiredRole));
  };
  
  test("Doit vérifier la présence d'un rôle", () => {
    const userRoles = ["user", "moderator"];
    
    expect(hasRole(userRoles, "user")).toBe(true);
    expect(hasRole(userRoles, "moderator")).toBe(true);
    expect(hasRole(userRoles, "admin")).toBe(false);
    expect(hasRole([], "user")).toBe(false);
    expect(hasRole(null, "user")).toBe(false);
    expect(hasRole(undefined, "user")).toBe(false);
  });
});

describe("UT-09 : Génération de Token de Rafraîchissement", () => {
  test("Doit générer un token de rafraîchissement", () => {
    const userId = "12345";
    const refreshToken = jwt.sign({ id: userId, type: "refresh" }, config.secret, {
      expiresIn: 604800 // 7 jours
    });
    
    expect(refreshToken).toBeDefined();
    
    const decoded = jwt.verify(refreshToken, config.secret);
    expect(decoded.id).toBe(userId);
    expect(decoded.type).toBe("refresh");
  });
  
  test("Doit différencier access token et refresh token", () => {
    const userId = "12345";
    
    const accessToken = jwt.sign({ id: userId }, config.secret, {
      expiresIn: 900 // 15 minutes
    });
    
    const refreshToken = jwt.sign({ id: userId, type: "refresh" }, config.secret, {
      expiresIn: 604800 // 7 jours
    });
    
    const decodedAccess = jwt.verify(accessToken, config.secret);
    const decodedRefresh = jwt.verify(refreshToken, config.secret);
    
    expect(decodedAccess.type).toBeUndefined();
    expect(decodedRefresh.type).toBe("refresh");
  });
});

describe("UT-10 : Validation des Données Utilisateur", () => {
  const validateUserData = (userData) => {
    if (!userData) return false;
    const { username, email, password } = userData;
    return !!(username && email && password);
  };
  
  test("Doit accepter des données utilisateur valides", () => {
    const validUser = {
      username: "testuser",
      email: "test@example.com",
      password: "password123"
    };
    expect(validateUserData(validUser)).toBe(true);
  });
  
  test("Doit rejeter des données utilisateur incomplètes", () => {
    expect(validateUserData({ username: "test", email: "test@example.com" })).toBe(false);
    expect(validateUserData({ username: "test", password: "pass" })).toBe(false);
    expect(validateUserData({ email: "test@example.com", password: "pass" })).toBe(false);
    expect(validateUserData(null)).toBe(false);
    expect(validateUserData(undefined)).toBe(false);
    expect(validateUserData({})).toBe(false);
  });
});