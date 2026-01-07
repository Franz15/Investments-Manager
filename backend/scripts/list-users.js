import mongoose from "mongoose";
import dotenv from "dotenv";

dotenv.config();

const MONGODB_URI =
  process.env.MONGODB_URI || "mongodb://localhost:27017/investments-manager";

async function listUsers() {
  try {
    await mongoose.connect(MONGODB_URI, {
      useNewUrlParser: true,
      useUnifiedTopology: true,
    });
    console.log("Conectado a MongoDB\n");

    const db = mongoose.connection.db;
    const usersCollection = db.collection("users");

    // Listar todos los usuarios
    const users = await usersCollection.find({}).toArray();

    console.log(`Usuarios encontrados: ${users.length}\n`);
    users.forEach((user) => {
      console.log(`- ID: ${user.id}`);
      console.log(`  Nombre: ${user.name || "N/A"}`);
      console.log(`  Tiene contraseña: ${user.password ? "Sí" : "No"}`);
      console.log(`  Email: ${user.email || "N/A"}`);
      console.log("");
    });

    // Listar índices
    console.log("\nÍndices en la colección users:");
    const indexes = await usersCollection.indexes();
    indexes.forEach((index) => {
      console.log(`- ${JSON.stringify(index.key)}`);
    });
  } catch (error) {
    console.error("Error:", error);
    process.exit(1);
  } finally {
    await mongoose.connection.close();
    process.exit(0);
  }
}

listUsers();
