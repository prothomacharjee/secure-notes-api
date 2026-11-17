import mongoose from 'mongoose';
import User from '../src/models/User.js';

const { MONGODB_URI, ADMIN_NAME = 'Admin', ADMIN_EMAIL, ADMIN_PASSWORD } = process.env;
if (!MONGODB_URI || !ADMIN_EMAIL || !ADMIN_PASSWORD) {
  console.error('Set MONGODB_URI, ADMIN_EMAIL and ADMIN_PASSWORD');
  process.exit(1);
}

await mongoose.connect(MONGODB_URI);
await User.init();
const existing = await User.findOne({ email: ADMIN_EMAIL.toLowerCase() });
const admin = existing ?? new User({ name: ADMIN_NAME, email: ADMIN_EMAIL });
admin.set({ role: 'admin', password: ADMIN_PASSWORD });
await admin.save();
console.log(`${existing ? 'Updated' : 'Created'} admin ${admin.email}`);
await mongoose.disconnect();
