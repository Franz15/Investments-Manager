import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';
import dotenv from 'dotenv';
import User from '../models/User.js';

dotenv.config();
dotenv.config({ path: '.env.local', override: true });

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/investments-manager';
const DEFAULT_PASSWORD = 'MiguelAngel2026!';

async function createUserMiguelAngel() {
  try {
    await mongoose.connect(MONGODB_URI);
    console.log('Conectado a MongoDB');

    const existingUser = await User.findOne({ id: 'miguelangel' });
    if (existingUser) {
      console.log("⚠ El usuario 'miguelangel' ya existe en la base de datos.");
      console.log(`  Nombre: ${existingUser.name}`);
      console.log(`  Avatar: ${existingUser.avatar}`);
      console.log(`  Color: ${existingUser.color}`);
      await mongoose.connection.close();
      process.exit(0);
    }

    const hashedPassword = await bcrypt.hash(DEFAULT_PASSWORD, 10);

    const newUser = new User({
      id: 'miguelangel',
      name: 'Miguel Ángel',
      avatar: '👨',
      color: '#0ea5e9',
      password: hashedPassword,
      role: 'user',
    });

    await newUser.save();
    console.log("✓ Usuario 'Miguel Ángel' creado exitosamente");
    console.log(`  ID: miguelangel`);
    console.log(`  Nombre: Miguel Ángel`);
    console.log(`  Rol: user`);
    console.log(`  Contraseña: ${DEFAULT_PASSWORD}`);
    console.log(
      '\n⚠️ IMPORTANTE: Cambia la contraseña desde el perfil de usuario después del primer inicio de sesión.'
    );
  } catch (error) {
    console.error('Error al crear usuario:', error);
    if (error.code === 11000) {
      console.error("El usuario 'miguelangel' ya existe en la base de datos.");
    }
    process.exit(1);
  } finally {
    await mongoose.connection.close();
    console.log('\nConexión cerrada');
    process.exit(0);
  }
}

createUserMiguelAngel();
