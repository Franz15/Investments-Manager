import dotenv from "dotenv";
import { fileURLToPath } from "url";
import { dirname, join } from "path";
import { readFileSync, writeFileSync, existsSync } from "fs";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Cargar .env.local si existe, sino .env
const envLocalPath = join(__dirname, "..", ".env.local");
const envPath = join(__dirname, "..", ".env");

let envContent = "";
let envFile = "";

if (existsSync(envLocalPath)) {
  envContent = readFileSync(envLocalPath, "utf-8");
  envFile = ".env.local";
  dotenv.config({ path: envLocalPath });
} else if (existsSync(envPath)) {
  envContent = readFileSync(envPath, "utf-8");
  envFile = ".env";
  dotenv.config({ path: envPath });
} else {
  console.log("❌ No se encontró archivo .env ni .env.local");
  process.exit(1);
}

const currentUri = process.env.MONGODB_URI || "";

console.log(`📄 Archivo de configuración: ${envFile}`);
console.log(`\n🔍 URI actual:`);
if (currentUri) {
  // Ocultar la contraseña por seguridad
  const maskedUri = currentUri.replace(/:([^:@]+)@/, ":****@");
  console.log(`   ${maskedUri}`);
} else {
  console.log(`   (vacía o no definida)`);
}

if (!currentUri || !currentUri.startsWith("mongodb")) {
  console.log(`\n❌ La URI de MongoDB no está configurada correctamente`);
  console.log(`\n💡 Necesitas agregar la URI completa en ${envFile}:`);
  console.log(
    `   MONGODB_URI=***REMOVED***`,
  );
  process.exit(1);
}

// Verificar si tiene nombre de base de datos
const uriMatch = currentUri.match(/mongodb(\+srv)?:\/\/[^/]+\/([^?]+)/);
const dbName = uriMatch ? uriMatch[2] : null;

if (dbName) {
  console.log(`\n✅ La URI incluye el nombre de la base de datos: "${dbName}"`);
  if (dbName !== "investments-manager") {
    console.log(
      `\n⚠️  ADVERTENCIA: El nombre de la base de datos es "${dbName}"`,
    );
    console.log(`   Los datos están en "investments-manager"`);

    // Corregir automáticamente
    const correctedUri = currentUri.replace(
      /\/[^/?]+(\?|$)/,
      `/investments-manager$1`,
    );
    const maskedCorrected = correctedUri.replace(/:([^:@]+)@/, ":****@");

    console.log(`\n🔧 URI corregida:`);
    console.log(`   ${maskedCorrected}`);

    // Actualizar el archivo
    const newEnvContent = envContent.replace(
      /MONGODB_URI=.*/,
      `MONGODB_URI=${correctedUri}`,
    );

    writeFileSync(envLocalPath, newEnvContent, "utf-8");
    console.log(`\n✅ Archivo ${envFile} actualizado correctamente`);
    console.log(`\n🔄 Reinicia el servidor backend para aplicar los cambios`);
  } else {
    console.log(
      `\n✅ El nombre de la base de datos es correcto: "investments-manager"`,
    );
  }
} else {
  console.log(`\n❌ La URI NO incluye el nombre de la base de datos`);
  console.log(`   Mongoose usará "test" por defecto`);

  // Corregir automáticamente
  const correctedUri = currentUri.endsWith("/")
    ? `${currentUri}investments-manager`
    : `${currentUri}/investments-manager`;
  const maskedCorrected = correctedUri.replace(/:([^:@]+)@/, ":****@");

  console.log(`\n🔧 URI corregida:`);
  console.log(`   ${maskedCorrected}`);

  // Actualizar el archivo
  let newEnvContent;
  if (envContent.includes("MONGODB_URI=")) {
    newEnvContent = envContent.replace(
      /MONGODB_URI=.*/,
      `MONGODB_URI=${correctedUri}`,
    );
  } else {
    newEnvContent = envContent + `\nMONGODB_URI=${correctedUri}\n`;
  }

  writeFileSync(envLocalPath, newEnvContent, "utf-8");
  console.log(`\n✅ Archivo ${envFile} actualizado correctamente`);
  console.log(`\n🔄 Reinicia el servidor backend para aplicar los cambios`);
}
