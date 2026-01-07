import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';
import dotenv from 'dotenv';
import User from '../models/User.js';

dotenv.config();

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/investments-manager';
const DEFAULT_PASSWORD = 'admin';

const usersToInitialize = [
  { id: 'javier', name: 'Javier', avatar: '👨', color: '#3b82f6' },
  { id: 'ana', name: 'Ana', avatar: '👩', color: '#ec4899' },
  { id: 'test-dca', name: 'Test DCA', avatar: '🧪', color: '#10b981' },
];

async function initializePasswords() {
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

    // Inicializar usuarios
    for (const userData of usersToInitialize) {
      try {
        // Intentar actualizar solo la contraseña si el usuario existe
        const updateResult = await User.updateOne(
          { id: userData.id },
          { $set: { password: hashedPassword } },
          { runValidators: false }
        );

        if (updateResult.matchedCount > 0) {
          console.log(`✓ Contraseña actualizada para usuario: ${userData.id}`);
        } else {
          // Si el usuario no existe, intentar crearlo
          try {
            // Usar findOneAndUpdate con upsert pero solo si no existe
            const result = await User.findOneAndUpdate(
              { id: userData.id },
              {
                $setOnInsert: {
                  id: userData.id,
                  name: userData.name,
                  avatar: userData.avatar,
                  color: userData.color,
                  password: hashedPassword,
                }
              },
              {
                upsert: true,
                new: true,
                setDefaultsOnInsert: true,
                runValidators: false
              }
            );
            if (result) {
              console.log(`✓ Usuario creado: ${userData.id}`);
            }
          } catch (createError) {
            // Si falla la creación, el usuario puede existir con estructura diferente
            // Intentar actualizar directamente usando el modelo
            try {
              const existingUser = await User.findOne({ id: userData.id });
              if (existingUser) {
                existingUser.password = hashedPassword;
                await existingUser.save({ validateBeforeSave: false });
                console.log(`✓ Contraseña actualizada para usuario existente: ${userData.id}`);
              } else {
                console.warn(`⚠ Usuario ${userData.id} no encontrado y no se pudo crear: ${createError.message}`);
              }
            } catch (saveError) {
              console.error(`✗ Error procesando usuario ${userData.id}:`, saveError.message);
            }
          }
        }
      } catch (error) {
        console.error(`✗ Error procesando usuario ${userData.id}:`, error.message);
      }
    }

    console.log('\n✓ Proceso completado. Todos los usuarios tienen la contraseña "admin"');
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

initializePasswords();
