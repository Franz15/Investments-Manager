import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';
import dotenv from 'dotenv';

dotenv.config();

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/investments-manager';
const DEFAULT_PASSWORD = 'admin';

const usersToFix = ['javier', 'ana', 'test-dca'];

async function fixUserPasswords() {
  try {
    // Conectar a MongoDB
    await mongoose.connect(MONGODB_URI, {
      useNewUrlParser: true,
      useUnifiedTopology: true,
    });
    console.log('Conectado a MongoDB');

    // Hashear la contraseña por defecto
    const hashedPassword = await bcrypt.hash(DEFAULT_PASSWORD, 10);
    console.log(`Contraseña hasheada: ${hashedPassword.substring(0, 20)}...`);

    // Obtener la colección directamente
    const db = mongoose.connection.db;
    const usersCollection = db.collection('users');

    // Actualizar contraseñas directamente en la base de datos
    for (const userId of usersToFix) {
      try {
        const result = await usersCollection.updateOne(
          { id: userId },
          { $set: { password: hashedPassword } },
          { upsert: false } // Solo actualizar si existe
        );

        if (result.matchedCount > 0) {
          console.log(`✓ Contraseña actualizada para usuario: ${userId}`);
        } else {
          console.warn(`⚠ Usuario ${userId} no encontrado en la base de datos`);
        }
      } catch (error) {
        console.error(`✗ Error procesando usuario ${userId}:`, error.message);
      }
    }

    console.log('\n✓ Proceso completado.');
    console.log('⚠️ IMPORTANTE: Cambia las contraseñas desde el perfil de usuario después del primer inicio de sesión.');

  } catch (error) {
    console.error('Error:', error);
    process.exit(1);
  } finally {
    await mongoose.connection.close();
    console.log('Conexión cerrada');
    process.exit(0);
  }
}

fixUserPasswords();
