import { PrismaClient } from '@prisma/client';
import { hashPassword } from '../src/lib/crypto';

async function main() {
  // Ensure the database connection is loaded from the environment variables (e.g. tls_e2e_test during our local run)
  const prisma = new PrismaClient();

  try {
    console.log('🔄 Fetching all admin users from database...');
    const users = await prisma.adminUser.findMany();
    console.log(`📊 Found ${users.length} total users in database.`);

    let updatedCount = 0;
    let skippedCount = 0;

    for (const user of users) {
      const isAlreadyHashed = user.password.startsWith('scrypt:');
      
      if (isAlreadyHashed) {
        console.log(`⏭️  User "${user.name}" (${user.email}) is already hashed. Skipping.`);
        skippedCount++;
      } else {
        console.log(`🔒 Encrypting password for user "${user.name}" (${user.email})...`);
        const hashedPassword = hashPassword(user.password);
        
        await prisma.adminUser.update({
          where: { id: user.id },
          data: { password: hashedPassword }
        });
        
        console.log(`✅ User "${user.name}" password updated to scrypt.`);
        updatedCount++;
      }
    }

    console.log('\n====================================================');
    console.log('📊 Bulk Password Encryption Summary:');
    console.log(`   - Total Users: ${users.length}`);
    console.log(`   - Successfully Encrypted: ${updatedCount}`);
    console.log(`   - Already Encrypted (Skipped): ${skippedCount}`);
    console.log('====================================================');

  } catch (err: any) {
    console.error('❌ Error during bulk encryption:', err.message || err);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch(console.error);
