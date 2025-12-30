import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const envContent = `PORT=5000
MONGODB_URI=mongodb+srv://admin:admin@cluster0.37qcd.mongodb.net/investments-manager?retryWrites=true&w=majority&appName=Cluster0
JWT_SECRET=your-secret-key-change-in-production
NODE_ENV=development
`;

const envPath = path.join(__dirname, '.env');

if (!fs.existsSync(envPath)) {
  fs.writeFileSync(envPath, envContent);
  console.log('✅ Archivo .env creado exitosamente');
} else {
  console.log('⚠️  El archivo .env ya existe. No se ha sobrescrito.');
  console.log('Si deseas actualizarlo, elimínalo primero y vuelve a ejecutar este script.');
}

