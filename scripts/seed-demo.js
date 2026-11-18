import mongoose from 'mongoose';
import { seedDemo, DEMO_ADMIN, DEMO_PASSWORD } from './demo-data.js';

if (!process.env.MONGODB_URI) {
  console.error('Set MONGODB_URI');
  process.exit(1);
}
await mongoose.connect(process.env.MONGODB_URI);
await mongoose.model('User').init();
console.log('Seeded', await seedDemo());
console.log(`Login: ${DEMO_ADMIN} (admin) or user1@demo.test .. user30@demo.test, password ${DEMO_PASSWORD}`);
await mongoose.disconnect();
