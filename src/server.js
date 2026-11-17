import mongoose from 'mongoose';
import app from './app.js';

for (const key of ['MONGODB_URI', 'JWT_SECRET']) {
  if (!process.env[key]) throw new Error(`${key} is not set`);
}

await mongoose.connect(process.env.MONGODB_URI);
const port = process.env.PORT || 4000;
app.listen(port, () => console.log(`API listening on :${port}`));
