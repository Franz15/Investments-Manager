import mongoose from 'mongoose';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Cargar variables de entorno
dotenv.config({ path: join(__dirname, '../.env') });

// Importar modelos
import Account from '../models/Account.js';
import SubAccount from '../models/SubAccount.js';
import Investment from '../models/Investment.js';
import InvestmentHistory from '../models/InvestmentHistory.js';

async function deleteTestDCAData() {
  try {
    // Conectar a MongoDB
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('Conectado a MongoDB\n');

    const userId = 'javier';

    // Buscar y eliminar la inversión de prueba
    const testInvestment = await Investment.findOne({ 
      user: userId, 
      name: 'Inversión DCA Test'
    });
    
    if (testInvestment) {
      // Eliminar historial asociado
      await InvestmentHistory.deleteMany({ investment: testInvestment._id });
      await Investment.deleteOne({ _id: testInvestment._id });
      console.log('✅ Inversión de prueba eliminada');
    }

    // Buscar y eliminar la subcuenta de prueba
    const testSubAccount = await SubAccount.findOne({ 
      user: userId, 
      name: 'Subcuenta DCA Test'
    });
    
    if (testSubAccount) {
      await SubAccount.deleteOne({ _id: testSubAccount._id });
      console.log('✅ Subcuenta de prueba eliminada');
    }

    // Buscar y eliminar la cuenta de prueba
    const testAccount = await Account.findOne({ 
      user: userId, 
      name: 'Cuenta Prueba DCA'
    });
    
    if (testAccount) {
      await Account.deleteOne({ _id: testAccount._id });
      console.log('✅ Cuenta de prueba eliminada');
    }

    console.log('\n✅ Datos de prueba eliminados exitosamente!');

    await mongoose.disconnect();
    console.log('\nDesconectado de MongoDB');
  } catch (error) {
    console.error('Error:', error);
    await mongoose.disconnect();
    process.exit(1);
  }
}

deleteTestDCAData();
